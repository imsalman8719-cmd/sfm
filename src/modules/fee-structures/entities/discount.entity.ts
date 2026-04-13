import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { CoreEntity } from '../../../common/entities/core.entity';
import { Student } from '../../students/entities/student.entity';
import { FeeStructure } from './fee-structure.entity';
import { AcademicYear } from '../../academic-years/entities/academic-year.entity';
import { DiscountType, DiscountCategory } from '../../../common/enums';

@Entity('discounts')
export class Discount extends CoreEntity {
  @Column({ length: 150 })
  name: string;

  @Column({ nullable: true, type: 'text' })
  description: string;

  @Column({ type: 'enum', enum: DiscountCategory })
  category: DiscountCategory;

  @Column({ type: 'enum', enum: DiscountType })
  type: DiscountType;

  @Column({ type: 'decimal', precision: 8, scale: 2 })
  value: number; // % if percentage, fixed amount if fixed

  // Student-specific discount
  @Column({ name: 'student_id', nullable: true })
  studentId: string;

  @ManyToOne(() => Student, { nullable: true })
  @JoinColumn({ name: 'student_id' })
  student: Student;

  // Optionally tied to a specific fee structure
  @Column({ name: 'fee_structure_id', nullable: true })
  feeStructureId: string;

  @ManyToOne(() => FeeStructure, { nullable: true })
  @JoinColumn({ name: 'fee_structure_id' })
  feeStructure: FeeStructure;

  @Column({ name: 'academic_year_id' })
  academicYearId: string;

  @ManyToOne(() => AcademicYear)
  @JoinColumn({ name: 'academic_year_id' })
  academicYear: AcademicYear;

  @Column({ name: 'valid_from', type: 'date', nullable: true })
  validFrom: Date;

  @Column({ name: 'valid_until', type: 'date', nullable: true })
  validUntil: Date;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'approved_by', nullable: true })
  approvedBy: string;

  @Column({ name: 'created_by', nullable: true })
  createdBy: string;
}
