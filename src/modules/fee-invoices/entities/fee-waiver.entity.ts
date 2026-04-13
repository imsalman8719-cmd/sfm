import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { CoreEntity } from '../../../common/entities/core.entity';
import { FeeInvoice } from './fee-invoice.entity';
import { Student } from '../../students/entities/student.entity';
import { WaiverStatus, DiscountType } from '../../../common/enums';

@Entity('fee_waivers')
export class FeeWaiver extends CoreEntity {
  @Column({ name: 'invoice_id' })
  invoiceId: string;

  @ManyToOne(() => FeeInvoice)
  @JoinColumn({ name: 'invoice_id' })
  invoice: FeeInvoice;

  @Column({ name: 'student_id' })
  studentId: string;

  @ManyToOne(() => Student)
  @JoinColumn({ name: 'student_id' })
  student: Student;

  @Column({ type: 'enum', enum: DiscountType })
  type: DiscountType;

  @Column({ type: 'decimal', precision: 8, scale: 2 })
  value: number;

  @Column({ name: 'waived_amount', type: 'decimal', precision: 12, scale: 2 })
  waivedAmount: number;

  @Column({ type: 'text' })
  reason: string;

  @Column({ type: 'enum', enum: WaiverStatus, default: WaiverStatus.PENDING })
  status: WaiverStatus;

  @Column({ name: 'requested_by', nullable: true })
  requestedBy: string;

  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy: string;

  @Column({ name: 'reviewed_at', nullable: true, type: 'timestamptz' })
  reviewedAt: Date;

  @Column({ name: 'review_remarks', nullable: true, type: 'text' })
  reviewRemarks: string;
}
