import {
  Injectable, NotFoundException, ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { AcademicYear } from './entities/academic-year.entity';
import { CreateAcademicYearDto, UpdateAcademicYearDto } from './dto/academic-year.dto';

@Injectable()
export class AcademicYearsService {
  constructor(
    @InjectRepository(AcademicYear) private readonly repo: Repository<AcademicYear>,
    private readonly dataSource: DataSource,
  ) {}

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
    const year = await this.findOne(id);
    if (dto.isCurrent) await this.repo.update({}, { isCurrent: false });
    Object.assign(year, dto);
    return this.repo.save(year);
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
   * Formula:
   *   Annual target = Σ (per student):
   *     • All MANDATORY fee structures applicable to the student's class × 12 months
   *       (adjusted for their billing frequency — quarterly charges come 4×/year etc.)
   *     • ALL active StudentFeePlan entries for that student × their billing frequency
   *       (these include optional services like library, transport, lab)
   *
   * Monthly target for month M = sum of all plan items that are due in month M
   * based on the student's chosen billing frequency and admission date.
   *
   * This replaces manual monthly_targets / quarterly_targets / fee_target inputs.
   */
  async recalculateTargets(id: string): Promise<AcademicYear> {
    const year = await this.findOne(id);

    // 1. Get all active students for this year
    const students = await this.dataSource.query(`
      SELECT s.id, s.class_id, s.admission_date
      FROM students s
      WHERE s.academic_year_id = $1
        AND s.is_active = true
        AND s.deleted_at IS NULL
    `, [id]);

    if (!students.length) {
      year.feeTarget = 0;
      year.monthlyTargets = {};
      year.quarterlyTargets = {};
      return this.repo.save(year);
    }

    // 2. Get all mandatory fee structures for this year (grouped by class)
    const mandatoryFees = await this.dataSource.query(`
      SELECT id, class_id, amount, frequency, category
      FROM fee_structures
      WHERE academic_year_id = $1
        AND is_mandatory = true
        AND is_active = true
        AND deleted_at IS NULL
    `, [id]);

    // 3. Get all active student fee plans for this year (includes optional services)
    const feePlans = await this.dataSource.query(`
      SELECT sfp.student_id, sfp.billing_frequency, sfp.custom_amount,
             fs.amount AS base_amount, fs.category, fs.is_mandatory
      FROM student_fee_plans sfp
      JOIN fee_structures fs ON fs.id = sfp.fee_structure_id
      WHERE sfp.academic_year_id = $1
        AND sfp.is_active = true
        AND sfp.deleted_at IS NULL
        AND fs.is_active = true
    `, [id]);

    // Map student_id → their fee plans
    const plansByStudent = new Map<string, any[]>();
    for (const plan of feePlans) {
      if (!plansByStudent.has(plan.student_id)) plansByStudent.set(plan.student_id, []);
      plansByStudent.get(plan.student_id).push(plan);
    }

    // Multiplier: how many billing periods per year
    const periodsPerYear: Record<string, number> = {
      one_time: 1, monthly: 12, quarterly: 4, semi_annual: 2, annual: 1, custom: 1,
    };
    // Monthly contribution: how much of the annual amount falls in each month
    // e.g. quarterly fee is charged in months 3,6,9,12
    const billingMonths: Record<string, number[]> = {
      one_time:    [1],
      monthly:     [1,2,3,4,5,6,7,8,9,10,11,12],
      quarterly:   [3,6,9,12],
      semi_annual: [6,12],
      annual:      [12],
      custom:      [1,2,3,4,5,6,7,8,9,10,11,12],
    };

    const monthlyTargets: Record<string, number> = {};
    for (let m = 1; m <= 12; m++) monthlyTargets[m.toString()] = 0;

    let annualTotal = 0;

    for (const student of students) {
      // Determine mandatory fee structures applicable to this student's class
      const mandatoryForStudent = mandatoryFees.filter(
        (f: any) => !f.class_id || f.class_id === student.class_id,
      );

      // If student has a fee plan, use ONLY plan items (they override class defaults)
      const studentPlans = plansByStudent.get(student.id) || [];

      let studentAnnual = 0;

      if (studentPlans.length > 0) {
        // Student has an explicit fee plan — use it
        for (const plan of studentPlans) {
          const baseAmount = plan.custom_amount ? Number(plan.custom_amount) : Number(plan.base_amount);
          const freq = plan.billing_frequency as string;
          const periods = periodsPerYear[freq] ?? 1;
          const amountPerPeriod = baseAmount;
          const annual = amountPerPeriod * periods;
          studentAnnual += annual;

          // Distribute into monthly targets
          const months = billingMonths[freq] || [1];
          for (const m of months) {
            monthlyTargets[m.toString()] = (monthlyTargets[m.toString()] || 0) + amountPerPeriod;
          }
        }
      } else {
        // No fee plan — use mandatory class fee structures
        for (const fee of mandatoryForStudent) {
          const amount = Number(fee.amount);
          const freq = fee.frequency as string;
          const periods = periodsPerYear[freq] ?? 1;
          const annual = amount * periods;
          studentAnnual += annual;

          const months = billingMonths[freq] || [1];
          for (const m of months) {
            monthlyTargets[m.toString()] = (monthlyTargets[m.toString()] || 0) + amount;
          }
        }
      }

      annualTotal += studentAnnual;
    }

    // Build quarterly targets from monthly
    const quarterlyTargets: Record<string, number> = {
      Q1: (monthlyTargets['1'] || 0) + (monthlyTargets['2'] || 0) + (monthlyTargets['3'] || 0),
      Q2: (monthlyTargets['4'] || 0) + (monthlyTargets['5'] || 0) + (monthlyTargets['6'] || 0),
      Q3: (monthlyTargets['7'] || 0) + (monthlyTargets['8'] || 0) + (monthlyTargets['9'] || 0),
      Q4: (monthlyTargets['10'] || 0) + (monthlyTargets['11'] || 0) + (monthlyTargets['12'] || 0),
    };

    year.feeTarget = annualTotal;
    year.monthlyTargets = monthlyTargets;
    year.quarterlyTargets = quarterlyTargets;

    return this.repo.save(year);
  }

  /**
   * Returns a detailed breakdown of how the target was calculated.
   * Useful for showing in the UI why a certain number was arrived at.
   */
  async getTargetBreakdown(id: string): Promise<any> {
    const year = await this.recalculateTargets(id); // Refresh first

    const studentCount = await this.dataSource.query(`
      SELECT COUNT(*) as count FROM students
      WHERE academic_year_id = $1 AND is_active = true AND deleted_at IS NULL
    `, [id]);

    const planStats = await this.dataSource.query(`
      SELECT sfp.billing_frequency, COUNT(DISTINCT sfp.student_id) as student_count,
             SUM(COALESCE(sfp.custom_amount, fs.amount)) as total_amount,
             fs.category
      FROM student_fee_plans sfp
      JOIN fee_structures fs ON fs.id = sfp.fee_structure_id
      WHERE sfp.academic_year_id = $1 AND sfp.is_active = true AND sfp.deleted_at IS NULL
      GROUP BY sfp.billing_frequency, fs.category
      ORDER BY fs.category, sfp.billing_frequency
    `, [id]);

    const mandatoryStats = await this.dataSource.query(`
      SELECT fs.category, fs.frequency, COUNT(DISTINCT s.id) as student_count,
             SUM(fs.amount) as fee_amount
      FROM fee_structures fs
      CROSS JOIN students s
      WHERE fs.academic_year_id = $1
        AND fs.is_mandatory = true AND fs.is_active = true
        AND (fs.class_id IS NULL OR fs.class_id = s.class_id)
        AND s.academic_year_id = $1 AND s.is_active = true
        AND NOT EXISTS (
          SELECT 1 FROM student_fee_plans sfp WHERE sfp.student_id = s.id
          AND sfp.academic_year_id = $1 AND sfp.is_active = true
        )
      GROUP BY fs.category, fs.frequency
    `, [id]);

    return {
      academicYear: year.name,
      totalStudents: parseInt(studentCount[0]?.count || '0'),
      annualTarget: year.feeTarget,
      monthlyTargets: year.monthlyTargets,
      quarterlyTargets: year.quarterlyTargets,
      breakdown: {
        studentsWithCustomPlan: planStats,
        studentsWithClassDefault: mandatoryStats,
      },
    };
  }
}
