import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStudentFeePlans1700000000001 implements MigrationInterface {
  name = 'AddStudentFeePlans1700000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "student_fee_plans" (
        "id"               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "student_id"       UUID NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
        "fee_structure_id" UUID NOT NULL REFERENCES "fee_structures"("id") ON DELETE CASCADE,
        "academic_year_id" UUID NOT NULL REFERENCES "academic_years"("id"),
        "billing_frequency" "fee_frequency_enum" NOT NULL,
        "custom_amount"    DECIMAL(12,2),
        "is_active"        BOOLEAN NOT NULL DEFAULT true,
        "notes"            VARCHAR,
        "created_by"       VARCHAR,
        "created_at"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "deleted_at"       TIMESTAMPTZ,
        CONSTRAINT "UQ_student_fee_plan"
          UNIQUE ("student_id", "fee_structure_id", "academic_year_id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_student_fee_plans_student
        ON student_fee_plans(student_id)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_student_fee_plans_academic_year
        ON student_fee_plans(academic_year_id)
    `);

    console.log('✅ student_fee_plans table created');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "student_fee_plans"`);
  }
}
