import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { FeeInvoice } from '../fee-invoices/entities/fee-invoice.entity';
import { Payment } from '../payments/entities/payment.entity';
import { Student } from '../students/entities/student.entity';
import { AcademicYear } from '../academic-years/entities/academic-year.entity';
import { Class } from '../classes/entities/class.entity';
import { ReportFilterDto } from './dto/report.dto';
import { InvoiceStatus, PaymentStatus, PaymentMethod } from '../../common/enums';

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(FeeInvoice) private readonly invoiceRepo: Repository<FeeInvoice>,
    @InjectRepository(Payment) private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(Student) private readonly studentRepo: Repository<Student>,
    @InjectRepository(AcademicYear) private readonly yearRepo: Repository<AcademicYear>,
    @InjectRepository(Class) private readonly classRepo: Repository<Class>,
    private readonly dataSource: DataSource,
  ) {}

  // ── Dashboard Summary ───────────────────────────────────────────────────────

  async getDashboardSummary(academicYearId: string): Promise<any> {
    const [
      totalStudents,
      totalInvoiced,
      totalCollected,
      totalOutstanding,
      overdueAmount,
      totalWaived,
      defaulterCount,
      collectionRate,
      monthlyTrend,
      classWiseSummary,
      paymentMethodBreakdown,
      recentPayments,
    ] = await Promise.all([
      this.getTotalStudents(academicYearId),
      this.getTotalInvoiced(academicYearId),
      this.getTotalCollected(academicYearId),
      this.getTotalOutstanding(academicYearId),
      this.getOverdueAmount(academicYearId),
      this.getTotalWaived(academicYearId),
      this.getDefaulterCount(academicYearId),
      this.getCollectionRate(academicYearId),
      this.getMonthlyCollectionTrend(academicYearId),
      this.getClassWiseSummary(academicYearId),
      this.getPaymentMethodBreakdown(academicYearId),
      this.getRecentPayments(academicYearId, 10),
    ]);

    return {
      summary: {
        totalStudents,
        totalInvoiced,
        totalCollected,
        totalOutstanding,
        overdueAmount,
        totalWaived,
        defaulterCount,
        collectionRate: collectionRate.toFixed(2) + '%',
      },
      charts: {
        monthlyTrend,
        classWiseSummary,
        paymentMethodBreakdown,
      },
      recentPayments,
    };
  }

  // ── Fee Collection Report ───────────────────────────────────────────────────

  async getFeeCollectionReport(filters: ReportFilterDto): Promise<any> {
    const qb = this.paymentRepo.createQueryBuilder('p')
      .leftJoinAndSelect('p.student', 's')
      .leftJoinAndSelect('s.user', 'u')
      .leftJoinAndSelect('s.class', 'cls')
      .leftJoinAndSelect('p.invoice', 'inv')
      .where('p.status = :status', { status: PaymentStatus.COMPLETED });

    this.applyPaymentFilters(qb, filters);

    const payments = await qb.orderBy('p.payment_date', 'DESC').getMany();

    const totalCollected = payments.reduce((s, p) => s + Number(p.amount), 0);
    const byMethod = this.groupByField(payments, 'method', (p) => Number(p.amount));
    const byClass = this.groupByNestedField(payments, (p) => p.student?.class?.name || 'Unassigned', (p) => Number(p.amount));

    return {
      filters,
      summary: { totalCollected, totalPayments: payments.length, byMethod, byClass },
      payments,
    };
  }

  // ── Outstanding / Dues Report ───────────────────────────────────────────────

  async getOutstandingFeesReport(filters: ReportFilterDto): Promise<any> {
    const qb = this.invoiceRepo.createQueryBuilder('inv')
      .leftJoinAndSelect('inv.student', 's')
      .leftJoinAndSelect('s.user', 'u')
      .leftJoinAndSelect('s.class', 'cls')
      .leftJoinAndSelect('inv.academicYear', 'year')
      .where('inv.balance_amount > 0')
      .andWhere('inv.status NOT IN (:...excl)', { excl: [InvoiceStatus.CANCELLED, InvoiceStatus.WAIVED] });

    if (filters.academicYearId) qb.andWhere('inv.academic_year_id = :ay', { ay: filters.academicYearId });
    if (filters.classId) qb.andWhere('cls.id = :classId', { classId: filters.classId });
    if (filters.studentId) qb.andWhere('inv.student_id = :sid', { sid: filters.studentId });
    if (filters.fromDate) qb.andWhere('inv.due_date >= :from', { from: filters.fromDate });
    if (filters.toDate) qb.andWhere('inv.due_date <= :to', { to: filters.toDate });

    const invoices = await qb.orderBy('inv.due_date', 'ASC').getMany();

    const totalOutstanding = invoices.reduce((s, i) => s + Number(i.balanceAmount), 0);
    const overdueInvoices = invoices.filter((i) => i.status === InvoiceStatus.OVERDUE);
    const overdueAmount = overdueInvoices.reduce((s, i) => s + Number(i.balanceAmount), 0);

    const byClass: Record<string, { count: number; amount: number }> = {};
    invoices.forEach((inv) => {
      const cls = inv.student?.class?.name || 'Unassigned';
      if (!byClass[cls]) byClass[cls] = { count: 0, amount: 0 };
      byClass[cls].count++;
      byClass[cls].amount += Number(inv.balanceAmount);
    });

    return {
      filters,
      summary: {
        totalOutstanding,
        overdueAmount,
        totalInvoices: invoices.length,
        overdueCount: overdueInvoices.length,
        byClass,
      },
      invoices,
    };
  }

  // ── Target vs Actual Report ─────────────────────────────────────────────────

  async getTargetVsActualReport(academicYearId: string): Promise<any> {
    const year = await this.yearRepo.findOne({ where: { id: academicYearId } });
    if (!year) throw new Error('Academic year not found');

    const monthlyData: any[] = [];
    const currentYear = new Date().getFullYear();

    for (let month = 1; month <= 12; month++) {
      const target = year.monthlyTargets?.[month.toString()] || 0;
      const collected = await this.getCollectedForMonth(academicYearId, currentYear, month);
      const invoiced = await this.getInvoicedForMonth(academicYearId, month);

      monthlyData.push({
        month,
        monthName: this.getMonthName(month),
        target,
        invoiced,
        collected,
        shortfall: Math.max(0, target - collected),
        surplus: Math.max(0, collected - target),
        achievementRate: target > 0 ? ((collected / target) * 100).toFixed(1) + '%' : 'N/A',
      });
    }

    const quarterlyData: any[] = [];
    for (let q = 1; q <= 4; q++) {
      const months = this.getQuarterMonths(q);
      const qTarget = year.quarterlyTargets?.[`Q${q}`] || months.reduce((s, m) => s + (year.monthlyTargets?.[m.toString()] || 0), 0);
      const qCollected = monthlyData
        .filter((d) => months.includes(d.month))
        .reduce((s, d) => s + d.collected, 0);
      const qInvoiced = monthlyData
        .filter((d) => months.includes(d.month))
        .reduce((s, d) => s + d.invoiced, 0);

      quarterlyData.push({
        quarter: `Q${q}`,
        months: months.map((m) => this.getMonthName(m)).join(', '),
        target: qTarget,
        invoiced: qInvoiced,
        collected: qCollected,
        shortfall: Math.max(0, qTarget - qCollected),
        achievementRate: qTarget > 0 ? ((qCollected / qTarget) * 100).toFixed(1) + '%' : 'N/A',
      });
    }

    const annualCollected = monthlyData.reduce((s, d) => s + d.collected, 0);
    const annualTarget = Number(year.feeTarget) || 0;

    return {
      academicYear: year.name,
      annual: {
        target: annualTarget,
        collected: annualCollected,
        shortfall: Math.max(0, annualTarget - annualCollected),
        achievementRate: annualTarget > 0 ? ((annualCollected / annualTarget) * 100).toFixed(1) + '%' : 'N/A',
      },
      quarterly: quarterlyData,
      monthly: monthlyData,
    };
  }

  // ── Defaulter List ──────────────────────────────────────────────────────────

  async getDefaulterList(filters: ReportFilterDto): Promise<any> {
    const qb = this.dataSource.createQueryBuilder()
      .select('s.id', 'studentId')
      .addSelect('s.registration_number', 'registrationNumber')
      .addSelect('u.first_name', 'firstName')
      .addSelect('u.last_name', 'lastName')
      .addSelect('u.email', 'email')
      .addSelect('s.father_phone', 'fatherPhone')
      .addSelect('s.father_name', 'fatherName')
      .addSelect('cls.name', 'className')
      .addSelect('cls.grade', 'grade')
      .addSelect('SUM(inv.balance_amount)', 'totalDue')
      .addSelect('SUM(inv.total_amount)', 'totalBilled')
      .addSelect('SUM(inv.paid_amount)', 'totalPaid')
      .addSelect('COUNT(inv.id)', 'pendingInvoices')
      .addSelect('MIN(inv.due_date)', 'oldestDueDate')
      .from(Student, 's')
      .innerJoin('users', 'u', 'u.id = s.user_id')
      .leftJoin('classes', 'cls', 'cls.id = s.class_id')
      .innerJoin(
        'fee_invoices', 'inv',
        `inv.student_id = s.id AND inv.balance_amount > 0
         AND inv.status NOT IN ('cancelled', 'waived')`,
      )
      .where('s.is_active = true')
      .andWhere('s.deleted_at IS NULL');

    if (filters.academicYearId) {
      qb.andWhere('inv.academic_year_id = :ay', { ay: filters.academicYearId });
    }
    if (filters.classId) qb.andWhere('cls.id = :classId', { classId: filters.classId });

    qb.groupBy('s.id, s.registration_number, u.first_name, u.last_name, u.email, s.father_phone, s.father_name, cls.name, cls.grade')
      .having('SUM(inv.balance_amount) > 0')
      .orderBy('SUM(inv.balance_amount)', 'DESC');

    const defaulters = await qb.getRawMany();

    const totalOutstanding = defaulters.reduce((s, d) => s + parseFloat(d.totalDue), 0);

    return {
      filters,
      summary: { defaulterCount: defaulters.length, totalOutstanding },
      defaulters: defaulters.map((d) => ({
        ...d,
        totalDue: parseFloat(d.totalDue),
        totalBilled: parseFloat(d.totalBilled),
        totalPaid: parseFloat(d.totalPaid),
        pendingInvoices: parseInt(d.pendingInvoices),
        oldestDueDate: d.oldestDueDate,
      })),
    };
  }

  // ── Class-wise Fee Report ───────────────────────────────────────────────────

  async getClassWiseFeeReport(academicYearId: string): Promise<any> {
    const classes = await this.classRepo.find({
      where: { academicYearId, isActive: true },
      order: { grade: 'ASC', section: 'ASC' },
    });

    const classReports = await Promise.all(
      classes.map(async (cls) => {
        const result = await this.dataSource.createQueryBuilder()
          .select('COUNT(DISTINCT s.id)', 'totalStudents')
          .addSelect('SUM(inv.total_amount)', 'totalBilled')
          .addSelect('SUM(inv.paid_amount)', 'totalPaid')
          .addSelect('SUM(inv.balance_amount)', 'totalDue')
          .addSelect('SUM(inv.discount_amount)', 'totalDiscount')
          .addSelect('SUM(inv.late_fee_amount)', 'totalLateFee')
          .from(Student, 's')
          .leftJoin('fee_invoices', 'inv', 'inv.student_id = s.id AND inv.academic_year_id = :ay', { ay: academicYearId })
          .where('s.class_id = :classId', { classId: cls.id })
          .andWhere('s.is_active = true')
          .getRawOne();

        const defaulters = await this.dataSource.createQueryBuilder()
          .select('COUNT(DISTINCT s.id)', 'count')
          .from(Student, 's')
          .innerJoin('fee_invoices', 'inv', 'inv.student_id = s.id AND inv.academic_year_id = :ay AND inv.balance_amount > 0', { ay: academicYearId })
          .where('s.class_id = :classId', { classId: cls.id })
          .getRawOne();

        const totalBilled = parseFloat(result?.totalBilled || '0');
        const totalPaid = parseFloat(result?.totalPaid || '0');

        return {
          classId: cls.id,
          className: cls.name,
          grade: cls.grade,
          section: cls.section,
          totalStudents: parseInt(result?.totalStudents || '0'),
          defaulterCount: parseInt(defaulters?.count || '0'),
          totalBilled,
          totalPaid,
          totalDue: parseFloat(result?.totalDue || '0'),
          totalDiscount: parseFloat(result?.totalDiscount || '0'),
          totalLateFee: parseFloat(result?.totalLateFee || '0'),
          collectionRate: totalBilled > 0 ? ((totalPaid / totalBilled) * 100).toFixed(1) + '%' : '0%',
        };
      }),
    );

    return { academicYearId, classes: classReports };
  }

  // ── Monthly Summary ─────────────────────────────────────────────────────────

  async getMonthlySummary(academicYearId: string, year: number): Promise<any> {
    const months = Array.from({ length: 12 }, (_, i) => i + 1);

    const monthlyData = await Promise.all(
      months.map(async (month) => {
        const [invoiced, collected, outstanding] = await Promise.all([
          this.getInvoicedForMonth(academicYearId, month),
          this.getCollectedForMonth(academicYearId, year, month),
          this.getOutstandingForMonth(academicYearId, month),
        ]);
        return {
          month,
          monthName: this.getMonthName(month),
          invoiced,
          collected,
          outstanding,
          collectionRate: invoiced > 0 ? ((collected / invoiced) * 100).toFixed(1) + '%' : '0%',
        };
      }),
    );

    const grandTotalInvoiced = monthlyData.reduce((s, m) => s + m.invoiced, 0);
    const grandTotalCollected = monthlyData.reduce((s, m) => s + m.collected, 0);

    return {
      academicYearId,
      year,
      summary: {
        totalInvoiced: grandTotalInvoiced,
        totalCollected: grandTotalCollected,
        totalOutstanding: grandTotalInvoiced - grandTotalCollected,
        overallCollectionRate: grandTotalInvoiced > 0
          ? ((grandTotalCollected / grandTotalInvoiced) * 100).toFixed(1) + '%'
          : '0%',
      },
      months: monthlyData,
    };
  }

  // ── Discount Summary ────────────────────────────────────────────────────────

  async getDiscountSummary(academicYearId: string): Promise<any> {
    const result = await this.invoiceRepo.createQueryBuilder('inv')
      .select('SUM(inv.discount_amount)', 'totalDiscount')
      .addSelect('COUNT(inv.id)', 'invoiceCount')
      .addSelect('AVG(inv.discount_amount)', 'avgDiscount')
      .where('inv.academic_year_id = :ay', { ay: academicYearId })
      .andWhere('inv.discount_amount > 0')
      .getRawOne();

    const byClass = await this.dataSource.createQueryBuilder()
      .select('cls.name', 'className')
      .addSelect('SUM(inv.discount_amount)', 'totalDiscount')
      .addSelect('COUNT(DISTINCT s.id)', 'studentsWithDiscount')
      .from(FeeInvoice, 'inv')
      .innerJoin('students', 's', 's.id = inv.student_id')
      .leftJoin('classes', 'cls', 'cls.id = s.class_id')
      .where('inv.academic_year_id = :ay', { ay: academicYearId })
      .andWhere('inv.discount_amount > 0')
      .groupBy('cls.name')
      .orderBy('SUM(inv.discount_amount)', 'DESC')
      .getRawMany();

    return {
      academicYearId,
      summary: {
        totalDiscountGiven: parseFloat(result?.totalDiscount || '0'),
        invoicesWithDiscount: parseInt(result?.invoiceCount || '0'),
        averageDiscount: parseFloat(result?.avgDiscount || '0'),
      },
      byClass,
    };
  }

  // ── Student Fee Statement (Individual Ledger) ───────────────────────────────

  async getStudentFeeStatement(studentId: string, academicYearId?: string): Promise<any> {
    const student = await this.studentRepo.findOne({
      where: { id: studentId },
      relations: ['user', 'class', 'academicYear'],
    });
    if (!student) throw new Error('Student not found');

    const invoiceQb = this.invoiceRepo.createQueryBuilder('inv')
      .leftJoinAndSelect('inv.academicYear', 'year')
      .where('inv.student_id = :sid', { sid: studentId });
    if (academicYearId) invoiceQb.andWhere('inv.academic_year_id = :ay', { ay: academicYearId });
    const invoices = await invoiceQb.orderBy('inv.issue_date', 'ASC').getMany();

    const paymentQb = this.paymentRepo.createQueryBuilder('p')
      .leftJoinAndSelect('p.invoice', 'inv')
      .where('p.student_id = :sid', { sid: studentId })
      .andWhere('p.status = :status', { status: PaymentStatus.COMPLETED });
    if (academicYearId) paymentQb.andWhere('inv.academic_year_id = :ay', { ay: academicYearId });
    const payments = await paymentQb.orderBy('p.payment_date', 'ASC').getMany();

    const totalBilled = invoices.reduce((s, i) => s + Number(i.totalAmount), 0);
    const totalPaid = invoices.reduce((s, i) => s + Number(i.paidAmount), 0);
    const totalDue = invoices.reduce((s, i) => s + Number(i.balanceAmount), 0);
    const totalWaived = invoices.reduce((s, i) => s + Number(i.waivedAmount), 0);
    const totalDiscount = invoices.reduce((s, i) => s + Number(i.discountAmount), 0);

    return {
      student: {
        id: student.id,
        registrationNumber: student.registrationNumber,
        name: `${student.user?.firstName} ${student.user?.lastName}`,
        class: student.class?.name,
        grade: student.class?.grade,
        academicYear: student.academicYear?.name,
        fatherName: student.fatherName,
        fatherPhone: student.fatherPhone,
      },
      summary: { totalBilled, totalPaid, totalDue, totalWaived, totalDiscount },
      invoices,
      payments,
    };
  }

  // ── Payment Method Breakdown ────────────────────────────────────────────────

  async getPaymentMethodReport(filters: ReportFilterDto): Promise<any> {
    const qb = this.paymentRepo.createQueryBuilder('p')
      .select('p.method', 'method')
      .addSelect('SUM(p.amount)', 'totalAmount')
      .addSelect('COUNT(p.id)', 'count')
      .where('p.status = :status', { status: PaymentStatus.COMPLETED });

    if (filters.fromDate) qb.andWhere('p.payment_date >= :from', { from: filters.fromDate });
    if (filters.toDate) qb.andWhere('p.payment_date <= :to', { to: filters.toDate });

    qb.groupBy('p.method').orderBy('SUM(p.amount)', 'DESC');
    const result = await qb.getRawMany();

    const total = result.reduce((s, r) => s + parseFloat(r.totalAmount), 0);
    return {
      filters,
      total,
      breakdown: result.map((r) => ({
        method: r.method,
        totalAmount: parseFloat(r.totalAmount),
        count: parseInt(r.count),
        percentage: total > 0 ? ((parseFloat(r.totalAmount) / total) * 100).toFixed(1) + '%' : '0%',
      })),
    };
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private async getTotalStudents(academicYearId: string): Promise<number> {
    return this.studentRepo.count({ where: { academicYearId, isActive: true } });
  }

  private async getTotalInvoiced(academicYearId: string): Promise<number> {
    const r = await this.invoiceRepo.createQueryBuilder('inv')
      .select('SUM(inv.total_amount)', 'total')
      .where('inv.academic_year_id = :ay', { ay: academicYearId })
      .andWhere('inv.status != :cancelled', { cancelled: InvoiceStatus.CANCELLED })
      .getRawOne();
    return parseFloat(r?.total || '0');
  }

  private async getTotalCollected(academicYearId: string): Promise<number> {
    const r = await this.paymentRepo.createQueryBuilder('p')
      .innerJoin('fee_invoices', 'inv', 'inv.id = p.invoice_id AND inv.academic_year_id = :ay', { ay: academicYearId })
      .select('SUM(p.amount)', 'total')
      .where('p.status = :status', { status: PaymentStatus.COMPLETED })
      .getRawOne();
    return parseFloat(r?.total || '0');
  }

  private async getTotalOutstanding(academicYearId: string): Promise<number> {
    const r = await this.invoiceRepo.createQueryBuilder('inv')
      .select('SUM(inv.balance_amount)', 'total')
      .where('inv.academic_year_id = :ay', { ay: academicYearId })
      .andWhere('inv.balance_amount > 0')
      .andWhere('inv.status NOT IN (:...excl)', { excl: [InvoiceStatus.CANCELLED, InvoiceStatus.WAIVED] })
      .getRawOne();
    return parseFloat(r?.total || '0');
  }

  private async getOverdueAmount(academicYearId: string): Promise<number> {
    const r = await this.invoiceRepo.createQueryBuilder('inv')
      .select('SUM(inv.balance_amount)', 'total')
      .where('inv.academic_year_id = :ay', { ay: academicYearId })
      .andWhere('inv.status = :status', { status: InvoiceStatus.OVERDUE })
      .getRawOne();
    return parseFloat(r?.total || '0');
  }

  private async getTotalWaived(academicYearId: string): Promise<number> {
    const r = await this.invoiceRepo.createQueryBuilder('inv')
      .select('SUM(inv.waived_amount)', 'total')
      .where('inv.academic_year_id = :ay', { ay: academicYearId })
      .getRawOne();
    return parseFloat(r?.total || '0');
  }

  private async getDefaulterCount(academicYearId: string): Promise<number> {
    const r = await this.dataSource.createQueryBuilder()
      .select('COUNT(DISTINCT s.id)', 'count')
      .from(Student, 's')
      .innerJoin('fee_invoices', 'inv', 'inv.student_id = s.id AND inv.academic_year_id = :ay AND inv.balance_amount > 0', { ay: academicYearId })
      .getRawOne();
    return parseInt(r?.count || '0');
  }

  private async getCollectionRate(academicYearId: string): Promise<number> {
    const invoiced = await this.getTotalInvoiced(academicYearId);
    const collected = await this.getTotalCollected(academicYearId);
    return invoiced > 0 ? (collected / invoiced) * 100 : 0;
  }

  private async getMonthlyCollectionTrend(academicYearId: string): Promise<any[]> {
    const result = await this.paymentRepo.createQueryBuilder('p')
      .innerJoin('fee_invoices', 'inv', 'inv.id = p.invoice_id AND inv.academic_year_id = :ay', { ay: academicYearId })
      .select('EXTRACT(MONTH FROM p.payment_date)', 'month')
      .addSelect('EXTRACT(YEAR FROM p.payment_date)', 'year')
      .addSelect('SUM(p.amount)', 'collected')
      .where('p.status = :status', { status: PaymentStatus.COMPLETED })
      .groupBy('EXTRACT(MONTH FROM p.payment_date), EXTRACT(YEAR FROM p.payment_date)')
      .orderBy('EXTRACT(YEAR FROM p.payment_date)', 'ASC')
      .addOrderBy('EXTRACT(MONTH FROM p.payment_date)', 'ASC')
      .getRawMany();

    return result.map((r) => ({
      month: parseInt(r.month),
      year: parseInt(r.year),
      monthName: this.getMonthName(parseInt(r.month)),
      collected: parseFloat(r.collected),
    }));
  }

  private async getClassWiseSummary(academicYearId: string): Promise<any[]> {
    return this.dataSource.createQueryBuilder()
      .select('cls.name', 'className')
      .addSelect('cls.grade', 'grade')
      .addSelect('SUM(inv.paid_amount)', 'collected')
      .addSelect('SUM(inv.balance_amount)', 'outstanding')
      .from(FeeInvoice, 'inv')
      .innerJoin('students', 's', 's.id = inv.student_id')
      .leftJoin('classes', 'cls', 'cls.id = s.class_id')
      .where('inv.academic_year_id = :ay', { ay: academicYearId })
      .groupBy('cls.name, cls.grade')
      .orderBy('cls.grade', 'ASC')
      .getRawMany();
  }

  private async getPaymentMethodBreakdown(academicYearId: string): Promise<any[]> {
    return this.paymentRepo.createQueryBuilder('p')
      .innerJoin('fee_invoices', 'inv', 'inv.id = p.invoice_id AND inv.academic_year_id = :ay', { ay: academicYearId })
      .select('p.method', 'method')
      .addSelect('SUM(p.amount)', 'amount')
      .addSelect('COUNT(p.id)', 'count')
      .where('p.status = :status', { status: PaymentStatus.COMPLETED })
      .groupBy('p.method')
      .getRawMany();
  }

  private async getRecentPayments(academicYearId: string, limit: number): Promise<any[]> {
    return this.paymentRepo.createQueryBuilder('p')
      .innerJoin('fee_invoices', 'inv', 'inv.id = p.invoice_id AND inv.academic_year_id = :ay', { ay: academicYearId })
      .leftJoinAndSelect('p.student', 's')
      .leftJoinAndSelect('s.user', 'u')
      .where('p.status = :status', { status: PaymentStatus.COMPLETED })
      .orderBy('p.created_at', 'DESC')
      .take(limit)
      .getMany();
  }

  private async getCollectedForMonth(academicYearId: string, year: number, month: number): Promise<number> {
    const r = await this.paymentRepo.createQueryBuilder('p')
      .innerJoin('fee_invoices', 'inv', 'inv.id = p.invoice_id AND inv.academic_year_id = :ay', { ay: academicYearId })
      .select('SUM(p.amount)', 'total')
      .where('p.status = :status', { status: PaymentStatus.COMPLETED })
      .andWhere('EXTRACT(YEAR FROM p.payment_date) = :year', { year })
      .andWhere('EXTRACT(MONTH FROM p.payment_date) = :month', { month })
      .getRawOne();
    return parseFloat(r?.total || '0');
  }

  private async getInvoicedForMonth(academicYearId: string, month: number): Promise<number> {
    const r = await this.invoiceRepo.createQueryBuilder('inv')
      .select('SUM(inv.total_amount)', 'total')
      .where('inv.academic_year_id = :ay', { ay: academicYearId })
      .andWhere('inv.billing_month = :month', { month })
      .andWhere('inv.status != :cancelled', { cancelled: InvoiceStatus.CANCELLED })
      .getRawOne();
    return parseFloat(r?.total || '0');
  }

  private async getOutstandingForMonth(academicYearId: string, month: number): Promise<number> {
    const r = await this.invoiceRepo.createQueryBuilder('inv')
      .select('SUM(inv.balance_amount)', 'total')
      .where('inv.academic_year_id = :ay', { ay: academicYearId })
      .andWhere('inv.billing_month = :month', { month })
      .andWhere('inv.balance_amount > 0')
      .getRawOne();
    return parseFloat(r?.total || '0');
  }

  private applyPaymentFilters(qb: any, filters: ReportFilterDto): void {
    if (filters.academicYearId) qb.andWhere('inv.academic_year_id = :ay', { ay: filters.academicYearId });
    if (filters.studentId) qb.andWhere('p.student_id = :sid', { sid: filters.studentId });
    if (filters.classId) qb.andWhere('cls.id = :classId', { classId: filters.classId });
    if (filters.fromDate) qb.andWhere('p.payment_date >= :from', { from: filters.fromDate });
    if (filters.toDate) qb.andWhere('p.payment_date <= :to', { to: filters.toDate });
    if (filters.month) qb.andWhere('EXTRACT(MONTH FROM p.payment_date) = :month', { month: filters.month });
    if (filters.year) qb.andWhere('EXTRACT(YEAR FROM p.payment_date) = :year', { year: filters.year });
  }

  private groupByField<T>(items: T[], field: string, valueGetter: (item: T) => number): Record<string, number> {
    return items.reduce((acc, item) => {
      const key = (item as any)[field] || 'other';
      acc[key] = (acc[key] || 0) + valueGetter(item);
      return acc;
    }, {} as Record<string, number>);
  }

  private groupByNestedField<T>(items: T[], keyGetter: (item: T) => string, valueGetter: (item: T) => number): Record<string, number> {
    return items.reduce((acc, item) => {
      const key = keyGetter(item);
      acc[key] = (acc[key] || 0) + valueGetter(item);
      return acc;
    }, {} as Record<string, number>);
  }

  private getMonthName(month: number): string {
    const names = ['', 'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    return names[month] || '';
  }

  private getQuarterMonths(quarter: number): number[] {
    const map: Record<number, number[]> = {
      1: [1, 2, 3], 2: [4, 5, 6], 3: [7, 8, 9], 4: [10, 11, 12],
    };
    return map[quarter] || [];
  }
}
