import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { CoreEntity } from '../../../common/entities/core.entity';
import { Student } from '../../students/entities/student.entity';
import { FeeStructure } from '../../fee-structures/entities/fee-structure.entity';
import { AcademicYear } from '../../academic-years/entities/academic-year.entity';
import { FeeFrequency } from '../../../common/enums';

/**
 * StudentFeePlan: assigns a specific fee structure to a student with
 * a billing frequency preference that overrides the fee structure default.
 *
 * Examples:
 *  - Student A → Tuition fee → monthly   (pays PKR 8500/month)
 *  - Student B → Tuition fee → quarterly (pays PKR 25500/quarter)
 *  - Student C → Tuition fee → annual    (pays PKR 102000/year)
 *
 * If a student has NO plan entries, invoice generation falls back to
 * all applicable fee structures for their class (original behaviour).
 */
@Entity('student_fee_plans')
@Index(['studentId', 'feeStructureId', 'academicYearId'], { unique: true })
export class StudentFeePlan extends CoreEntity {
  @Column({ name: 'student_id' })
  studentId: string;

  @ManyToOne(() => Student, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id' })
  student: Student;

  @Column({ name: 'fee_structure_id' })
  feeStructureId: string;

  @ManyToOne(() => FeeStructure, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fee_structure_id' })
  feeStructure: FeeStructure;

  @Column({ name: 'academic_year_id' })
  academicYearId: string;

  @ManyToOne(() => AcademicYear)
  @JoinColumn({ name: 'academic_year_id' })
  academicYear: AcademicYear;

  /**
   * Overrides the fee structure's default frequency for this student.
   * The amount is recalculated automatically:
   *   monthly base × 3  = quarterly
   *   monthly base × 6  = semi-annual
   *   monthly base × 12 = annual
   */
  @Column({
    name: 'billing_frequency',
    type: 'enum',
    enum: FeeFrequency,
  })
  billingFrequency: FeeFrequency;

  /**
   * Optional override amount. If NULL, the system auto-calculates from
   * the fee structure base amount × frequency multiplier.
   */
  @Column({
    name: 'custom_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  customAmount: number | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'notes', nullable: true })
  notes: string;

  @Column({ name: 'created_by', nullable: true })
  createdBy: string;
}
