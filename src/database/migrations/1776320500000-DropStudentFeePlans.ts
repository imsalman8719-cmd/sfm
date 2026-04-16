import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Drops the student_fee_plans table.
 *
 * Billing frequency and optional fee structure selection are now stored
 * directly on the students table (billing_frequency, selected_fee_structure_ids).
 * Invoices are auto-generated at enrollment time — no separate fee-plan rows needed.
 */
export class DropStudentFeePlans1776320500000 implements MigrationInterface {
  name = 'DropStudentFeePlans1776320500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign key constraints first
    await queryRunner.query(`
      ALTER TABLE "student_fee_plans"
        DROP CONSTRAINT IF EXISTS "FK_158f1aeccbed547b49809e227cd",
        DROP CONSTRAINT IF EXISTS "FK_effbe418dc0b6196aac5fa447f8",
        DROP CONSTRAINT IF EXISTS "FK_f983c24e42eb81916590fdec0a1"
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS "student_fee_plans"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."student_fee_plans_billing_frequency_enum"`);

    console.log('✅ student_fee_plans table dropped — billing preference now stored on students table');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Re-create the table if needed for rollback
    await queryRunner.query(`
      CREATE TYPE "public"."student_fee_plans_billing_frequency_enum"
        AS ENUM('one_time','monthly','quarterly','semi_annual','annual','custom')
    `);
    await queryRunner.query(`
      CREATE TABLE "student_fee_plans" (
        "id"                uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at"        TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"        TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at"        TIMESTAMP,
        "student_id"        uuid NOT NULL,
        "fee_structure_id"  uuid NOT NULL,
        "academic_year_id"  uuid NOT NULL,
        "billing_frequency" "public"."student_fee_plans_billing_frequency_enum" NOT NULL,
        "custom_amount"     numeric(12,2),
        "is_active"         boolean NOT NULL DEFAULT true,
        "notes"             character varying,
        "created_by"        character varying,
        CONSTRAINT "PK_student_fee_plans" PRIMARY KEY ("id")
      )
    `);
  }
}
