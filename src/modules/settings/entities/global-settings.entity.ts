import { Entity, Column, PrimaryColumn } from 'typeorm';

/**
 * Singleton settings row (id = 'global').
 * Super admin edits via PATCH /api/v1/settings.
 * Created automatically on first boot.
 *
 * Contains:
 *   1. Due date & grace period  — how long students have to pay before late fees kick in
 *   2. Late fee configuration   — how much to charge after the grace period
 *   3. Payment reminder         — how many days before due date to send a reminder
 *   4. School information       — shown on invoice headers and receipts
 */
@Entity('global_settings')
export class GlobalSettings {
  @PrimaryColumn({ default: 'global', length: 10 })
  id: string;

  // ── Due Date & Grace Period ────────────────────────────────────────────────

  /**
   * Number of days from invoice issue date to due date.
   * e.g. 10 = invoice raised on 1st, due on 10th.
   */
  @Column({ name: 'default_due_days', default: 10 })
  defaultDueDays: number;

  /**
   * Grace period in days after the due date before a late fee is applied.
   * e.g. 7 = no late fee until 7 days after due date.
   * Set to 0 to apply late fee immediately after due date.
   */
  @Column({ name: 'grace_period_days', default: 7 })
  gracePeriodDays: number;

  // ── Late Fee ───────────────────────────────────────────────────────────────

  /** Whether to apply late fees on overdue invoices */
  @Column({ name: 'late_fee_enabled', default: true })
  lateFeeEnabled: boolean;

  /**
   * 'percentage' = late fee is a % of the outstanding balance
   * 'fixed'      = flat PKR amount added once
   */
  @Column({ name: 'late_fee_type', default: 'percentage' })
  lateFeeType: 'percentage' | 'fixed';

  /**
   * The late fee amount.
   * If lateFeeType = 'percentage': this is the % (e.g. 2 = 2%)
   * If lateFeeType = 'fixed':      this is PKR (e.g. 500 = PKR 500)
   */
  @Column({ name: 'late_fee_value', type: 'decimal', precision: 8, scale: 2, default: 2 })
  lateFeeValue: number;

  // ── Reminders ─────────────────────────────────────────────────────────────

  /** Send payment reminder this many days before due date (0 = disable) */
  @Column({ name: 'reminder_days_before_due', default: 3 })
  reminderDaysBeforeDue: number;

  // ── Overdue marking ───────────────────────────────────────────────────────

  /** Enable/disable automatic overdue status marking by the nightly cron */
  @Column({ name: 'auto_overdue_marking_enabled', default: true })
  autoOverdueMarkingEnabled: boolean;

  // ── School Information ─────────────────────────────────────────────────────

  @Column({ name: 'school_name', nullable: true })
  schoolName: string;

  @Column({ name: 'school_address', nullable: true })
  schoolAddress: string;

  @Column({ name: 'school_phone', nullable: true })
  schoolPhone: string;

  @Column({ name: 'currency_symbol', default: 'PKR' })
  currencySymbol: string;

  // ── Audit ─────────────────────────────────────────────────────────────────

  @Column({ name: 'updated_at', type: 'timestamptz', nullable: true })
  updatedAt: Date;

  @Column({ name: 'updated_by', nullable: true })
  updatedBy: string;
}
