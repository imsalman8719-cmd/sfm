import {
  Injectable, NotFoundException, ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { StudentFeePlan } from './entities/student-fee-plan.entity';
import {
  CreateStudentFeePlanDto,
  UpdateStudentFeePlanDto,
  BulkAssignFeePlanDto,
} from './dto/student-fee-plan.dto';
import { FeeFrequency } from '../../common/enums';

/**
 * Multiplier table: how many monthly base-units each frequency represents.
 * Used to auto-calculate the invoice amount when no custom amount is set.
 *
 *  monthly    → ×1   (base amount as-is)
 *  quarterly  → ×3   (3 months)
 *  semi_annual→ ×6   (6 months)
 *  annual     → ×12  (12 months)
 *  one_time   → ×1   (treated as the full amount, no multiplication)
 */
export const FREQUENCY_MULTIPLIER: Record<FeeFrequency, number> = {
  [FeeFrequency.ONE_TIME]:    1,
  [FeeFrequency.MONTHLY]:     1,
  [FeeFrequency.QUARTERLY]:   3,
  [FeeFrequency.SEMI_ANNUAL]: 6,
  [FeeFrequency.ANNUAL]:      12,
  [FeeFrequency.CUSTOM]:      1,
};

@Injectable()
export class StudentFeePlansService {
  constructor(
    @InjectRepository(StudentFeePlan)
    private readonly planRepo: Repository<StudentFeePlan>,
  ) {}

  // ── CRUD ────────────────────────────────────────────────────────────────────

  async create(dto: CreateStudentFeePlanDto, createdBy?: string): Promise<StudentFeePlan> {
    const existing = await this.planRepo.findOne({
      where: {
        studentId: dto.studentId,
        feeStructureId: dto.feeStructureId,
        academicYearId: dto.academicYearId,
      },
    });
    if (existing) {
      throw new ConflictException(
        'A fee plan for this student + fee structure + academic year already exists. Use PATCH to update it.',
      );
    }

    const plan = this.planRepo.create({ ...dto, createdBy });
    return this.planRepo.save(plan);
  }

  async bulkAssign(dto: BulkAssignFeePlanDto, createdBy?: string): Promise<{ created: number; skipped: number }> {
    let created = 0;
    let skipped = 0;

    for (const studentId of dto.studentIds) {
      const existing = await this.planRepo.findOne({
        where: { studentId, feeStructureId: dto.feeStructureId, academicYearId: dto.academicYearId },
      });
      if (existing) { skipped++; continue; }

      await this.planRepo.save(this.planRepo.create({
        studentId,
        feeStructureId: dto.feeStructureId,
        academicYearId: dto.academicYearId,
        billingFrequency: dto.billingFrequency,
        customAmount: dto.customAmount ?? null,
        notes: dto.notes,
        createdBy,
      }));
      created++;
    }
    return { created, skipped };
  }

  async findByStudent(studentId: string, academicYearId?: string): Promise<StudentFeePlan[]> {
    const where: any = { studentId, isActive: true };
    if (academicYearId) where.academicYearId = academicYearId;
    return this.planRepo.find({
      where,
      relations: ['feeStructure', 'academicYear'],
      order: { createdAt: 'ASC' },
    });
  }

  async findOne(id: string): Promise<StudentFeePlan> {
    const plan = await this.planRepo.findOne({
      where: { id },
      relations: ['student', 'student.user', 'feeStructure', 'academicYear'],
    });
    if (!plan) throw new NotFoundException(`Fee plan #${id} not found`);
    return plan;
  }

  async update(id: string, dto: UpdateStudentFeePlanDto): Promise<StudentFeePlan> {
    const plan = await this.findOne(id);
    Object.assign(plan, dto);
    return this.planRepo.save(plan);
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.planRepo.softDelete(id);
  }

  async toggleActive(id: string): Promise<StudentFeePlan> {
    const plan = await this.findOne(id);
    plan.isActive = !plan.isActive;
    return this.planRepo.save(plan);
  }

  // ── Core logic: resolve invoice amount for a student+feeStructure ────────────

  /**
   * Returns the effective billing amount for a student's fee plan entry.
   *
   * Logic:
   *  1. If plan has a customAmount → use it directly
   *  2. Otherwise → feeStructure.amount (monthly base) × frequency multiplier
   *
   * Example:
   *   feeStructure.amount = 8500 (monthly base)
   *   plan.billingFrequency = quarterly → 8500 × 3 = 25,500
   */
  resolveAmount(plan: StudentFeePlan): number {
    if (plan.customAmount !== null && plan.customAmount !== undefined) {
      return Number(plan.customAmount);
    }
    const base = Number(plan.feeStructure?.amount ?? 0);
    const multiplier = FREQUENCY_MULTIPLIER[plan.billingFrequency] ?? 1;
    return base * multiplier;
  }

  /**
   * Get the student's active fee plan for a given academic year.
   * Returns null if the student has no plan (should fall back to class defaults).
   */
  async getStudentPlan(
    studentId: string,
    academicYearId: string,
  ): Promise<StudentFeePlan[]> {
    return this.planRepo.find({
      where: { studentId, academicYearId, isActive: true },
      relations: ['feeStructure'],
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Preview what invoice amounts would look like for a student's plan.
   */
  async previewInvoice(studentId: string, academicYearId: string): Promise<{
    hasPlan: boolean;
    plans: Array<{
      feeStructureName: string;
      billingFrequency: FeeFrequency;
      baseAmount: number;
      billedAmount: number;
      multiplier: number;
    }>;
    totalAmount: number;
  }> {
    const plans = await this.getStudentPlan(studentId, academicYearId);

    if (!plans.length) {
      return { hasPlan: false, plans: [], totalAmount: 0 };
    }

    const breakdown = plans.map((p) => {
      const multiplier = FREQUENCY_MULTIPLIER[p.billingFrequency];
      const baseAmount = Number(p.feeStructure?.amount ?? 0);
      const billedAmount = this.resolveAmount(p);
      return {
        feeStructureName: p.feeStructure?.name ?? '',
        billingFrequency: p.billingFrequency,
        baseAmount,
        billedAmount,
        multiplier,
      };
    });

    return {
      hasPlan: true,
      plans: breakdown,
      totalAmount: breakdown.reduce((s, b) => s + b.billedAmount, 0),
    };
  }
}
