import { Entity, Column, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { CoreEntity } from '../../../common/entities/core.entity';
import { AcademicYear } from '../../academic-years/entities/academic-year.entity';
import { User } from '../../users/entities/user.entity';

@Entity('classes')
export class Class extends CoreEntity {
  @Column({ length: 100 })
  name: string; // e.g. "Grade 5 - A"

  @Column({ length: 20 })
  grade: string; // e.g. "5", "KG", "Nursery"

  @Column({ length: 10, nullable: true })
  section: string; // e.g. "A", "B"

  @Column({ nullable: true })
  description: string;

  @Column({ name: 'max_capacity', default: 40 })
  maxCapacity: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'academic_year_id' })
  academicYearId: string;

  @ManyToOne(() => AcademicYear, { nullable: false })
  @JoinColumn({ name: 'academic_year_id' })
  academicYear: AcademicYear;

  @Column({ name: 'class_teacher_id', nullable: true })
  classTeacherId: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'class_teacher_id' })
  classTeacher: User;
}
