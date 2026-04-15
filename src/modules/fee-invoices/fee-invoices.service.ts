import {
  Injectable, NotFoundException, BadRequestException, ConflictException, Inject, forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { v4 as uuidv4 } from 'uuid';
import { format, addDays, addMonths, startOfMonth, endOfMonth, getMonth, getYear, differenceInMonths } from 'date-fns';
import { FeeInvoice } from './entities/fee-invoice.entity';
import { FeeWaiver } from './entities/fee-waiver.entity';
import { Student } from '../students/entities/student.entity';
import { FeeStructure } from '../fee-structures/entities/fee-structure.entity';
import { Discount } from '../fee-structures/entities/discount.entity';
import { AcademicYear } from '../academic-years/entities/academic-year.entity';
import { GlobalSettings } from '../settings/entities/global-settings.entity';
import {
  GenerateInvoiceDto, BulkGenerateInvoiceDto,
  CancelInvoiceDto, ApplyWaiverDto, ReviewWaiverDto, InvoiceFilterDto,
} from './dto/fee-invoice.dto';
import { PaginationDto, PaginatedResult } from '../../common/dto/pagination.dto';
import { InvoiceStatus, DiscountType, WaiverStatus, FeeFrequency, FeeCategory } from '../../common/enums';
import { NotificationsService } from '../notifications/notifications.service';

// How many monthly base amounts are bundled per invoice period
const FREQ_MULTIPLIER: Record<FeeFrequency, number> = {
  [FeeFrequency.ONE_TIME]:    1,
  [FeeFrequency.MONTHLY]:     1,
  [FeeFrequency.QUARTERLY]:   3,
  [FeeFrequency.SEMI_ANNUAL]: 6,
  [FeeFrequency.ANNUAL]:      12,
  [FeeFrequency.CUSTOM]:      1,
};

@Injectable()
export class FeeInvoicesService {
  constructor(
    @InjectRepository(FeeInvoice) private readonly invoiceRepo: Repository<FeeInvoice>,
    @InjectRepository(FeeWaiver) private readonly waiverRepo: Repository<FeeWaiver>,
    @InjectRepository(Student) private readonly studentRepo: Repository<Student>,
    @InjectRepository(FeeStructure) private readonly feeStructureRepo: Repository<FeeStructure>,
    @InjectRepository(Discount) private readonly discountRepo: Repository<Discount>,
    @InjectRepository(AcademicYear) private readonly yearRepo: Repository<AcademicYear>,
    @InjectRepository(GlobalSettings) private readonly settingsRepo: Repository<GlobalSettings>,
    private readonly dataSource: DataSource,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // YEAR-WIDE INVOICE GENERATION ON REGISTRATION
  // ─────────────────────────────────────────────────────────────────────────
  /**
   * Called immediately after a student is created.
   *
   * Generates:
   *   1. ADMISSION FEE invoice — due today (one-time, separate)
   *   2. All RECURRING fee invoices for the rest of the academic year,
   *      based on the student's billingFrequency:
   *
   *      MONTHLY:     one invoice per remaining month, each due on the
   *                   configured due day of that month.
   *      QUARTERLY:   one invoice per remaining quarter.
   *      SEMI_ANNUAL: one invoice per remaining half-year.
   *      ANNUAL:      one invoice covering the whole remaining year.
   *
   * Future invoices have status = ISSUED (not OVERDUE) until their due date
   * passes — the nightly cron then marks them overdue automatically.
   *
   * Fee structures included per invoice:
   *   • All MANDATORY structures for the student's class (always)
   *   • Any OPTIONAL structures in student.selectedFeeStructureIds
   *   • ADMISSION category structures are in invoice #1 only; excluded from recurrings
   */
  async generateYearInvoices(student: Student, createdBy?: string): Promise<FeeInvoice[]> {
    const settings = await this.settingsRepo.findOne({ where: { id: 'global' } });
    const dueDays = settings?.monthlyInvoiceDay ?? 5;

    const academicYear = await this.yearRepo.findOne({ where: { id: student.academicYearId } });
    if (!academicYear) {
      console.log('No academic year found for ID:', student.academicYearId);
      return [];
    }

    const yearEnd = new Date(academicYear.endDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if academic year hasn't started yet or has already ended
    if (today > yearEnd) {
      console.log('Academic year has already ended:', { today, yearEnd });
      return [];
    }

    // Load all applicable fee structures for this student
    const allFeeStructures = await this.resolveStudentFeeStructures(student);
    
    if (allFeeStructures.length === 0) {
      console.log('No fee structures found for student:', student.id);
      return [];
    }

    const admissionFees = allFeeStructures.filter(fs => fs.category === FeeCategory.ADMISSION);
    const recurringFees = allFeeStructures.filter(fs => fs.category !== FeeCategory.ADMISSION);

    const generated: FeeInvoice[] = [];

    // ── 1. Admission fee invoice (due today) ──────────────────────────────
    if (admissionFees.length) {
      const inv = await this.buildAndSaveInvoice({
        student,
        feeStructures: admissionFees,
        issueDate: today,
        dueDate: today,                 // admission fee due immediately
        billingLabel: 'Admission Fee',
        billingYear: getYear(today),
        academicYearId: student.academicYearId,
        createdBy,
      });
      generated.push(inv);
    }

    if (!recurringFees.length) {
      console.log('No recurring fees found');
      return generated;
    }

    // ── 2. Recurring invoices based on billing frequency ──────────────────
    const billingPeriods = this.computeBillingPeriods(
      today,
      yearEnd,
      student.billingFrequency,
      dueDays,
    );

    console.log(`Generated ${billingPeriods.length} billing periods for frequency ${student.billingFrequency}`);

    for (const period of billingPeriods) {
      const inv = await this.buildAndSaveInvoice({
        student,
        feeStructures: recurringFees,
        issueDate: period.issueDate,
        dueDate: period.dueDate,
        billingLabel: period.label,
        billingMonth: period.billingMonth,
        billingQuarter: period.billingQuarter,
        billingYear: period.billingYear,
        academicYearId: student.academicYearId,
        frequencyMultiplier: period.multiplier,
        createdBy,
      });
      generated.push(inv);
    }

    return generated;
  }

  /**
   * Resolves the full list of fee structures that apply to this student:
   *   - Mandatory structures for their class (or school-wide if class_id is NULL)
   *   - Optional structures explicitly selected in student.selectedFeeStructureIds
   */
  private async resolveStudentFeeStructures(student: Student): Promise<FeeStructure[]> {
    // Mandatory (always included)
    const mandatory = await this.feeStructureRepo.createQueryBuilder('fs')
      .where('fs.academic_year_id = :ay', { ay: student.academicYearId })
      .andWhere('fs.is_mandatory = true')
      .andWhere('fs.is_active = true')
      .andWhere('fs.deleted_at IS NULL')
      .andWhere('(fs.class_id = :classId OR fs.class_id IS NULL)', { classId: student.classId || null })
      .orderBy('fs.sort_order', 'ASC')
      .getMany();

    // Optional (student's explicit selections)
    let optional: FeeStructure[] = [];
    if (student.selectedFeeStructureIds?.length) {
      optional = await this.feeStructureRepo.find({
        where: {
          id: In(student.selectedFeeStructureIds),
          isActive: true,
          academicYearId: student.academicYearId,
        },
      });
    }

    // Merge, de-duplicate
    const seen = new Set(mandatory.map(f => f.id));
    const merged = [...mandatory];
    for (const f of optional) {
      if (!seen.has(f.id)) { 
        merged.push(f); 
        seen.add(f.id); 
      }
    }
    
    return merged;
  }

  /**
   * Computes the list of billing periods from today until year end,
   * based on the student's chosen billing frequency.
   *
   * Each period has:
   *   issueDate   — when the invoice is raised (today for the first one,
   *                  start of the period for future ones)
   *   dueDate     — issueDate + dueDays
   *   label       — human-readable period label
   *   multiplier  — how many monthly base amounts to multiply fee by
   */
  private computeBillingPeriods(
    admissionDate: Date,
    yearEnd: Date,
    frequency: FeeFrequency,
    dueDays: number,
  ): Array<{
    issueDate: Date;
    dueDate: Date;
    label: string;
    billingMonth?: number;
    billingQuarter?: number;
    billingYear: number;
    multiplier: number;
  }> {
    const periods: ReturnType<typeof this.computeBillingPeriods> = [];
    const multiplier = FREQ_MULTIPLIER[frequency] ?? 1;
    const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    // Normalize dates
    const startDate = new Date(admissionDate);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(yearEnd);
    endDate.setHours(0, 0, 0, 0);

    // If admission date is after year end, return empty
    if (startDate > endDate) {
      return periods;
    }

    if (frequency === FeeFrequency.MONTHLY || frequency === FeeFrequency.CUSTOM) {
      // Get the current month and year
      let currentYear = startDate.getFullYear();
      let currentMonth = startDate.getMonth();
      
      // Get the last month from yearEnd
      const endYear = endDate.getFullYear();
      const endMonth = endDate.getMonth();
      
      // Calculate total months to generate
      let totalMonths = (endYear - currentYear) * 12 + (endMonth - currentMonth) + 1;
      
      // Generate invoice for each remaining month
      for (let i = 0; i < totalMonths; i++) {
        const year = currentYear;
        const month = currentMonth + 1;
        
        // Calculate issue date
        let issueDate: Date;
        if (i === 0) {
          // First month: use admission date
          issueDate = new Date(startDate);
        } else {
          // Subsequent months: use 1st of the month
          issueDate = new Date(year, currentMonth, 1);
        }
        
        // Ensure issue date is not after year end
        if (issueDate > endDate) break;
        
        periods.push({
          issueDate: issueDate,
          dueDate: addDays(issueDate, dueDays),
          label: `${MONTHS[month]} ${year} Fee`,
          billingMonth: month,
          billingYear: year,
          multiplier: 1,
        });
        
        // Move to next month
        currentMonth++;
        if (currentMonth > 11) {
          currentMonth = 0;
          currentYear++;
        }
      }

    } else if (frequency === FeeFrequency.QUARTERLY) {
      // Calculate starting quarter
      let currentYear = startDate.getFullYear();
      let currentQuarter = Math.floor(startDate.getMonth() / 3) + 1;
      
      // Get quarter start month
      let quarterStartMonth = (currentQuarter - 1) * 3;
      let quarterStartDate = new Date(currentYear, quarterStartMonth, 1);
      
      // If we're in the middle of a quarter, still generate for current quarter
      while (quarterStartDate <= endDate) {
        const issueDate = (periods.length === 0) ? new Date(startDate) : new Date(quarterStartDate);
        
        if (issueDate <= endDate) {
          periods.push({
            issueDate: issueDate,
            dueDate: addDays(issueDate, dueDays),
            label: `Q${currentQuarter} ${currentYear} Fee`,
            billingQuarter: currentQuarter,
            billingYear: currentYear,
            multiplier: 3,
          });
        }
        
        // Move to next quarter
        currentQuarter++;
        if (currentQuarter > 4) {
          currentQuarter = 1;
          currentYear++;
        }
        quarterStartMonth = (currentQuarter - 1) * 3;
        quarterStartDate = new Date(currentYear, quarterStartMonth, 1);
      }

    } else if (frequency === FeeFrequency.SEMI_ANNUAL) {
      // Calculate starting half-year
      let currentYear = startDate.getFullYear();
      let currentHalf = startDate.getMonth() < 6 ? 1 : 2;
      
      // Get half start month
      let halfStartMonth = currentHalf === 1 ? 0 : 6;
      let halfStartDate = new Date(currentYear, halfStartMonth, 1);
      
      while (halfStartDate <= endDate) {
        const issueDate = (periods.length === 0) ? new Date(startDate) : new Date(halfStartDate);
        
        if (issueDate <= endDate) {
          periods.push({
            issueDate: issueDate,
            dueDate: addDays(issueDate, dueDays),
            label: `H${currentHalf} ${currentYear} Fee`,
            billingQuarter: currentHalf,
            billingYear: currentYear,
            multiplier: 6,
          });
        }
        
        // Move to next half
        currentHalf = currentHalf === 1 ? 2 : 1;
        if (currentHalf === 1) currentYear++;
        halfStartMonth = currentHalf === 1 ? 0 : 6;
        halfStartDate = new Date(currentYear, halfStartMonth, 1);
      }

    } else if (frequency === FeeFrequency.ANNUAL) {
      // Single invoice for the remaining academic period
      periods.push({
        issueDate: new Date(startDate),
        dueDate: addDays(new Date(startDate), dueDays),
        label: `Annual Fee ${startDate.getFullYear()}-${endDate.getFullYear()}`,
        billingYear: startDate.getFullYear(),
        multiplier: 12,
      });
    }

    return periods;
  }

  /**
   * Builds line items and saves a single invoice.
   * Applies discounts. The frequency multiplier is applied to the base amount.
   */
  private async buildAndSaveInvoice(params: {
    student: Student;
    feeStructures: FeeStructure[];
    issueDate: Date;
    dueDate: Date;
    billingLabel: string;
    billingMonth?: number;
    billingQuarter?: number;
    billingYear?: number;
    academicYearId: string;
    frequencyMultiplier?: number;
    createdBy?: string;
  }): Promise<FeeInvoice> {
    const {
      student, feeStructures, issueDate, dueDate, billingLabel,
      billingMonth, billingQuarter, billingYear, academicYearId,
      frequencyMultiplier = 1, createdBy,
    } = params;

    // Load discounts for this student
    const discounts = await this.discountRepo.find({
      where: [{ studentId: student.id, academicYearId, isActive: true }],
    });

    let subtotal = 0;
    let totalDiscount = 0;

    const lineItems = feeStructures.map(fs => {
      const feeAmount = Number(fs.amount) * frequencyMultiplier;
      const disc = discounts.find(d => !d.feeStructureId || d.feeStructureId === fs.id);
      let discountAmount = 0;
      if (disc) {
        discountAmount = disc.type === DiscountType.PERCENTAGE
          ? (feeAmount * disc.value) / 100
          : Math.min(disc.value, feeAmount);
      }
      subtotal += feeAmount;
      totalDiscount += discountAmount;
      return {
        feeStructureId: fs.id,
        feeName: fs.name,
        category: fs.category,
        amount: feeAmount,
        discountAmount,
        netAmount: feeAmount - discountAmount,
      };
    });

    const totalAmount = subtotal - totalDiscount;

    const invoice = this.invoiceRepo.create({
      invoiceNumber: this.generateInvoiceNumber(),
      studentId: student.id,
      academicYearId,
      billingMonth,
      billingQuarter,
      billingYear,
      billingLabel,
      issueDate,
      dueDate,
      status: InvoiceStatus.ISSUED,   // nightly cron will mark overdue when past due
      subtotal,
      discountAmount: totalDiscount,
      lateFeeAmount: 0,
      totalAmount,
      paidAmount: 0,
      balanceAmount: totalAmount,
      waivedAmount: 0,
      lineItems,
      createdBy,
    });

    const saved = await this.invoiceRepo.save(invoice);
    this.notificationsService.sendInvoiceNotification(saved, student).catch(() => {});
    return saved;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MANUAL SINGLE INVOICE (still supported for edge cases)
  // ─────────────────────────────────────────────────────────────────────────
  async generateInvoice(dto: GenerateInvoiceDto, createdBy?: string): Promise<FeeInvoice> {
    const student = await this.studentRepo.findOne({
      where: { id: dto.studentId },
      relations: ['user', 'class', 'academicYear'],
    });
    if (!student) throw new NotFoundException('Student not found');

    let feeStructures: FeeStructure[];
    if (dto.feeStructureIds?.length) {
      feeStructures = await this.feeStructureRepo.find({
        where: { id: In(dto.feeStructureIds), isActive: true },
      });
    } else {
      feeStructures = await this.resolveStudentFeeStructures(student);
    }

    if (!feeStructures.length) throw new BadRequestException('No applicable fee structures found.');

    return this.buildAndSaveInvoice({
      student,
      feeStructures,
      issueDate: new Date(dto.issueDate),
      dueDate: new Date(dto.dueDate),
      billingLabel: dto.billingLabel || this.buildBillingLabel(dto),
      billingMonth: dto.billingMonth,
      billingQuarter: dto.billingQuarter,
      billingYear: dto.billingYear,
      academicYearId: dto.academicYearId,
      createdBy,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RETRIEVAL
  // ─────────────────────────────────────────────────────────────────────────
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
    return this.invoiceRepo.find({ where, relations: ['academicYear'], order: { issueDate: 'ASC' } });
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
      summary: { totalBilled, totalPaid, totalWaived, totalDue,
        overdueCount: overdueInvoices.length,
        overdueDue: overdueInvoices.reduce((s, i) => s + Number(i.balanceAmount), 0) },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ACTIONS
  // ─────────────────────────────────────────────────────────────────────────
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

  // ─────────────────────────────────────────────────────────────────────────
  // WAIVERS
  // ─────────────────────────────────────────────────────────────────────────
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

  // ─────────────────────────────────────────────────────────────────────────
  // SCHEDULED JOBS
  // ─────────────────────────────────────────────────────────────────────────
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async markOverdueInvoices(): Promise<void> {
    const settings = await this.settingsRepo.findOne({ where: { id: 'global' } });
    if (settings && !settings.autoOverdueMarkingEnabled) return;

    await this.invoiceRepo.createQueryBuilder()
      .update(FeeInvoice)
      .set({ status: InvoiceStatus.OVERDUE })
      .where('due_date < :today', { today: new Date() })
      .andWhere('status IN (:...statuses)', { statuses: [InvoiceStatus.ISSUED, InvoiceStatus.PARTIALLY_PAID] })
      .andWhere('balance_amount > 0')
      .execute();
  }

  @Cron('0 9 * * *')
  async sendPaymentReminders(): Promise<void> {
    const settings = await this.settingsRepo.findOne({ where: { id: 'global' } });
    if (settings && !settings.autoReminderEnabled) return;
    const daysBeforeDue = settings?.reminderDaysBeforeDue ?? 3;
    const dueSoon = addDays(new Date(), daysBeforeDue);
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
      this.notificationsService.sendReminderNotification(inv, inv.student).catch(() => {});
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────────────────
  private generateInvoiceNumber(): string {
    return `INV-${format(new Date(), 'yyyyMM')}-${uuidv4().split('-')[0].toUpperCase()}`;
  }

  private buildBillingLabel(dto: GenerateInvoiceDto): string {
    const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    if (dto.billingMonth && dto.billingYear) return `${MONTHS[dto.billingMonth]} ${dto.billingYear} Fee`;
    if (dto.billingQuarter && dto.billingYear) return `Q${dto.billingQuarter} ${dto.billingYear} Fee`;
    return `Fee - ${format(new Date(dto.issueDate), 'MMM yyyy')}`;
  }
}