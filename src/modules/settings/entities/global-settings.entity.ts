import { Entity, Column, PrimaryColumn } from 'typeorm';

/**
 * Singleton row (id = 'global'). Super admin edits via PATCH /api/v1/settings.
 * Created automatically on first boot via SettingsService.onModuleInit().
 */
@Entity('global_settings')
export class GlobalSettings {
  @PrimaryColumn({ default: 'global', length: 10 })
  id: string;

  // ── Auto-invoice schedule ──────────────────────────────────────────────────
  /** Day of month (1-28) to auto-generate monthly invoices */
  @Column({ name: 'monthly_invoice_day', default: 1 })
  monthlyInvoiceDay: number;

  /** Days before quarter end to trigger quarterly invoice generation */
  @Column({ name: 'quarterly_invoice_days_before', default: 7 })
  quarterlyInvoiceDaysBefore: number;

  /** Days before semi-annual period end to trigger invoice generation */
  @Column({ name: 'semi_annual_invoice_days_before', default: 14 })
  semiAnnualInvoiceDaysBefore: number;

  /** Days before year end to trigger annual invoice generation */
  @Column({ name: 'annual_invoice_days_before', default: 30 })
  annualInvoiceDaysBefore: number;

  /** Default number of days from issue date to due date */
  @Column({ name: 'default_due_days', default: 10 })
  defaultDueDays: number;

  /** Enable/disable automatic invoice generation */
  @Column({ name: 'auto_invoice_enabled', default: true })
  autoInvoiceEnabled: boolean;

  /** Enable/disable automatic overdue marking */
  @Column({ name: 'auto_overdue_marking_enabled', default: true })
  autoOverdueMarkingEnabled: boolean;

  /** Enable/disable payment reminders */
  @Column({ name: 'auto_reminder_enabled', default: true })
  autoReminderEnabled: boolean;

  /** Days before due date to send reminder */
  @Column({ name: 'reminder_days_before_due', default: 3 })
  reminderDaysBeforeDue: number;

  // ── School Info ────────────────────────────────────────────────────────────
  @Column({ name: 'school_name', nullable: true })
  schoolName: string;

  @Column({ name: 'school_address', nullable: true })
  schoolAddress: string;

  @Column({ name: 'school_phone', nullable: true })
  schoolPhone: string;

  @Column({ name: 'currency_symbol', default: 'PKR' })
  currencySymbol: string;

  @Column({ name: 'updated_at', type: 'timestamptz', nullable: true })
  updatedAt: Date;

  @Column({ name: 'updated_by', nullable: true })
  updatedBy: string;
}
