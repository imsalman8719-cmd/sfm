import {
  Injectable, NotFoundException, BadRequestException, ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { v4 as uuidv4 } from 'uuid';
import { format, addDays, addMonths, addQuarters } from 'date-fns';
import { FeeInvoice } from './entities/fee-invoice.entity';
import { FeeWaiver } from './entities/fee-waiver.entity';
import { Student } from '../students/entities/student.entity';
import { FeeStructure } from '../fee-structures/entities/fee-structure.entity';
import { Discount } from '../fee-structures/entities/discount.entity';
import { StudentFeePlan } from '../student-fee-plans/entities/student-fee-plan.entity';
import { AcademicYear } from '../academic-years/entities/academic-year.entity';
import { GlobalSettings } from '../settings/entities/global-settings.entity';
import {
  GenerateInvoiceDto, BulkGenerateInvoiceDto,
  CancelInvoiceDto, ApplyWaiverDto, ReviewWaiverDto, InvoiceFilterDto,
} from './dto/fee-invoice.dto';
import { PaginationDto, PaginatedResult } from '../../common/dto/pagination.dto';
import { InvoiceStatus, DiscountType, WaiverStatus, FeeFrequency } from '../../common/enums';
import { NotificationsService } from '../notifications/notifications.service';
import { FREQUENCY_MULTIPLIER } from '../student-fee-plans/student-fee-plans.service';

@Injectable()
export class FeeInvoicesService {
  constructor(
    @InjectRepository(FeeInvoice) private readonly invoiceRepo: Repository<FeeInvoice>,
    @InjectRepository(FeeWaiver) private readonly waiverRepo: Repository<FeeWaiver>,
    @InjectRepository(Student) private readonly studentRepo: Repository<Student>,
    @InjectRepository(FeeStructure) private readonly feeStructureRepo: Repository<FeeStructure>,
    @InjectRepository(Discount) private readonly discountRepo: Repository<Discount>,
    @InjectRepository(StudentFeePlan) private readonly feePlanRepo: Repository<StudentFeePlan>,
    @InjectRepository(AcademicYear) private readonly yearRepo: Repository<AcademicYear>,
    @InjectRepository(GlobalSettings) private readonly settingsRepo: Repository<GlobalSettings>,
    private readonly dataSource: DataSource,
    private readonly notificationsService: NotificationsService,
  ) { }

  // ── Invoice Generation ──────────────────────────────────────────────────────

  async generateInvoice(dto: GenerateInvoiceDto, createdBy?: string): Promise<FeeInvoice> {
    return this.dataSource.transaction(async (manager) => {
      const student = await manager.findOne(Student, {
        where: { id: dto.studentId },
        relations: ['user', 'class', 'academicYear'],
      });
      if (!student) throw new NotFoundException('Student not found');

      // Resolve fee line items from student fee plan OR class defaults
      const studentPlans = await manager.find(StudentFeePlan, {
        where: { studentId: dto.studentId, academicYearId: dto.academicYearId, isActive: true },
        relations: ['feeStructure'],
      });

      interface LineItemInput { feeStructure: FeeStructure; effectiveAmount: number; }
      let lineItemInputs: LineItemInput[];

      if (studentPlans.length > 0) {
        lineItemInputs = studentPlans
          .filter(p => p.feeStructure?.isActive)
          .map(plan => {
            const base = Number(plan.feeStructure.amount);
            const multiplier = FREQUENCY_MULTIPLIER[plan.billingFrequency] ?? 1;
            const effectiveAmount = (plan.customAmount !== null && plan.customAmount !== undefined)
              ? Number(plan.customAmount)
              : base * multiplier;
            return { feeStructure: plan.feeStructure, effectiveAmount };
          });
        if (!lineItemInputs.length)
          throw new BadRequestException('Student has a fee plan but all assigned fee structures are inactive.');
      } else {
        if (!student.classId)
          throw new BadRequestException('Student has no fee plan and is not assigned to a class.');
        let feeStructures: FeeStructure[];
        if (dto.feeStructureIds?.length) {
          feeStructures = await manager.find(FeeStructure, { where: { id: In(dto.feeStructureIds), isActive: true } });
        } else {
          feeStructures = await manager.createQueryBuilder(FeeStructure, 'fs')
            .where('fs.academic_year_id = :ay', { ay: dto.academicYearId })
            .andWhere('fs.is_active = true')
            .andWhere('(fs.class_id = :classId OR fs.class_id IS NULL)', { classId: student.classId })
            .getMany();
        }
        if (!feeStructures.length)
          throw new BadRequestException('No applicable fee structures found for this student.');
        lineItemInputs = feeStructures.map(fs => ({ feeStructure: fs, effectiveAmount: Number(fs.amount) }));
      }

      // Apply discounts
      const discounts = await manager.find(Discount, {
        where: [{ studentId: dto.studentId, academicYearId: dto.academicYearId, isActive: true }],
      });

      let subtotal = 0;
      let totalDiscount = 0;
      const lineItems = lineItemInputs.map(({ feeStructure: fs, effectiveAmount }) => {
        const feeAmount = effectiveAmount;
        const disc = discounts.find(d => !d.feeStructureId || d.feeStructureId === fs.id);
        let discountAmount = 0;
        if (disc) {
          discountAmount = disc.type === DiscountType.PERCENTAGE
            ? (feeAmount * disc.value) / 100
            : Math.min(disc.value, feeAmount);
        }
        subtotal += feeAmount;
        totalDiscount += discountAmount;
        return { feeStructureId: fs.id, feeName: fs.name, category: fs.category, amount: feeAmount, discountAmount, netAmount: feeAmount - discountAmount };
      });

      const totalAmount = subtotal - totalDiscount;
      const invoice = manager.create(FeeInvoice, {
        invoiceNumber: this.generateInvoiceNumber(),
        studentId: dto.studentId, academicYearId: dto.academicYearId,
        billingMonth: dto.billingMonth, billingYear: dto.billingYear,
        billingQuarter: dto.billingQuarter,
        billingLabel: dto.billingLabel || this.buildBillingLabel(dto),
        issueDate: new Date(dto.issueDate), dueDate: new Date(dto.dueDate),
        status: InvoiceStatus.ISSUED,
        subtotal, discountAmount: totalDiscount, lateFeeAmount: 0,
        totalAmount, paidAmount: 0, balanceAmount: totalAmount, waivedAmount: 0,
        lineItems, notes: dto.notes, createdBy,
      });

      const saved = await manager.save(FeeInvoice, invoice);
      this.notificationsService.sendInvoiceNotification(saved, student).catch(() => { });
      return saved;
    });
  }

  async bulkGenerateInvoices(dto: BulkGenerateInvoiceDto, createdBy?: string): Promise<{ generated: number; skipped: number; errors: string[] }> {
    const qb = this.studentRepo.createQueryBuilder('s')
      .where('s.academic_year_id = :ay', { ay: dto.academicYearId })
      .andWhere('s.is_active = true')
      .andWhere('s.deleted_at IS NULL');
    if (dto.classId) qb.andWhere('s.class_id = :classId', { classId: dto.classId });

    const students = await qb.getMany();
    let generated = 0; let skipped = 0; const errors: string[] = [];

    for (const student of students) {
      try {
        if (dto.billingMonth && dto.billingYear) {
          const existing = await this.invoiceRepo.findOne({
            where: { studentId: student.id, billingMonth: dto.billingMonth, billingYear: dto.billingYear },
          });
          if (existing) { skipped++; continue; }
        }
        await this.generateInvoice({
          studentId: student.id, academicYearId: dto.academicYearId,
          billingMonth: dto.billingMonth, billingYear: dto.billingYear,
          billingQuarter: dto.billingQuarter, billingLabel: dto.billingLabel,
          issueDate: dto.issueDate, dueDate: dto.dueDate, feeStructureIds: dto.feeStructureIds,
        }, createdBy);
        generated++;
      } catch (e) {
        errors.push(`${student.registrationNumber}: ${e.message}`);
      }
    }
    return { generated, skipped, errors };
  }

  // ── Invoice Retrieval ───────────────────────────────────────────────────────

  async findAll(pagination: PaginationDto, filters: InvoiceFilterDto): Promise<PaginatedResult<FeeInvoice>> {
    const idQb = this.invoiceRepo.createQueryBuilder('inv')
      .select('inv.id', 'id')
      .leftJoin('inv.student', 's')
      .leftJoin('s.user', 'u')
      .leftJoin('s.class', 'cls');

    if (filters.studentId) idQb.andWhere('inv.student_id = :sid', { sid: filters.studentId });
    if (filters.academicYearId) idQb.andWhere('inv.academic_year_id = :ay', { ay: filters.academicYearId });
    if (filters.classId) idQb.andWhere('cls.id = :classId', { classId: filters.classId });
    if (filters.status) idQb.andWhere('inv.status = :status', { status: filters.status });
    if (filters.billingMonth) idQb.andWhere('inv.billing_month = :month', { month: filters.billingMonth });
    if (filters.billingYear) idQb.andWhere('inv.billing_year = :year', { year: filters.billingYear });
    if (filters.billingQuarter) idQb.andWhere('inv.billing_quarter = :q', { q: filters.billingQuarter });
    if (filters.fromDate) idQb.andWhere('inv.issue_date >= :from', { from: filters.fromDate });
    if (filters.toDate) idQb.andWhere('inv.issue_date <= :to', { to: filters.toDate });
    if (pagination.search) {
      idQb.andWhere(
        '(inv.invoice_number ILIKE :q OR u.first_name ILIKE :q OR u.last_name ILIKE :q OR s.registration_number ILIKE :q)',
        { q: `%${pagination.search}%` },
      );
    }

    const total = await idQb.getCount();
    const ids = await idQb
      .orderBy('inv.created_at', 'DESC').addOrderBy('inv.id', 'ASC')
      .offset(pagination.skip).limit(pagination.limit)
      .getRawMany().then(rows => rows.map(r => r.id));

    const data = ids.length
      ? await this.invoiceRepo.find({ where: { id: In(ids) }, relations: ['student', 'student.user', 'student.class', 'academicYear'] })
      : [];
    const ordered = ids.map(id => data.find(inv => inv.id === id)).filter(Boolean) as FeeInvoice[];
    return new PaginatedResult(ordered, total, pagination.page, pagination.limit);
  }

  async findOne(id: string): Promise<FeeInvoice> {
    const inv = await this.invoiceRepo.findOne({ where: { id }, relations: ['student', 'student.user', 'student.class', 'academicYear'] });
    if (!inv) throw new NotFoundException(`Invoice #${id} not found`);
    return inv;
  }

  async findByInvoiceNumber(invoiceNumber: string): Promise<FeeInvoice> {
    const inv = await this.invoiceRepo.findOne({ where: { invoiceNumber }, relations: ['student', 'student.user', 'student.class', 'academicYear'] });
    if (!inv) throw new NotFoundException(`Invoice ${invoiceNumber} not found`);
    return inv;
  }

  async findStudentInvoices(studentId: string, academicYearId?: string): Promise<FeeInvoice[]> {
    const where: any = { studentId };
    if (academicYearId) where.academicYearId = academicYearId;
    return this.invoiceRepo.find({ where, relations: ['academicYear'], order: { issueDate: 'DESC' } });
  }

  async getStudentLedger(studentId: string, academicYearId?: string) {
    const invoices = await this.findStudentInvoices(studentId, academicYearId);
    const totalBilled = invoices.reduce((s, i) => s + Number(i.totalAmount), 0);
    const totalPaid = invoices.reduce((s, i) => s + Number(i.paidAmount), 0);
    const totalWaived = invoices.reduce((s, i) => s + Number(i.waivedAmount), 0);
    const totalDue = invoices.reduce((s, i) => s + Number(i.balanceAmount), 0);
    const overdueInvoices = invoices.filter(i => i.status === InvoiceStatus.OVERDUE);
    return {
      invoices,
      summary: {
        totalBilled, totalPaid, totalWaived, totalDue,
        overdueCount: overdueInvoices.length,
        overdueDue: overdueInvoices.reduce((s, i) => s + Number(i.balanceAmount), 0)
      },
    };
  }

  // ── Invoice Actions ─────────────────────────────────────────────────────────

  async cancelInvoice(id: string, dto: CancelInvoiceDto, cancelledBy: string): Promise<FeeInvoice> {
    const inv = await this.findOne(id);
    if (inv.status === InvoiceStatus.PAID) throw new BadRequestException('Cannot cancel a fully paid invoice');
    if (inv.status === InvoiceStatus.CANCELLED) throw new ConflictException('Invoice already cancelled');
    inv.status = InvoiceStatus.CANCELLED;
    inv.cancelledBy = cancelledBy;
    inv.cancelledAt = new Date();
    inv.cancellationReason = dto.reason;
    return this.invoiceRepo.save(inv);
  }

  async recordPayment(invoiceId: string, amountPaid: number): Promise<FeeInvoice> {
    const inv = await this.findOne(invoiceId);
    if (inv.status === InvoiceStatus.CANCELLED) throw new BadRequestException('Invoice is cancelled');
    if (inv.status === InvoiceStatus.PAID) throw new ConflictException('Invoice already fully paid');
    inv.paidAmount = Number(inv.paidAmount) + amountPaid;
    inv.balanceAmount = Number(inv.totalAmount) - Number(inv.paidAmount) - Number(inv.waivedAmount);
    if (inv.balanceAmount <= 0) { inv.status = InvoiceStatus.PAID; inv.balanceAmount = 0; }
    else inv.status = InvoiceStatus.PARTIALLY_PAID;
    return this.invoiceRepo.save(inv);
  }

  // ── Waivers ─────────────────────────────────────────────────────────────────

  async applyWaiver(dto: ApplyWaiverDto, requestedBy?: string): Promise<FeeWaiver> {
    const inv = await this.findOne(dto.invoiceId);
    if (inv.status === InvoiceStatus.CANCELLED) throw new BadRequestException('Cannot waive a cancelled invoice');
    if (inv.status === InvoiceStatus.PAID) throw new BadRequestException('Invoice already paid');
    const waivedAmount = dto.type === DiscountType.PERCENTAGE
      ? (Number(inv.balanceAmount) * dto.value) / 100
      : Math.min(dto.value, Number(inv.balanceAmount));
    return this.waiverRepo.save(this.waiverRepo.create({
      invoiceId: dto.invoiceId, studentId: inv.studentId,
      type: dto.type, value: dto.value, waivedAmount, reason: dto.reason,
      status: WaiverStatus.PENDING, requestedBy,
    }));
  }

  async reviewWaiver(waiverId: string, dto: ReviewWaiverDto, reviewedBy: string): Promise<FeeWaiver> {
    const waiver = await this.waiverRepo.findOne({ where: { id: waiverId }, relations: ['invoice'] });
    if (!waiver) throw new NotFoundException('Waiver not found');
    if (waiver.status !== WaiverStatus.PENDING) throw new ConflictException('Waiver already reviewed');
    waiver.status = dto.status === 'approved' ? WaiverStatus.APPROVED : WaiverStatus.REJECTED;
    waiver.reviewedBy = reviewedBy;
    waiver.reviewedAt = new Date();
    waiver.reviewRemarks = dto.remarks;
    const saved = await this.waiverRepo.save(waiver);
    if (saved.status === WaiverStatus.APPROVED) {
      const inv = await this.findOne(waiver.invoiceId);
      inv.waivedAmount = Number(inv.waivedAmount) + Number(waiver.waivedAmount);
      inv.balanceAmount = Math.max(0, Number(inv.balanceAmount) - Number(waiver.waivedAmount));
      if (inv.balanceAmount <= 0) inv.status = InvoiceStatus.WAIVED;
      await this.invoiceRepo.save(inv);
    }
    return saved;
  }

  async findWaivers(filters?: { studentId?: string; status?: WaiverStatus }): Promise<FeeWaiver[]> {
    const qb = this.waiverRepo.createQueryBuilder('w')
      .leftJoinAndSelect('w.invoice', 'inv')
      .leftJoinAndSelect('w.student', 's')
      .leftJoinAndSelect('s.user', 'u');
    if (filters?.studentId) qb.andWhere('w.student_id = :sid', { sid: filters.studentId });
    if (filters?.status) qb.andWhere('w.status = :status', { status: filters.status });
    return qb.orderBy('w.created_at', 'DESC').getMany();
  }

  // ── Scheduled: Mark overdue ──────────────────────────────────────────────────

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async markOverdueInvoices(): Promise<void> {
    const settings = await this.settingsRepo.findOne({ where: { id: 'global' } });
    if (!settings?.autoOverdueMarkingEnabled) return;
    await this.invoiceRepo.createQueryBuilder()
      .update(FeeInvoice)
      .set({ status: InvoiceStatus.OVERDUE })
      .where('due_date < :today', { today: new Date() })
      .andWhere('status IN (:...statuses)', { statuses: [InvoiceStatus.ISSUED, InvoiceStatus.PARTIALLY_PAID] })
      .andWhere('balance_amount > 0')
      .execute();
  }

  // ── Scheduled: Reminders ─────────────────────────────────────────────────────

  @Cron('0 9 * * *')
  async sendPaymentReminders(): Promise<void> {
    const settings = await this.settingsRepo.findOne({ where: { id: 'global' } });
    if (!settings?.autoReminderEnabled) return;
    const dueSoon = addDays(new Date(), settings.reminderDaysBeforeDue ?? 3);
    const invoices = await this.invoiceRepo.createQueryBuilder('inv')
      .leftJoinAndSelect('inv.student', 's').leftJoinAndSelect('s.user', 'u')
      .where('inv.due_date <= :dueSoon', { dueSoon })
      .andWhere('inv.due_date >= :today', { today: new Date() })
      .andWhere('inv.status IN (:...statuses)', { statuses: [InvoiceStatus.ISSUED, InvoiceStatus.PARTIALLY_PAID] })
      .andWhere('inv.balance_amount > 0')
      .getMany();
    for (const inv of invoices) {
      inv.reminderCount += 1; inv.lastReminderAt = new Date();
      await this.invoiceRepo.save(inv);
      this.notificationsService.sendReminderNotification(inv, inv.student).catch(() => { });
    }
  }

  /**
   * ── SMART AUTO-GENERATION (runs daily at 6 AM) ───────────────────────────
   *
   * For each student, checks their fee plan frequency against today's date:
   *
   *  MONTHLY:    Generate if today == monthlyInvoiceDay AND no invoice exists for this month
   *
   *  QUARTERLY:  Generate if today == trigger day (N days before quarter end)
   *              AND the current quarter is the right one based on when they last paid.
   *              e.g. Student who paid for Q1 → next due is Q2 (months 4-6)
   *
   *  SEMI-ANNUAL: Generate if today == trigger day AND last invoice was 6 months ago
   *
   *  ANNUAL:     Generate if today == trigger day AND last invoice was 12 months ago
   *
   *  ONE_TIME:   Never auto-generated (manual only)
   *
   * This means a quarterly student only gets an invoice every 3 months,
   * not every month. The system checks their last invoice to decide.
   */
  @Cron('0 6 * * *')
  async autoGenerateInvoices(): Promise<void> {
    const settings = await this.settingsRepo.findOne({ where: { id: 'global' } });
    if (!settings?.autoInvoiceEnabled) return;

    const academicYear = await this.yearRepo.findOne({ where: { isCurrent: true } });
    if (!academicYear) return;

    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1;
    const dayOfMonth = today.getDate();
    const dueDays = settings.defaultDueDays ?? 10;
    const issueDate = format(today, 'yyyy-MM-dd');
    const dueDate = format(addDays(today, dueDays), 'yyyy-MM-dd');

    // Get all active student fee plans (grouped by student)
    const allPlans = await this.feePlanRepo.find({
      where: { academicYearId: academicYear.id, isActive: true },
      relations: ['feeStructure'],
    });

    // Group plans by student
    const plansByStudent = new Map<string, StudentFeePlan[]>();
    for (const plan of allPlans) {
      if (!plansByStudent.has(plan.studentId)) plansByStudent.set(plan.studentId, []);
      plansByStudent.get(plan.studentId).push(plan);
    }

    for (const [studentId, plans] of plansByStudent.entries()) {
      // Determine the dominant billing frequency for this student
      // (take the highest frequency plan — monthly wins over quarterly etc.)
      const dominantFreq = this.getDominantFrequency(plans.map(p => p.billingFrequency));

      if (dominantFreq === FeeFrequency.ONE_TIME || dominantFreq === FeeFrequency.CUSTOM) {
        continue; // Never auto-generate one-time or custom
      }

      try {
        const shouldGenerate = await this.shouldGenerateForStudent(
          studentId, academicYear.id, dominantFreq,
          today, dayOfMonth, currentMonth, currentYear,
          settings,
        );

        if (!shouldGenerate.generate) continue;

        await this.generateInvoice({
          studentId,
          academicYearId: academicYear.id,
          issueDate,
          dueDate,
          billingMonth: shouldGenerate.billingMonth,
          billingYear: currentYear,
          billingQuarter: shouldGenerate.billingQuarter,
          billingLabel: shouldGenerate.label,
        }, 'system-auto');
      } catch (e) {
        console.error(`[AutoInvoice] Student ${studentId}: ${e.message}`);
      }
    }
  }

  /**
   * Determines if a student should get an invoice today, based on:
   *  1. Their billing frequency
   *  2. Today's date vs the configured trigger day
   *  3. Their LAST invoice date (to avoid generating too early)
   */
  private async shouldGenerateForStudent(
    studentId: string,
    academicYearId: string,
    frequency: FeeFrequency,
    today: Date,
    dayOfMonth: number,
    currentMonth: number,
    currentYear: number,
    settings: GlobalSettings,
  ): Promise<{ generate: boolean; billingMonth?: number; billingQuarter?: number; label?: string,billingYear?: number}> {
    // Get the student's last non-cancelled invoice for this year
    const lastInvoice = await this.invoiceRepo.findOne({
      where: { studentId, academicYearId },
      order: { issueDate: 'DESC' },
    });

    const lastIssueDate = lastInvoice ? new Date(lastInvoice.issueDate) : null;

    if (frequency === FeeFrequency.MONTHLY) {
      // Only generate on the configured monthlyInvoiceDay
      if (dayOfMonth !== settings.monthlyInvoiceDay) return { generate: false };

      // Check no invoice exists for this month yet
      const existing = await this.invoiceRepo.findOne({
        where: { studentId, academicYearId, billingMonth: currentMonth, billingYear: currentYear },
      });
      if (existing) return { generate: false };

      return {
        generate: true,
        billingMonth: currentMonth,
        label: `${this.monthName(currentMonth)} ${currentYear} Fee`,
      };
    }

    if (frequency === FeeFrequency.QUARTERLY) {
      // Trigger N days before quarter end
      const quarterEnds = [
        { q: 1, month: 3, day: 31 }, { q: 2, month: 6, day: 30 },
        { q: 3, month: 9, day: 30 }, { q: 4, month: 12, day: 31 },
      ];

      for (const qe of quarterEnds) {
        const endDate = new Date(currentYear, qe.month - 1, qe.day);
        const daysLeft = Math.ceil((endDate.getTime() - today.getTime()) / 86400000);
        if (daysLeft !== settings.quarterlyInvoiceDaysBefore) continue;

        // Check if student already has an invoice for this quarter
        const existing = await this.invoiceRepo.findOne({
          where: { studentId, academicYearId, billingQuarter: qe.q, billingYear: currentYear },
        });
        if (existing) return { generate: false };

        // Verify: last invoice was at least 2.5 months ago (not a duplicate)
        if (lastIssueDate) {
          const monthsSinceLast = (today.getTime() - lastIssueDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
          if (monthsSinceLast < 2) return { generate: false };
        }

        return {
          generate: true,
          billingQuarter: qe.q,
          label: `Q${qe.q} ${currentYear} Fee`,
        };
      }
      return { generate: false };
    }

    if (frequency === FeeFrequency.SEMI_ANNUAL) {
      const semiEnds = [{ half: 1, month: 6, day: 30 }, { half: 2, month: 12, day: 31 }];
      for (const se of semiEnds) {
        const endDate = new Date(currentYear, se.month - 1, se.day);
        const daysLeft = Math.ceil((endDate.getTime() - today.getTime()) / 86400000);
        if (daysLeft !== settings.semiAnnualInvoiceDaysBefore) continue;

        const existing = await this.invoiceRepo.findOne({
          where: { studentId, academicYearId, billingQuarter: se.half, billingYear: currentYear },
        });
        if (existing) return { generate: false };

        // Must be at least 5 months since last invoice
        if (lastIssueDate) {
          const monthsSinceLast = (today.getTime() - lastIssueDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
          if (monthsSinceLast < 5) return { generate: false };
        }

        return {
          generate: true,
          billingQuarter: se.half,
          label: `Semi-Annual H${se.half} ${currentYear}`,
        };
      }
      return { generate: false };
    }

    if (frequency === FeeFrequency.ANNUAL) {
      const yearEnd = new Date(academicYearId); // will be overridden
      const academicYr = await this.yearRepo.findOne({ where: { id: academicYearId } });
      if (!academicYr) return { generate: false };

      const yearEndDate = new Date(academicYr.endDate);
      const daysLeft = Math.ceil((yearEndDate.getTime() - today.getTime()) / 86400000);
      if (daysLeft !== settings.annualInvoiceDaysBefore) return { generate: false };

      // Only one annual invoice per year
      const existing = await this.invoiceRepo.findOne({
        where: { studentId, academicYearId, billingYear: currentYear },
      });
      if (existing) return { generate: false };

      return {
        generate: true,
        billingYear: currentYear,
        label: `Annual Fee ${academicYr.name}`,
      };
    }

    return { generate: false };
  }

  /**
   * Given a list of billing frequencies, returns the "dominant" one:
   * monthly > quarterly > semi_annual > annual > one_time
   * (The highest frequency determines the auto-generation trigger.)
   */
  private getDominantFrequency(frequencies: FeeFrequency[]): FeeFrequency {
    const priority = {
      [FeeFrequency.MONTHLY]: 5,
      [FeeFrequency.QUARTERLY]: 4,
      [FeeFrequency.SEMI_ANNUAL]: 3,
      [FeeFrequency.ANNUAL]: 2,
      [FeeFrequency.ONE_TIME]: 1,
      [FeeFrequency.CUSTOM]: 0,
    };
    return frequencies.reduce((highest, freq) => {
      return (priority[freq] ?? 0) > (priority[highest] ?? 0) ? freq : highest;
    }, frequencies[0]);
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private generateInvoiceNumber(): string {
    return `INV-${format(new Date(), 'yyyyMM')}-${uuidv4().split('-')[0].toUpperCase()}`;
  }

  private buildBillingLabel(dto: GenerateInvoiceDto): string {
    if (dto.billingMonth && dto.billingYear)
      return `${this.monthName(dto.billingMonth)} ${dto.billingYear} Fee`;
    if (dto.billingQuarter && dto.billingYear)
      return `Q${dto.billingQuarter} ${dto.billingYear} Fee`;
    return `Fee - ${format(new Date(dto.issueDate), 'MMM yyyy')}`;
  }

  private monthName(m: number): string {
    return ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m] || '';
  }
}
