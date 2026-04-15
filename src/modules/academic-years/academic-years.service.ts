import {
  Injectable, NotFoundException, ConflictException,
  BadRequestException,
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
     *     • If they have a StudentFeePlan  → use ONLY plan items
     *       (the plan may include mandatory tuition + optional library/transport)
     *     • If they have NO plan           → use all mandatory fee structures
     *       for their class (class-specific OR school-wide with class_id = NULL)
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

    // Get all active students for this academic year with their user info
    const students = await this.dataSource.query(`
    SELECT 
      s.id, 
      u.first_name || ' ' || u.last_name as name,
      s.registration_number,
      s.class_id,
      s.admission_date,
      CASE WHEN COUNT(sfp.id) > 0 THEN true ELSE false END as has_plan
    FROM students s
    INNER JOIN users u ON u.id = s.user_id
    LEFT JOIN student_fee_plans sfp ON sfp.student_id = s.id 
      AND sfp.academic_year_id = $1 
      AND sfp.is_active = true
      AND sfp.deleted_at IS NULL
    WHERE s.academic_year_id = $1
      AND s.is_active = true
      AND s.deleted_at IS NULL
    GROUP BY s.id, u.first_name, u.last_name, s.registration_number, s.class_id, s.admission_date
  `, [id]);

    const studentBreakdowns: StudentBreakdown[] = [];

    for (const student of students) {
      let lines: FeeLineBreakdown[] = [];
      let studentAnnualTotal = 0;

      if (student.has_plan) {
        // Get student's custom fee plan items
        const planItems = await this.dataSource.query(`
        SELECT 
          fs.name as fee_name,
          fs.category,
          sfp.billing_frequency as frequency,
          COALESCE(sfp.custom_amount, fs.amount) as monthly_rate,
          sfp.custom_amount IS NOT NULL as is_custom_amount
        FROM student_fee_plans sfp
        JOIN fee_structures fs ON fs.id = sfp.fee_structure_id
        WHERE sfp.student_id = $1 
          AND sfp.academic_year_id = $2
          AND sfp.is_active = true
          AND sfp.deleted_at IS NULL
          AND fs.is_active = true
          AND fs.deleted_at IS NULL
      `, [student.id, id]);

        for (const item of planItems) {
          const monthlyRate = Number(item.monthly_rate);
          const freq = item.frequency;
          const multiplier = frequencyMultiplier[freq] || 1;

          // CRITICAL: amountPerPeriod = monthlyRate × multiplier
          const amountPerPeriod = monthlyRate * multiplier;
          const periodsPerYear = this.getPeriodsPerYear(freq);
          const annualTotal = amountPerPeriod * periodsPerYear;

          lines.push({
            feeName: item.fee_name,
            category: item.category,
            frequency: freq,
            monthlyRate: monthlyRate,
            amountPerPeriod: amountPerPeriod,
            periodsPerYear: periodsPerYear,
            annualTotal: annualTotal,
            isCustomAmount: item.is_custom_amount,
            billingMonths: this.getBillingMonths(freq)
          });

          studentAnnualTotal += annualTotal;
        }
      } else {
        // Get mandatory fees for student's class (no custom plan)
        const mandatoryFees = await this.dataSource.query(`
        SELECT 
          name as fee_name,
          category,
          frequency,
          amount as monthly_rate,
          false as is_custom_amount
        FROM fee_structures
        WHERE academic_year_id = $1
          AND is_mandatory = true
          AND (class_id = $2 OR class_id IS NULL)
          AND is_active = true
          AND deleted_at IS NULL
      `, [id, student.class_id]);

        for (const fee of mandatoryFees) {
          const monthlyRate = Number(fee.monthly_rate);
          const freq = fee.frequency;
          const multiplier = frequencyMultiplier[freq] || 1;
          const amountPerPeriod = monthlyRate * multiplier;
          const periodsPerYear = this.getPeriodsPerYear(freq);
          const annualTotal = amountPerPeriod * periodsPerYear;

          lines.push({
            feeName: fee.fee_name,
            category: fee.category,
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
        name: student.name,
        registrationNumber: student.registration_number,
        hasPlan: student.has_plan,
        lines: lines,
        studentAnnualTotal: studentAnnualTotal
      });
    }

    // Calculate monthly targets based on when payments are collected
    const monthlyTargets = this.calculateMonthlyTargets(studentBreakdowns);
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
      monthly: 'Jan–Dec (every month)',
      quarterly: 'Mar, Jun, Sep, Dec',
      semi_annual: 'Jun, Dec',
      annual: 'Dec only',
      one_time: 'Jan only',
      custom: 'Jan–Dec (every month)'
    };
    return months[frequency] || 'Monthly';
  }

  private calculateMonthlyTargets(studentBreakdowns: StudentBreakdown[]): Record<string, number> {
    const monthlyTargets: Record<string, number> = {};
    for (let i = 1; i <= 12; i++) monthlyTargets[i.toString()] = 0;

    const billingMonthsMap: Record<string, number[]> = {
      monthly: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      quarterly: [3, 6, 9, 12],
      semi_annual: [6, 12],
      annual: [12],
      one_time: [1],
      custom: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    };

    for (const student of studentBreakdowns) {
      for (const line of student.lines) {
        const amountPerPeriod = line.amountPerPeriod;
        const months = billingMonthsMap[line.frequency] || [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

        for (const month of months) {
          monthlyTargets[month.toString()] += amountPerPeriod;
        }
      }
    }

    return monthlyTargets;
  }

  private calculateQuarterlyTargets(monthlyTargets: Record<string, number>): Record<string, number> {
    return {
      Q1: (monthlyTargets['1'] || 0) + (monthlyTargets['2'] || 0) + (monthlyTargets['3'] || 0),
      Q2: (monthlyTargets['4'] || 0) + (monthlyTargets['5'] || 0) + (monthlyTargets['6'] || 0),
      Q3: (monthlyTargets['7'] || 0) + (monthlyTargets['8'] || 0) + (monthlyTargets['9'] || 0),
      Q4: (monthlyTargets['10'] || 0) + (monthlyTargets['11'] || 0) + (monthlyTargets['12'] || 0),
    };
  }




}
