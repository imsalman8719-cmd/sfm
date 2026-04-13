import { Entity, Column, ManyToOne, OneToMany, JoinColumn, Index } from 'typeorm';
import { CoreEntity } from '../../../common/entities/core.entity';
import { Student } from '../../students/entities/student.entity';
import { AcademicYear } from '../../academic-years/entities/academic-year.entity';
import { InvoiceStatus } from '../../../common/enums';

@Entity('fee_invoices')
@Index(['invoiceNumber'], { unique: true })
export class FeeInvoice extends CoreEntity {
  @Column({ name: 'invoice_number', unique: true, length: 40 })
  invoiceNumber: string;

  @Column({ name: 'student_id' })
  studentId: string;

  @ManyToOne(() => Student, { eager: false })
  @JoinColumn({ name: 'student_id' })
  student: Student;

  @Column({ name: 'academic_year_id' })
  academicYearId: string;

  @ManyToOne(() => AcademicYear)
  @JoinColumn({ name: 'academic_year_id' })
  academicYear: AcademicYear;

  @Column({ name: 'billing_month', nullable: true })
  billingMonth: number; // 1-12

  @Column({ name: 'billing_year', nullable: true })
  billingYear: number;

  @Column({ name: 'billing_quarter', nullable: true })
  billingQuarter: number; // 1-4

  @Column({ name: 'billing_label', nullable: true })
  billingLabel: string; // e.g. "January 2025 Fee", "Q1 2025 Fee"

  @Column({ name: 'issue_date', type: 'date' })
  issueDate: Date;

  @Column({ name: 'due_date', type: 'date' })
  dueDate: Date;

  @Column({ type: 'enum', enum: InvoiceStatus, default: InvoiceStatus.ISSUED })
  status: InvoiceStatus;

  // Amounts
  @Column({ name: 'subtotal', type: 'decimal', precision: 12, scale: 2, default: 0 })
  subtotal: number;

  @Column({ name: 'discount_amount', type: 'decimal', precision: 12, scale: 2, default: 0 })
  discountAmount: number;

  @Column({ name: 'late_fee_amount', type: 'decimal', precision: 12, scale: 2, default: 0 })
  lateFeeAmount: number;

  @Column({ name: 'total_amount', type: 'decimal', precision: 12, scale: 2 })
  totalAmount: number;

  @Column({ name: 'paid_amount', type: 'decimal', precision: 12, scale: 2, default: 0 })
  paidAmount: number;

  @Column({ name: 'balance_amount', type: 'decimal', precision: 12, scale: 2, default: 0 })
  balanceAmount: number;

  @Column({ name: 'waived_amount', type: 'decimal', precision: 12, scale: 2, default: 0 })
  waivedAmount: number;

  // Line items stored as JSONB
  @Column({ name: 'line_items', type: 'jsonb' })
  lineItems: Array<{
    feeStructureId: string;
    feeName: string;
    category: string;
    amount: number;
    discountAmount: number;
    netAmount: number;
  }>;

  @Column({ name: 'notes', nullable: true, type: 'text' })
  notes: string;

  @Column({ name: 'reminder_count', default: 0 })
  reminderCount: number;

  @Column({ name: 'last_reminder_at', nullable: true, type: 'timestamptz' })
  lastReminderAt: Date;

  @Column({ name: 'created_by', nullable: true })
  createdBy: string;

  @Column({ name: 'cancelled_by', nullable: true })
  cancelledBy: string;

  @Column({ name: 'cancelled_at', nullable: true, type: 'timestamptz' })
  cancelledAt: Date;

  @Column({ name: 'cancellation_reason', nullable: true })
  cancellationReason: string;
}
