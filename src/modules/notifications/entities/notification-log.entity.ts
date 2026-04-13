import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { CoreEntity } from '../../../common/entities/core.entity';
import { User } from '../../users/entities/user.entity';
import { NotificationType, NotificationEvent } from '../../../common/enums';

@Entity('notification_logs')
export class NotificationLog extends CoreEntity {
  @Column({ name: 'recipient_id', nullable: true })
  recipientId: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'recipient_id' })
  recipient: User;

  @Column({ name: 'recipient_email', nullable: true })
  recipientEmail: string;

  @Column({ name: 'recipient_phone', nullable: true })
  recipientPhone: string;

  @Column({ type: 'enum', enum: NotificationType })
  type: NotificationType;

  @Column({ type: 'enum', enum: NotificationEvent })
  event: NotificationEvent;

  @Column()
  subject: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ name: 'is_sent', default: false })
  isSent: boolean;

  @Column({ name: 'sent_at', nullable: true, type: 'timestamptz' })
  sentAt: Date;

  @Column({ name: 'error_message', nullable: true, type: 'text' })
  errorMessage: string;

  @Column({ name: 'retry_count', default: 0 })
  retryCount: number;

  @Column({ name: 'reference_id', nullable: true })
  referenceId: string; // invoice_id or payment_id for context

  @Column({ name: 'reference_type', nullable: true })
  referenceType: string;
}
