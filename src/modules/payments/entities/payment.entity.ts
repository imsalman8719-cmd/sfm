import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { CoreEntity } from '../../../common/entities/core.entity';
import { FeeInvoice } from '../../fee-invoices/entities/fee-invoice.entity';
import { Student } from '../../students/entities/student.entity';
import { PaymentMethod, PaymentStatus } from '../../../common/enums';

@Entity('payments')
@Index(['receiptNumber'], { unique: true })
export class Payment extends CoreEntity {
  @Column({ name: 'receipt_number', unique: true, length: 40 })
  receiptNumber: string;

  @Column({ name: 'invoice_id' })
  invoiceId: string;

  @ManyToOne(() => FeeInvoice, { eager: false })
  @JoinColumn({ name: 'invoice_id' })
  invoice: FeeInvoice;

  @Column({ name: 'student_id' })
  studentId: string;

  @ManyToOne(() => Student, { eager: false })
  @JoinColumn({ name: 'student_id' })
  student: Student;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ type: 'enum', enum: PaymentMethod })
  method: PaymentMethod;

  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.COMPLETED })
  status: PaymentStatus;

  @Column({ name: 'payment_date', type: 'date' })
  paymentDate: Date;

  @Column({ name: 'transaction_id', nullable: true, length: 100 })
  transactionId: string;

  @Column({ name: 'bank_name', nullable: true, length: 100 })
  bankName: string;

  @Column({ name: 'cheque_number', nullable: true, length: 50 })
  chequeNumber: string;

  @Column({ name: 'cheque_date', type: 'date', nullable: true })
  chequeDate: Date;

  @Column({ nullable: true, type: 'text' })
  remarks: string;

  // Refund fields
  @Column({ name: 'is_refunded', default: false })
  isRefunded: boolean;

  @Column({ name: 'refunded_amount', type: 'decimal', precision: 12, scale: 2, nullable: true })
  refundedAmount: number;

  @Column({ name: 'refund_reason', nullable: true, type: 'text' })
  refundReason: string;

  @Column({ name: 'refunded_at', nullable: true, type: 'timestamptz' })
  refundedAt: Date;

  @Column({ name: 'refunded_by', nullable: true })
  refundedBy: string;

  @Column({ name: 'collected_by', nullable: true })
  collectedBy: string; // staff who recorded the payment

  @Column({ name: 'verified_by', nullable: true })
  verifiedBy: string;

  @Column({ name: 'verified_at', nullable: true, type: 'timestamptz' })
  verifiedAt: Date;
}
