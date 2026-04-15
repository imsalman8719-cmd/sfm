import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStudentFeePreference1776162015832 implements MigrationInterface {
  name = 'AddStudentFeePreference1776162015832';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add billing_frequency enum column
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."students_billing_frequency_enum" AS ENUM
          ('one_time','monthly','quarterly','semi_annual','annual','custom');
      EXCEPTION WHEN duplicate_object THEN null; END $$
    `);

    await queryRunner.query(`
      ALTER TABLE "students"
        ADD COLUMN IF NOT EXISTS "billing_frequency"
          "students_billing_frequency_enum" NOT NULL DEFAULT 'monthly'
    `);

    // Add selected_fee_structure_ids as uuid array
    await queryRunner.query(`
      ALTER TABLE "students"
        ADD COLUMN IF NOT EXISTS "selected_fee_structure_ids"
          uuid[] NOT NULL DEFAULT '{}'
    `);

    console.log('✅ Added billing_frequency and selected_fee_structure_ids to students table');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "students" DROP COLUMN IF EXISTS "selected_fee_structure_ids"`);
    await queryRunner.query(`ALTER TABLE "students" DROP COLUMN IF EXISTS "billing_frequency"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."students_billing_frequency_enum"`);
  }
}
