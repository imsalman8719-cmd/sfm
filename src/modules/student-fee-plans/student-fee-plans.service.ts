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
import { Student } from '../students/entities/student.entity';
import { PaginatedResult, PaginationDto } from 'src/common/dto/pagination.dto';

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
  [FeeFrequency.ONE_TIME]: 1,
  [FeeFrequency.MONTHLY]: 1,
  [FeeFrequency.QUARTERLY]: 3,
  [FeeFrequency.SEMI_ANNUAL]: 6,
  [FeeFrequency.ANNUAL]: 12,
  [FeeFrequency.CUSTOM]: 1,
};

@Injectable()
export class StudentFeePlansService {
  constructor(
    @InjectRepository(StudentFeePlan)
    private readonly planRepo: Repository<StudentFeePlan>,
    @InjectRepository(Student) // Now this will work
    private studentRepo: Repository<Student>
  ) { }

  // ── CRUD ────────────────────────────────────────────────────────────────────

  async create(dto: CreateStudentFeePlanDto, createdBy?: string): Promise<StudentFeePlan> {
    const existing = await this.planRepo.findOne({
      where: {
        studentId: dto.studentId,
        feeStructureId: dto.feeStructureId,
        academicYearId: dto.academicYearId

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

  async findAll(
    pagination: PaginationDto,
    academicYearId?: string,
    billingFrequency?: string,
  ): Promise<PaginatedResult<StudentFeePlan>> {
    const idQb = this.planRepo.createQueryBuilder('plan')
      .select('plan.id', 'id')
      .where('plan.deleted_at IS NULL');

    // Filter by academic year
    if (academicYearId) {
      idQb.andWhere('plan.academic_year_id = :academicYearId', { academicYearId });
    }
    if (billingFrequency) {
      idQb.andWhere('plan.billing_frequency = :billingFrequency', { billingFrequency });
    }

    // // Filter by active status (if needed)
    // if (pagination.isActive !== undefined) {
    //   idQb.andWhere('plan.is_active = :isActive', { isActive: pagination.isActive });
    // }

    // // Filter by billing frequency
    // if (pagination.billingFrequency) {
    //   idQb.andWhere('plan.billing_frequency = :billingFrequency', {
    //     billingFrequency: pagination.billingFrequency
    //   });
    // }

    // // Filter by fee structure
    // if (pagination.feeStructureId) {
    //   idQb.andWhere('plan.fee_structure_id = :feeStructureId', {
    //     feeStructureId: pagination.feeStructureId
    //   });
    // }

    // // Filter by student (via studentId or registration number)
    // if (pagination.studentId) {
    //   idQb.andWhere('plan.student_id = :studentId', { studentId: pagination.studentId });
    // } else if (pagination.registrationNumber) {
    //   // First find student by registration number
    //   const student = await this.studentRepo.findOne({
    //     where: { registrationNumber: pagination.registrationNumber, isActive: true }
    //   });

    //   if (!student) {
    //     throw new NotFoundException(`Student with registration number ${pagination.registrationNumber} not found`);
    //   }

    //   idQb.andWhere('plan.student_id = :studentId', { studentId: student.id });
    // }

    // Search functionality (search by student name, registration number, or notes)
    if (pagination.search) {
      // For complex search, we need to join with student
      idQb.leftJoin('plan.student', 'student')
        .leftJoin('student.user', 'user')
        .andWhere('(student.registration_number ILIKE :search OR ' +
          'user.first_name ILIKE :search OR ' +
          'user.last_name ILIKE :search OR ' +
          'student.father_name ILIKE :search OR ' +
          'plan.notes ILIKE :search)',
          { search: `%${pagination.search}%` }
        );
    }

    // Get total count
    const total = await idQb.getCount();

    // Get paginated IDs with sorting
    const ids = await idQb
      .orderBy('plan.created_at', pagination.sortOrder || 'DESC')
      .addOrderBy('plan.id', 'ASC')
      .offset(pagination.skip)
      .limit(pagination.limit)
      .getRawMany()
      .then((rows) => rows.map((r) => r.id));

    // Fetch full entities with relations
    const data = ids.length
      ? await this.planRepo.find({
        where: { id: In(ids) },
        relations: ['student', 'student.user', 'feeStructure', 'academicYear'],
      })
      : [];

    // Order data according to ID order
    const ordered = ids.map((id) => data.find((plan) => plan.id === id)).filter(Boolean) as StudentFeePlan[];

    return new PaginatedResult(ordered, total, pagination.page, pagination.limit);
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

  async findByRegistrationNumber(registrationNumber: string, academicYearId?: string): Promise<StudentFeePlan[]> {
    // First find the student by registration number
    const student = await this.studentRepo.findOne({
      where: { registrationNumber, isActive: true }
    });

    if (!student) {
      throw new NotFoundException(`Student with registration number ${registrationNumber} not found`);
    }

    // Then get their fee plans
    const where: any = { studentId: student.id, isActive: true };
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
    await this.planRepo.findOne({where: {id}});
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
      planId: string;  // Added this field
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
        planId: p.id,  // Added this line
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
