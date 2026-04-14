import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGlobalSettings1700000000002 implements MigrationInterface {
  name = 'AddGlobalSettings1700000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "global_settings" (
        "id"                              VARCHAR(10) PRIMARY KEY DEFAULT 'global',
        "monthly_invoice_day"             INTEGER NOT NULL DEFAULT 1,
        "quarterly_invoice_days_before"   INTEGER NOT NULL DEFAULT 7,
        "semi_annual_invoice_days_before" INTEGER NOT NULL DEFAULT 14,
        "annual_invoice_days_before"      INTEGER NOT NULL DEFAULT 30,
        "default_due_days"                INTEGER NOT NULL DEFAULT 10,
        "auto_invoice_enabled"            BOOLEAN NOT NULL DEFAULT true,
        "auto_overdue_marking_enabled"    BOOLEAN NOT NULL DEFAULT true,
        "auto_reminder_enabled"           BOOLEAN NOT NULL DEFAULT true,
        "reminder_days_before_due"        INTEGER NOT NULL DEFAULT 3,
        "school_name"                     VARCHAR,
        "school_address"                  VARCHAR,
        "school_phone"                    VARCHAR,
        "currency_symbol"                 VARCHAR NOT NULL DEFAULT 'PKR',
        "updated_at"                      TIMESTAMPTZ,
        "updated_by"                      VARCHAR
      )
    `);

    // Insert default singleton row
    await queryRunner.query(`
      INSERT INTO "global_settings" ("id") VALUES ('global')
      ON CONFLICT ("id") DO NOTHING
    `);

    console.log('✅ global_settings table created with default row');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "global_settings"`);
  }
}
