import {
  Injectable, NotFoundException, BadRequestException, ConflictException, Inject, forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { v4 as uuidv4 } from 'uuid';
import { format, addDays, addMonths, startOfMonth, endOfMonth, getMonth, getYear } from 'date-fns';
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
import { InvoiceStatus, DiscountType, WaiverStatus, FeeFrequency } from '../../common/enums';
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
    const dueDays = settings?.defaultDueDays ?? 10;

    const academicYear = await this.yearRepo.findOne({ where: { id: student.academicYearId } });
    if (!academicYear) return [];

    const yearEnd = new Date(academicYear.endDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Load all applicable fee structures for this student
    const allFeeStructures = await this.resolveStudentFeeStructures(student);

    // One-time fees (admission, registration) go on the first invoice only.
    // Recurring fees are spread across all billing periods.
    const admissionFees = allFeeStructures.filter(fs => fs.isOneTime);
    const recurringFees = allFeeStructures.filter(fs => !fs.isOneTime);

    const generated: FeeInvoice[] = [];

    // Compute all recurring billing periods first
    const billingPeriods = recurringFees.length
      ? this.computeBillingPeriods(today, yearEnd, student.billingFrequency, dueDays)
      : [];

    // ── Invoice #1: Admission fee + first billing period in ONE invoice ───
    //
    // Rationale: at the moment of enrollment the student pays admission fee
    // together with whatever their first billing period is (first month fee,
    // first quarter fee, or full year fee). Combining them into a single
    // invoice makes it easier for finance to collect one payment at the desk.
    //
    const firstPeriod = billingPeriods[0] ?? null;
    const firstFeeStructures = [
      ...admissionFees,
      ...(firstPeriod ? recurringFees : []),
    ];

    if (firstFeeStructures.length) {
      // Label: "Admission + Jan 2025 Fee" or "Admission + Q1 2025 Fee" etc.
      // If there are no recurring fees, just "Admission Fee".
      const label = firstPeriod
        ? `Admission + ${firstPeriod.label}`
        : 'Admission Fee';

      const inv = await this.buildAndSaveInvoice({
        student,
        feeStructures: admissionFees,        // admission lines at ×1
        extraFeeStructures: recurringFees,    // recurring lines at period multiplier
        extraMultiplier: firstPeriod?.multiplier ?? 1,
        issueDate: today,
        dueDate: today,                       // due immediately at enrollment
        billingLabel: label,
        billingMonth: firstPeriod?.billingMonth,
        billingQuarter: firstPeriod?.billingQuarter,
        billingYear: firstPeriod?.billingYear ?? getYear(today),
        academicYearId: student.academicYearId,
        createdBy,
      });
      generated.push(inv);
    }

    // ── Invoices #2–N: remaining billing periods (future dates) ──────────
    for (const period of billingPeriods.slice(1)) {
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
      .orderBy('fs.created_at', 'ASC')
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
      if (!seen.has(f.id)) { merged.push(f); seen.add(f.id); }
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

    if (frequency === FeeFrequency.MONTHLY || frequency === FeeFrequency.CUSTOM) {
      // One invoice per remaining calendar month
      let cursor = new Date(admissionDate);
      cursor.setDate(1); // start from the 1st of the admission month

      while (cursor <= yearEnd) {
        const month = cursor.getMonth() + 1;
        const year = cursor.getFullYear();
        // Issue on the 1st; due in dueDays
        const issueDate = new Date(year, month - 1, 1);
        const dueDate = addDays(issueDate, dueDays);

        // First period: issue today (student just enrolled), due in dueDays
        const effectiveIssue = cursor.getTime() === new Date(admissionDate.getFullYear(), admissionDate.getMonth(), 1).getTime()
          ? new Date(admissionDate) : issueDate;

        periods.push({
          issueDate: effectiveIssue,
          dueDate: addDays(effectiveIssue, dueDays),
          label: `${MONTHS[month]} ${year} Fee`,
          billingMonth: month,
          billingYear: year,
          multiplier: 1,
        });

        cursor = addMonths(cursor, 1);
      }

    } else if (frequency === FeeFrequency.QUARTERLY) {
      // Quarters: Q1=Jan-Mar, Q2=Apr-Jun, Q3=Jul-Sep, Q4=Oct-Dec
      const quarterStarts = [1, 4, 7, 10]; // month numbers

      for (const qStart of quarterStarts) {
        const year = admissionDate.getFullYear();
        const qStartDate = new Date(year, qStart - 1, 1);
        const qEnd = new Date(year, qStart + 1, 0); // last day of the quarter end month

        // Skip if this quarter has already fully passed
        if (qEnd < admissionDate) continue;
        // Skip if quarter starts after year end
        if (qStartDate > yearEnd) continue;

        const quarter = Math.ceil(qStart / 3);
        const issueDate = qStartDate < admissionDate ? new Date(admissionDate) : qStartDate;

        periods.push({
          issueDate,
          dueDate: addDays(issueDate, dueDays),
          label: `Q${quarter} ${year} Fee`,
          billingQuarter: quarter,
          billingYear: year,
          multiplier: 3,
        });
      }

    } else if (frequency === FeeFrequency.SEMI_ANNUAL) {
      // H1=Jan-Jun, H2=Jul-Dec
      const halves = [
        { h: 1, start: 1, end: 6 },
        { h: 2, start: 7, end: 12 },
      ];
      const year = admissionDate.getFullYear();

      for (const half of halves) {
        const hStart = new Date(year, half.start - 1, 1);
        const hEnd = new Date(year, half.end, 0);
        if (hEnd < admissionDate) continue;
        if (hStart > yearEnd) continue;

        const issueDate = hStart < admissionDate ? new Date(admissionDate) : hStart;
        periods.push({
          issueDate,
          dueDate: addDays(issueDate, dueDays),
          label: `Half-Year H${half.h} ${year} Fee`,
          billingQuarter: half.h,
          billingYear: year,
          multiplier: 6,
        });
      }

    } else if (frequency === FeeFrequency.ANNUAL) {
      // Single invoice for the full academic year
      const year = admissionDate.getFullYear();
      periods.push({
        issueDate: new Date(admissionDate),
        dueDate: addDays(new Date(admissionDate), dueDays),
        label: `Annual Fee ${year}`,
        billingYear: year,
        multiplier: 12,
      });

    } else if (frequency === FeeFrequency.ONE_TIME) {
      // Nothing — one-time fees are handled separately
    }

    return periods;
  }

  /**
   * Builds line items and saves a single invoice.
   * Applies discounts. The frequency multiplier is applied to the base amount.
   */
  private async buildAndSaveInvoice(params: {
    student: Student;
    feeStructures: FeeStructure[];          // primary fee lines (multiplied by frequencyMultiplier)
    extraFeeStructures?: FeeStructure[];    // secondary fee lines (multiplied by extraMultiplier)
    extraMultiplier?: number;               // multiplier for extraFeeStructures
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
      student, feeStructures, extraFeeStructures = [], extraMultiplier = 1,
      issueDate, dueDate, billingLabel,
      billingMonth, billingQuarter, billingYear, academicYearId,
      frequencyMultiplier = 1, createdBy,
    } = params;

    // Load discounts for this student
    const discounts = await this.discountRepo.find({
      where: [{ studentId: student.id, academicYearId, isActive: true }],
    });

    let subtotal = 0;
    let totalDiscount = 0;

    // Helper: build one line item
    const buildLine = (fs: FeeStructure, mult: number) => {
      const feeAmount = Number(fs.amount) * mult;
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
        category: fs.isOneTime ? 'one-time' : 'recurring',
        amount: feeAmount,
        discountAmount,
        netAmount: feeAmount - discountAmount,
      };
    };

    const lineItems = [
      ...feeStructures.map(fs => buildLine(fs, frequencyMultiplier)),
      ...extraFeeStructures.map(fs => buildLine(fs, extraMultiplier)),
    ];

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
  /**
   * Runs every day at midnight.
   *
   * 1. Marks invoices as OVERDUE once their due date passes.
   * 2. Applies late fees to invoices that have passed the grace period
   *    (due_date + gracePeriodDays < today).
   *
   * Late fee logic (from GlobalSettings):
   *   • percentage: lateFeeAmount = balanceAmount × (lateFeeValue / 100)
   *   • fixed:      lateFeeAmount = lateFeeValue (flat amount, applied once)
   *
   * A late fee is only applied ONCE per invoice (checked via lateFeeAmount > 0).
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async markOverdueInvoices(): Promise<void> {
    const settings = await this.settingsRepo.findOne({ where: { id: 'global' } });
    if (settings && !settings.autoOverdueMarkingEnabled) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Step 1: Mark all past-due unpaid invoices as OVERDUE
    await this.invoiceRepo.createQueryBuilder()
      .update(FeeInvoice)
      .set({ status: InvoiceStatus.OVERDUE })
      .where('due_date < :today', { today })
      .andWhere('status IN (:...statuses)', { statuses: [InvoiceStatus.ISSUED, InvoiceStatus.PARTIALLY_PAID] })
      .andWhere('balance_amount > 0')
      .execute();

    // Step 2: Apply late fees if enabled and grace period has passed
    if (!settings?.lateFeeEnabled || !settings?.lateFeeValue) return;

    const graceDays = settings.gracePeriodDays ?? 0;

    // Find OVERDUE invoices where:
    //   - grace period has passed  (due_date + graceDays < today)
    //   - late fee not yet applied (late_fee_amount = 0)
    //   - still has a balance
    const overdueForLateFee = await this.invoiceRepo
      .createQueryBuilder('inv')
      .where('inv.status = :status', { status: InvoiceStatus.OVERDUE })
      .andWhere('inv.balance_amount > 0')
      .andWhere('inv.late_fee_amount = 0')
      .andWhere(`inv.due_date + INTERVAL '${graceDays} days' < :today`, { today })
      .getMany();

    for (const inv of overdueForLateFee) {
      let lateFeeAmount: number;

      if (settings.lateFeeType === 'percentage') {
        // Percentage of the outstanding balance
        lateFeeAmount = Math.round((Number(inv.balanceAmount) * Number(settings.lateFeeValue)) / 100 * 100) / 100;
      } else {
        // Fixed flat amount
        lateFeeAmount = Number(settings.lateFeeValue);
      }

      if (lateFeeAmount <= 0) continue;

      inv.lateFeeAmount = lateFeeAmount;
      inv.totalAmount   = Number(inv.totalAmount)   + lateFeeAmount;
      inv.balanceAmount = Number(inv.balanceAmount) + lateFeeAmount;

      await this.invoiceRepo.save(inv);

      // Notify student
      this.notificationsService.sendOverdueNotification(inv, inv.student).catch(() => {});
    }
  }

  @Cron('0 9 * * *')
  async sendPaymentReminders(): Promise<void> {
    const settings = await this.settingsRepo.findOne({ where: { id: 'global' } });
    if (!settings || !settings.reminderDaysBeforeDue) return;
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
