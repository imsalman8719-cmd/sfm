import { Entity, Column, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { CoreEntity } from '../../../common/entities/core.entity';
import { AcademicYear } from '../../academic-years/entities/academic-year.entity';
import { Class } from '../../classes/entities/class.entity';
import {
  FeeCategory,
  FeeFrequency,
  DiscountType,
} from '../../../common/enums';

@Entity('fee_structures')
export class FeeStructure extends CoreEntity {
  @Column({ length: 150 })
  name: string;

  @Column({ nullable: true, type: 'text' })
  description: string;

  @Column({ type: 'enum', enum: FeeCategory })
  category: FeeCategory;

  @Column({ type: 'enum', enum: FeeFrequency })
  frequency: FeeFrequency;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ name: 'academic_year_id' })
  academicYearId: string;

  @ManyToOne(() => AcademicYear)
  @JoinColumn({ name: 'academic_year_id' })
  academicYear: AcademicYear;

  // Null = applies to ALL classes; set to specific class if class-specific
  @Column({ name: 'class_id', nullable: true })
  classId: string;

  @ManyToOne(() => Class, { nullable: true })
  @JoinColumn({ name: 'class_id' })
  class: Class;

  @Column({ name: 'is_mandatory', default: true })
  isMandatory: boolean;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  // Due date config
  @Column({ name: 'due_day_of_month', nullable: true })
  dueDayOfMonth: number; // e.g. 10 = due on 10th of each month

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate: Date; // for one-time fees

  // Late fee config (overrides global)
  @Column({ name: 'late_fee_enabled', default: true })
  lateFeeEnabled: boolean;

  @Column({
    name: 'late_fee_type',
    type: 'enum',
    enum: DiscountType,
    nullable: true,
  })
  lateFeeType: DiscountType;

  @Column({
    name: 'late_fee_value',
    type: 'decimal',
    precision: 8,
    scale: 2,
    nullable: true,
  })
  lateFeeValue: number;

  @Column({ name: 'grace_period_days', default: 7 })
  gracePeriodDays: number;

  // For installment-based fees, store schedule as JSON
  @Column({ name: 'installment_schedule', type: 'jsonb', nullable: true })
  installmentSchedule: Array<{
    installmentNo: number;
    amount: number;
    dueDate: string;
    label: string;
  }>;

  @Column({ name: 'applicable_months', type: 'int', array: true, nullable: true })
  applicableMonths: number[]; // [1,2,3...12] for monthly fees

  @Column({ name: 'sort_order', default: 0 })
  sortOrder: number;

  @Column({ name: 'created_by', nullable: true })
  createdBy: string;
}
