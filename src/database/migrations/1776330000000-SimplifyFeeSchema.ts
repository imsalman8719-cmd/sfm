import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Simplifies fee_structures and global_settings tables:
 *
 * fee_structures:
 *   - Removes: category, frequency, due_day_of_month, due_date, grace_period_days,
 *              sort_order, late_fee_enabled, late_fee_type, late_fee_value,
 *              installment_schedule, applicable_months
 *   - Adds:    is_one_time (boolean, default false)
 *
 * global_settings:
 *   - Removes: monthly_invoice_day, quarterly_invoice_days_before,
 *              semi_annual_invoice_days_before, annual_invoice_days_before,
 *              auto_invoice_enabled, auto_reminder_enabled
 *   - Adds:    grace_period_days, late_fee_enabled, late_fee_type, late_fee_value
 *   - Keeps:   default_due_days, auto_overdue_marking_enabled,
 *              reminder_days_before_due, school info
 */
export class SimplifyFeeSchema1776330000000 implements MigrationInterface {
  name = 'SimplifyFeeSchema1776330000000';

  public async up(queryRunner: QueryRunner): Promise<void> {

    // ── fee_structures ───────────────────────────────────────────────────────

    // Add is_one_time column
    await queryRunner.query(`
      ALTER TABLE fee_structures
        ADD COLUMN IF NOT EXISTS is_one_time BOOLEAN NOT NULL DEFAULT false
    `);

    // Migrate existing data: any fee with category='admission' or frequency='one_time' → is_one_time=true
    await queryRunner.query(`
      UPDATE fee_structures
        SET is_one_time = true
        WHERE category = 'admission'
           OR frequency = 'one_time'
    `);

    // Drop removed columns
    await queryRunner.query(`
      ALTER TABLE fee_structures
        DROP COLUMN IF EXISTS category,
        DROP COLUMN IF EXISTS frequency,
        DROP COLUMN IF EXISTS due_day_of_month,
        DROP COLUMN IF EXISTS due_date,
        DROP COLUMN IF EXISTS grace_period_days,
        DROP COLUMN IF EXISTS sort_order,
        DROP COLUMN IF EXISTS late_fee_enabled,
        DROP COLUMN IF EXISTS late_fee_type,
        DROP COLUMN IF EXISTS late_fee_value,
        DROP COLUMN IF EXISTS installment_schedule,
        DROP COLUMN IF EXISTS applicable_months
    `);

    // Drop now-unused enums
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."fee_structures_category_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."fee_structures_frequency_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."fee_structures_late_fee_type_enum"`);

    console.log('✅ fee_structures simplified');

    // ── global_settings ──────────────────────────────────────────────────────

    // Add new columns
    await queryRunner.query(`
      ALTER TABLE global_settings
        ADD COLUMN IF NOT EXISTS grace_period_days      INTEGER NOT NULL DEFAULT 7,
        ADD COLUMN IF NOT EXISTS late_fee_enabled       BOOLEAN NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS late_fee_type          VARCHAR NOT NULL DEFAULT 'percentage',
        ADD COLUMN IF NOT EXISTS late_fee_value         DECIMAL(8,2) NOT NULL DEFAULT 2
    `);

    // Drop old automation columns
    await queryRunner.query(`
      ALTER TABLE global_settings
        DROP COLUMN IF EXISTS monthly_invoice_day,
        DROP COLUMN IF EXISTS quarterly_invoice_days_before,
        DROP COLUMN IF EXISTS semi_annual_invoice_days_before,
        DROP COLUMN IF EXISTS annual_invoice_days_before,
        DROP COLUMN IF EXISTS auto_invoice_enabled,
        DROP COLUMN IF EXISTS auto_reminder_enabled
    `);

    console.log('✅ global_settings simplified');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore fee_structures columns (data loss for removed columns)
    await queryRunner.query(`
      ALTER TABLE fee_structures
        DROP COLUMN IF EXISTS is_one_time,
        ADD COLUMN IF NOT EXISTS category VARCHAR DEFAULT 'tuition',
        ADD COLUMN IF NOT EXISTS frequency VARCHAR DEFAULT 'monthly',
        ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS grace_period_days INTEGER DEFAULT 7
    `);

    // Restore global_settings columns
    await queryRunner.query(`
      ALTER TABLE global_settings
        DROP COLUMN IF EXISTS grace_period_days,
        DROP COLUMN IF EXISTS late_fee_enabled,
        DROP COLUMN IF EXISTS late_fee_type,
        DROP COLUMN IF EXISTS late_fee_value,
        ADD COLUMN IF NOT EXISTS monthly_invoice_day INTEGER DEFAULT 1,
        ADD COLUMN IF NOT EXISTS auto_invoice_enabled BOOLEAN DEFAULT true
    `);
  }
}
