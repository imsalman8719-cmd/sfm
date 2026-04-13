import {
  Entity,
  Column,
  OneToOne,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { CoreEntity } from '../../../common/entities/core.entity';
import { User } from '../../users/entities/user.entity';
import { Class } from '../../classes/entities/class.entity';
import { AcademicYear } from '../../academic-years/entities/academic-year.entity';
import { AdmissionStatus } from '../../../common/enums';

@Entity('students')
@Index(['rollNumber', 'academicYearId'], { unique: true })
export class Student extends CoreEntity {
  @Column({ name: 'user_id', unique: true })
  userId: string;

  @OneToOne(() => User, { eager: true })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'registration_number', unique: true, length: 30 })
  registrationNumber: string;

  @Column({ name: 'roll_number', nullable: true, length: 20 })
  rollNumber: string;

  @Column({ name: 'class_id', nullable: true })
  classId: string;

  @ManyToOne(() => Class, { nullable: true })
  @JoinColumn({ name: 'class_id' })
  class: Class;

  @Column({ name: 'academic_year_id' })
  academicYearId: string;

  @ManyToOne(() => AcademicYear)
  @JoinColumn({ name: 'academic_year_id' })
  academicYear: AcademicYear;

  @Column({ name: 'admission_date', type: 'date', nullable: true })
  admissionDate: Date;

  @Column({
    name: 'admission_status',
    type: 'enum',
    enum: AdmissionStatus,
    default: AdmissionStatus.ADMITTED,
  })
  admissionStatus: AdmissionStatus;

  // Parent / Guardian info
  @Column({ name: 'father_name', nullable: true })
  fatherName: string;

  @Column({ name: 'father_phone', nullable: true })
  fatherPhone: string;

  @Column({ name: 'father_email', nullable: true })
  fatherEmail: string;

  @Column({ name: 'mother_name', nullable: true })
  motherName: string;

  @Column({ name: 'mother_phone', nullable: true })
  motherPhone: string;

  @Column({ name: 'guardian_name', nullable: true })
  guardianName: string;

  @Column({ name: 'guardian_phone', nullable: true })
  guardianPhone: string;

  @Column({ name: 'guardian_relation', nullable: true })
  guardianRelation: string;

  @Column({ name: 'emergency_contact', nullable: true })
  emergencyContact: string;

  // Academic info
  @Column({ name: 'previous_school', nullable: true })
  previousSchool: string;

  @Column({ name: 'previous_grade', nullable: true })
  previousGrade: string;

  @Column({ name: 'blood_group', nullable: true, length: 10 })
  bloodGroup: string;

  @Column({ name: 'nationality', nullable: true, length: 60 })
  nationality: string;

  @Column({ name: 'religion', nullable: true, length: 60 })
  religion: string;

  @Column({ name: 'has_siblings', default: false })
  hasSiblings: boolean;

  @Column({ name: 'sibling_discount_eligible', default: false })
  siblingDiscountEligible: boolean;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'transport_required', default: false })
  transportRequired: boolean;

  @Column({ name: 'hostel_required', default: false })
  hostelRequired: boolean;

  @Column({ name: 'notes', nullable: true, type: 'text' })
  notes: string;
}
