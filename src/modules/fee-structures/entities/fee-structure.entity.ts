import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { CoreEntity } from '../../../common/entities/core.entity';
import { AcademicYear } from '../../academic-years/entities/academic-year.entity';
import { Class } from '../../classes/entities/class.entity';

/**
 * FeeStructure: defines a single fee that can be charged to students.
 *
 * Simplified model — billing frequency, grace period, due dates and late fee
 * configuration are all handled globally in GlobalSettings, not per-fee-structure.
 *
 * Key concepts:
 *   • isMandatory = true  → included in EVERY student's invoice automatically
 *   • isMandatory = false → only included if the student selected it at enrollment
 *   • isOneTime    = true → charged ONCE at enrollment (e.g. Admission Fee)
 *                          and shown in the first combined invoice
 *   • isOneTime    = false → recurring fee, billed each period per the student's
 *                            chosen billing frequency (monthly / quarterly / etc.)
 */
@Entity('fee_structures')
export class FeeStructure extends CoreEntity {
  @Column({ length: 150 })
  name: string;

  @Column({ nullable: true, type: 'text' })
  description: string;

  /** Monthly base amount in PKR. For recurring fees this is the per-month rate. */
  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ name: 'academic_year_id' })
  academicYearId: string;

  @ManyToOne(() => AcademicYear)
  @JoinColumn({ name: 'academic_year_id' })
  academicYear: AcademicYear;

  /** NULL = applies to all classes. Set to a specific class for class-specific fees. */
  @Column({ name: 'class_id', nullable: true })
  classId: string;

  @ManyToOne(() => Class, { nullable: true })
  @JoinColumn({ name: 'class_id' })
  class: Class;

  /**
   * true  → always included in every student invoice (tuition, exam fee, etc.)
   * false → only included when the student explicitly selects it at enrollment
   *         (library, transport, lab, sports, etc.)
   */
  @Column({ name: 'is_mandatory', default: true })
  isMandatory: boolean;

  /**
   * true  → one-time fee, charged at enrollment only (admission fee, registration fee)
   * false → recurring fee, billed every billing period
   */
  @Column({ name: 'is_one_time', default: false })
  isOneTime: boolean;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'created_by', nullable: true })
  createdBy: string;
}
