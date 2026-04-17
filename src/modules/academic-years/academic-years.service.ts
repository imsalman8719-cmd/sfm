import {
  Injectable, NotFoundException, ConflictException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { AcademicYear } from './entities/academic-year.entity';
import { CreateAcademicYearDto, UpdateAcademicYearDto } from './dto/academic-year.dto';

// Define interfaces locally or import from a types file
export interface FeeLineBreakdown {
  feeName: string;
  category: string;
  frequency: string;
  monthlyRate: number;
  amountPerPeriod: number;
  periodsPerYear: number;
  annualTotal: number;
  isCustomAmount: boolean;
  billingMonths: string;
}

export interface StudentBreakdown {
  studentId: string;
  name: string;
  registrationNumber: string;
  admissionDate?: string;
  hasPlan: boolean;
  lines: FeeLineBreakdown[];
  studentAnnualTotal: number;
}

export interface TargetBreakdown {
  academicYear: string;
  totalStudents: number;
  annualTarget: number;
  monthlyTargets: Record<string, number>;
  quarterlyTargets: Record<string, number>;
  students: StudentBreakdown[];
  grandTotal: number;
  explanation: string;
}

@Injectable()
export class AcademicYearsService {
  constructor(
    @InjectRepository(AcademicYear) private readonly repo: Repository<AcademicYear>,
    private readonly dataSource: DataSource,
  ) { }

  async create(dto: CreateAcademicYearDto): Promise<AcademicYear> {
    const existing = await this.repo.findOne({ where: { name: dto.name } });
    if (existing) throw new ConflictException(`Academic year '${dto.name}' already exists`);
    if (dto.isCurrent) await this.repo.update({}, { isCurrent: false });
    const year = this.repo.create(dto);
    return this.repo.save(year);
  }

  async findAll(): Promise<AcademicYear[]> {
    return this.repo.find({ order: { startDate: 'DESC' } });
  }

  async findOne(id: string): Promise<AcademicYear> {
    const year = await this.repo.findOne({ where: { id } });
    if (!year) throw new NotFoundException(`Academic year #${id} not found`);
    return year;
  }

  async findCurrent(): Promise<AcademicYear> {
    const year = await this.repo.findOne({ where: { isCurrent: true } });
    if (!year) throw new NotFoundException('No current academic year set');
    return year;
  }

  async update(id: string, dto: UpdateAcademicYearDto): Promise<AcademicYear> {
    // Check if academic year exists
    const existingYear = await this.findOne(id);
    console.log(`Update year info ${JSON.stringify(dto)}`)
    // Build update data - map isCurrent to isActive if your entity uses isActive
    const updateData: any = {};

    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.startDate !== undefined) updateData.startDate = dto.startDate;
    if (dto.endDate !== undefined) updateData.endDate = dto.endDate;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.isCurrent !== undefined) updateData.isCurrent = dto.isCurrent;

    
    console.log('Update data being sent to repository:', updateData);

    // Check if there's any data to update
    if (Object.keys(updateData).length === 0) {
      throw new BadRequestException('No valid update data provided');
    }

    // If dates are being updated, check for overlaps
    if (dto.startDate || dto.endDate) {
      const startDate = dto.startDate || existingYear.startDate;
      const endDate = dto.endDate || existingYear.endDate;

      const overlapping = await this.repo
        .createQueryBuilder('ay')
        .where('ay.id != :id', { id })
        .andWhere(
          '(ay.start_date <= :endDate AND ay.end_date >= :startDate)',
          { startDate, endDate },
        )
        .getOne();

      if (overlapping) {
        throw new BadRequestException('Dates overlap with another academic year');
      }
    }

    // If setting as current (active), unset others
    if (updateData.isCurrent === true) {
      console.log('set other to non current');
      await this.repo.update({ isCurrent: true }, { isCurrent: false });
    }

    console.log(`set this one to current ${JSON.stringify(updateData)}`);
    // Perform the update
    await this.repo.update(id, updateData);

    // Return the updated entity
    return this.findOne(id);
  }

  async setCurrent(id: string): Promise<AcademicYear> {
    await this.repo.update({}, { isCurrent: false });
    const year = await this.findOne(id);
    year.isCurrent = true;
    return this.repo.save(year);
  }

  async delete(id: string): Promise<void> {
    await this.findOne(id);
    await this.repo.softDelete(id);
  }

  /**
     * AUTO-CALCULATE fee targets for an academic year.
     *
     * ─────────────────────────────────────────────────────────────
     * RULES:
     *
     *  1. For each active student, determine their fee lines:
     *     • Mandatory fee structures for their class (always included)
     *     • Optional fee structures in student.selected_fee_structure_ids (chosen at enrollment)
     *
     *  2. For each fee line, calculate:
     *     • amountPerPeriod = custom_amount ?? base_amount from fee_structure
     *       IMPORTANT: base_amount in fee_structures is ALWAYS the MONTHLY rate
     *       For different frequencies, we multiply by the appropriate factor:
     *         - monthly:     amountPerPeriod = monthly_rate × 1
     *         - quarterly:   amountPerPeriod = monthly_rate × 3
     *         - semi_annual: amountPerPeriod = monthly_rate × 6
     *         - annual:      amountPerPeriod = monthly_rate × 12
     *         - one_time:    amountPerPeriod = monthly_rate (but only billed once)
     *     
     *     • periodsPerYear   = how many times this is charged per year
     *       (monthly=12, quarterly=4, semi_annual=2, annual=1, one_time=1)
     *     
     *     • annualContribution = amountPerPeriod × periodsPerYear
     *       This equals monthly_rate × 12 for all frequencies (no discount, no markup)
     *
     *  3. Monthly target for month M:
     *     The monthly target represents the CASH EXPECTED TO BE COLLECTED in
     *     month M — not the invoice amount. Since invoices are raised before
     *     the period ends, collection happens in the billing month.
     *
     *     • Monthly plans  → add amountPerPeriod to EVERY month (Jan–Dec)
     *     • Quarterly plans → add amountPerPeriod to months 3, 6, 9, 12
     *                         (Q1 collected in Mar, Q2 in Jun, Q3 in Sep, Q4 in Dec)
     *     • Semi-annual    → add amountPerPeriod to months 6 and 12
     *     • Annual         → add amountPerPeriod to month 12
     *     • One-time       → add amountPerPeriod to month 1 (admission month)
     *
     *  4. Consistency check:
     *     Σ(monthlyTargets[1..12]) must equal annualTotal.
     *     This is guaranteed because:
     *       monthly:     12 months × (monthly_rate) = 12 × monthly_rate ✓
     *       quarterly:   4 months  × (monthly_rate × 3) = 12 × monthly_rate ✓
     *       semi_annual: 2 months  × (monthly_rate × 6) = 12 × monthly_rate ✓
     *       annual:      1 month   × (monthly_rate × 12) = 12 × monthly_rate ✓
     * ─────────────────────────────────────────────────────────────
     */
  // In your backend service (academic-year.service.ts or similar)

  // In your backend service (academic-year.service.ts or similar)

  // Add the recalculateTargets method
  async recalculateTargets(id: string): Promise<AcademicYear> {
    const year = await this.findOne(id);

    // Get the breakdown which has the correct calculations
    const breakdown = await this.getTargetBreakdown(id);

    year.feeTarget = breakdown.annualTarget;
    year.monthlyTargets = breakdown.monthlyTargets;
    year.quarterlyTargets = breakdown.quarterlyTargets;

    return this.repo.save(year);
  }

  // Add the getTargetBreakdown method
  async getTargetBreakdown(id: string): Promise<any> {
    const year = await this.findOne(id);

    // Frequency multipliers (converting monthly rate to period rate)
    const frequencyMultiplier: Record<string, number> = {
      monthly: 1,
      quarterly: 3,
      semi_annual: 6,
      annual: 12,
      one_time: 1,
      custom: 1,
    };

    // Get all active students for this academic year
    const students = await this.dataSource.query(`
    SELECT 
      s.id, 
      u.first_name || ' ' || u.last_name as name,
      s.registration_number,
      s.class_id,
      s.admission_date,
      s.billing_frequency,
      COALESCE(s.selected_fee_structure_ids, '{}') as selected_fee_structure_ids
    FROM students s
    INNER JOIN users u ON u.id = s.user_id
    WHERE s.academic_year_id = $1
      AND s.is_active = true
      AND s.deleted_at IS NULL
  `, [id]);

    const studentBreakdowns: StudentBreakdown[] = [];

    for (const student of students) {
      let lines: FeeLineBreakdown[] = [];
      let studentAnnualTotal = 0;

      {
        // Fetch ALL fee structures that apply to this student:
        //   1. Mandatory structures for their class (always included)
        //   2. Optional structures in selected_fee_structure_ids (chosen at enrollment)
        // This mirrors exactly what fee-invoices.service.ts:resolveStudentFeeStructures() does.
        const studentFees = await this.dataSource.query(`
        SELECT DISTINCT
          fs.name as fee_name,
          fs.amount as monthly_rate,
          fs.is_one_time
        FROM fee_structures fs
        WHERE fs.academic_year_id = $1
          AND fs.is_active = true
          AND fs.deleted_at IS NULL
          AND (
            (fs.is_mandatory = true AND (fs.class_id = $2 OR fs.class_id IS NULL))
            OR
            (fs.id = ANY($3::uuid[]))
          )
      `, [id, student.class_id, student.selected_fee_structure_ids || []]);

        for (const fee of studentFees) {
          const monthlyRate = Number(fee.monthly_rate);
          // One-time fees use one_time frequency; all others use student's billing_frequency
          const freq = fee.is_one_time ? 'one_time' : (student.billing_frequency || 'monthly');
          const multiplier = frequencyMultiplier[freq] || 1;
          const amountPerPeriod = monthlyRate * multiplier;
          const periodsPerYear = this.getPeriodsPerYear(freq);
          const annualTotal = amountPerPeriod * periodsPerYear;

          lines.push({
            feeName: fee.fee_name,
            category: fee.is_one_time ? 'one-time' : 'recurring',
            frequency: freq,
            monthlyRate: monthlyRate,
            amountPerPeriod: amountPerPeriod,
            periodsPerYear: periodsPerYear,
            annualTotal: annualTotal,
            isCustomAmount: false,
            billingMonths: this.getBillingMonths(freq)
          });

          studentAnnualTotal += annualTotal;
        }
      }

      studentBreakdowns.push({
        studentId: student.id,
        admissionDate: student.admission_date,
        name: student.name,
        registrationNumber: student.registration_number,
        hasPlan: false,
        lines: lines,
        studentAnnualTotal: studentAnnualTotal
      });
    }

    // Calculate monthly targets based on academic year months only
    const yearMonths = this.getAcademicYearMonths(new Date(year.startDate), new Date(year.endDate));
    const monthlyTargets = this.calculateMonthlyTargets(studentBreakdowns, yearMonths);
    const quarterlyTargets = this.calculateQuarterlyTargets(monthlyTargets);
    const annualTarget = studentBreakdowns.reduce((sum, s) => sum + s.studentAnnualTotal, 0);

    return {
      academicYear: year.name,
      totalStudents: students.length,
      annualTarget: annualTarget,
      monthlyTargets: monthlyTargets,
      quarterlyTargets: quarterlyTargets,
      students: studentBreakdowns,
      grandTotal: annualTarget,
      explanation: "Annual total = monthly rate × 12 for all students regardless of payment frequency"
    };
  }

  private getPeriodsPerYear(frequency: string): number {
    const periods: Record<string, number> = {
      monthly: 12,
      quarterly: 4,
      semi_annual: 2,
      annual: 1,
      one_time: 1,
      custom: 12
    };
    return periods[frequency] || 12;
  }

  private getBillingMonths(frequency: string): string {
    const months: Record<string, string> = {
      monthly: 'Every month',
      quarterly: 'Every quarter end (Mar, Jun, Sep, Dec)',
      semi_annual: 'Jun & Dec',
      annual: 'Last month of year',
      one_time: 'Enrollment month only',
      custom: 'Every month'
    };
    return months[frequency] || 'Every month';
  }

  /**
   * Returns every calendar month (as {year, month} pairs) covered by this academic year.
   * e.g. Feb 2026 → Apr 2027 gives:
   *   [{2026,2},{2026,3},...,{2026,12},{2027,1},{2027,2},{2027,3},{2027,4}]
   */
  private getAcademicYearMonths(startDate: Date, endDate: Date): Array<{year:number;month:number;key:string}> {
    const months: Array<{year:number;month:number;key:string}> = [];
    const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    const end    = new Date(endDate.getFullYear(),   endDate.getMonth(),   1);
    while (cursor <= end) {
      months.push({ year: cursor.getFullYear(), month: cursor.getMonth() + 1, key: `${cursor.getFullYear()}-${cursor.getMonth()+1}` });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return months;
  }

  private calculateMonthlyTargets(
    studentBreakdowns: StudentBreakdown[],
    yearMonths: Array<{year:number;month:number;key:string}>,
  ): Record<string, number> {
    // Initialise only the months that actually exist in this academic year
    const monthlyTargets: Record<string, number> = {};
    for (const ym of yearMonths) monthlyTargets[ym.key] = 0;

    // Which month-keys get each billing frequency's payment?
    // monthly     → every month in the year
    // quarterly   → last month of each quarter that falls within the year
    // semi_annual → Jun and Dec of each calendar year within the year
    // annual      → first month of the academic year
    // one_time    → first month of the academic year

    // Build which keys apply for quarterly (last month of each quarter: Mar,Jun,Sep,Dec)
    const quarterlyKeys = yearMonths
      .filter(ym => [3, 6, 9, 12].includes(ym.month))
      .map(ym => ym.key);

    // Build which keys apply for semi_annual (Jun and Dec)
    const semiAnnualKeys = yearMonths
      .filter(ym => [6, 12].includes(ym.month))
      .map(ym => ym.key);

    // Build which key applies for annual (last month of academic year)
    const annualKey = yearMonths[yearMonths.length - 1]?.key;

    for (const student of studentBreakdowns) {
      // Use the student's actual admission month as the starting point for targets.
      // Fees should not appear in months before the student enrolled.
      const admDate = student.admissionDate ? new Date(student.admissionDate) : null;
      const enrollYear  = admDate ? admDate.getFullYear()  : yearMonths[0]?.year;
      const enrollMonth = admDate ? admDate.getMonth() + 1 : yearMonths[0]?.month;
      // Use numeric comparison (year*100+month) to avoid lexicographic pitfall:
      // "2026-10" < "2026-4" as strings but 202610 > 202604 as numbers ✓
      const enrollOrd = (enrollYear ?? 0) * 100 + (enrollMonth ?? 0);
      const afterEnroll = (ym: { year: number; month: number }) =>
        ym.year * 100 + ym.month >= enrollOrd;

      // Months from enrollment to year end (for monthly / recurring fees)
      const monthsFromEnrollment = yearMonths.filter(afterEnroll);

      // Rolling period keys — mirrors exactly what computeBillingPeriods() does
      // in fee-invoices.service.ts so target matches actual invoice schedule.

      // Semi-annual: Period 1 = enrollment month, Period 2 = enrollment+6mo, etc.
      const semiRollingKeys: string[] = [];
      {
        let cur = new Date((enrollYear ?? 2000), (enrollMonth ?? 1) - 1 + 6, 1);
        while (cur.getFullYear() * 100 + cur.getMonth() + 1 <= (yearMonths[yearMonths.length-1]?.year ?? 9999) * 100 + (yearMonths[yearMonths.length-1]?.month ?? 12)) {
          const k = `${cur.getFullYear()}-${cur.getMonth() + 1}`;
          if (monthlyTargets[k] !== undefined) semiRollingKeys.push(k);
          cur.setMonth(cur.getMonth() + 6);
        }
      }

      // Quarterly: Period 1 = enrollment month, Period 2 = enrollment+3mo, etc.
      const quarterlyRollingKeys: string[] = [];
      {
        let cur = new Date((enrollYear ?? 2000), (enrollMonth ?? 1) - 1 + 3, 1);
        while (cur.getFullYear() * 100 + cur.getMonth() + 1 <= (yearMonths[yearMonths.length-1]?.year ?? 9999) * 100 + (yearMonths[yearMonths.length-1]?.month ?? 12)) {
          const k = `${cur.getFullYear()}-${cur.getMonth() + 1}`;
          if (monthlyTargets[k] !== undefined) quarterlyRollingKeys.push(k);
          cur.setMonth(cur.getMonth() + 3);
        }
      }

      // The enrollment month key — first invoice is always raised here
      const enrollKey = `${enrollYear}-${enrollMonth}`;

      for (const line of student.lines) {
        const amountPerPeriod = line.amountPerPeriod;
        let targetKeys: string[];

        // RULE: The first invoice always combines admission fee + first billing period
        // and is raised in the enrollment month. So for ALL recurring fee types,
        // the FIRST period target goes into the enrollment month.
        // Subsequent periods go into their normal billing months.
        //
        // This mirrors exactly what fee-invoices.service.ts generateYearInvoices() does:
        //   Invoice #1 (enrollment month): admissionFees + recurringFees[first period]
        //   Invoice #2..N: recurringFees[remaining periods]

        // periodsPerYear tells us how many invoices this student gets total.
        // Period 1 always goes to the enrollment month (first combined invoice).
        // Periods 2..N go to the natural billing months AFTER enrollment.
        const periodsPerYear = this.getPeriodsPerYear(line.frequency);

        switch (line.frequency) {
          case 'monthly':
          case 'custom': {
            // 12 periods: one per month from enrollment onward (already correct)
            targetKeys = monthsFromEnrollment.map(ym => ym.key);
            break;
          }
          case 'quarterly': {
            // Period 1 → enrollment month (combined with admission fee invoice)
            // Periods 2..N → rolling 3-month intervals after enrollment
            // e.g. enrolled Apr 2026 → Apr(P1), Jul(P2), Oct(P3), Jan 2027(P4)
            targetKeys = [enrollKey, ...quarterlyRollingKeys].filter(
              k => monthlyTargets[k] !== undefined,
            );
            break;
          }
          case 'semi_annual': {
            // Period 1 → enrollment month (combined with admission fee invoice)
            // Periods 2..N → rolling 6-month intervals after enrollment
            // e.g. enrolled Apr 2026 → Apr(P1), Oct 2026(P2) = 2 periods
            targetKeys = [enrollKey, ...semiRollingKeys].filter(
              k => monthlyTargets[k] !== undefined,
            );
            break;
          }
          case 'annual': {
            // 1 period total → enrollment month only
            targetKeys = monthlyTargets[enrollKey] !== undefined ? [enrollKey] : [];
            break;
          }
          case 'one_time': {
            // 1 period → enrollment month only
            targetKeys = monthlyTargets[enrollKey] !== undefined ? [enrollKey] : [];
            break;
          }
          default:
            targetKeys = monthsFromEnrollment.map(ym => ym.key);
        }

        for (const key of targetKeys) {
          if (monthlyTargets[key] !== undefined) {
            monthlyTargets[key] += amountPerPeriod;
          }
        }
      }
    }

    return monthlyTargets;
  }

  private calculateQuarterlyTargets(monthlyTargets: Record<string, number>): Record<string, number> {
    // Sum all monthly target keys — keys are now 'YYYY-M'
    const total = (months: number[]) =>
      Object.entries(monthlyTargets)
        .filter(([key]) => {
          const m = parseInt(key.split('-')[1]);
          return months.includes(m);
        })
        .reduce((s, [, v]) => s + v, 0);
    return {
      Q1: total([1, 2, 3]),
      Q2: total([4, 5, 6]),
      Q3: total([7, 8, 9]),
      Q4: total([10, 11, 12]),
    };
  }




}
