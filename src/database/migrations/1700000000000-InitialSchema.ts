import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1700000000000 implements MigrationInterface {
  name = 'InitialSchema1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enable uuid-ossp extension
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // Enums
    await queryRunner.query(`CREATE TYPE "user_role_enum" AS ENUM('super_admin','finance','admission','teacher','student','parent')`);
    await queryRunner.query(`CREATE TYPE "user_status_enum" AS ENUM('active','inactive','suspended','pending')`);
    await queryRunner.query(`CREATE TYPE "gender_enum" AS ENUM('male','female','other')`);
    await queryRunner.query(`CREATE TYPE "fee_category_enum" AS ENUM('tuition','admission','exam','library','laboratory','transport','hostel','sports','uniform','miscellaneous','late_fee','discount')`);
    await queryRunner.query(`CREATE TYPE "fee_frequency_enum" AS ENUM('one_time','monthly','quarterly','semi_annual','annual','custom')`);
    await queryRunner.query(`CREATE TYPE "invoice_status_enum" AS ENUM('draft','issued','partially_paid','paid','overdue','waived','cancelled')`);
    await queryRunner.query(`CREATE TYPE "payment_status_enum" AS ENUM('pending','completed','failed','refunded','cancelled')`);
    await queryRunner.query(`CREATE TYPE "payment_method_enum" AS ENUM('cash','bank_transfer','cheque','online','pos')`);
    await queryRunner.query(`CREATE TYPE "discount_type_enum" AS ENUM('percentage','fixed')`);
    await queryRunner.query(`CREATE TYPE "discount_category_enum" AS ENUM('merit','need_based','sibling','staff_ward','special')`);
    await queryRunner.query(`CREATE TYPE "admission_status_enum" AS ENUM('applied','under_review','admitted','rejected','withdrawn')`);
    await queryRunner.query(`CREATE TYPE "notification_type_enum" AS ENUM('email','sms','system')`);
    await queryRunner.query(`CREATE TYPE "notification_event_enum" AS ENUM('invoice_generated','payment_received','payment_overdue','reminder_sent','discount_applied','waiver_applied','account_created','password_reset')`);
    await queryRunner.query(`CREATE TYPE "waiver_status_enum" AS ENUM('pending','approved','rejected')`);

    // Users
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "first_name" VARCHAR(100) NOT NULL,
        "last_name" VARCHAR(100) NOT NULL,
        "email" VARCHAR(150) NOT NULL UNIQUE,
        "phone" VARCHAR(20),
        "password_hash" VARCHAR NOT NULL,
        "role" "user_role_enum" NOT NULL,
        "status" "user_status_enum" NOT NULL DEFAULT 'active',
        "gender" "gender_enum",
        "date_of_birth" DATE,
        "address" VARCHAR,
        "avatar_url" VARCHAR,
        "employee_id" VARCHAR UNIQUE,
        "department" VARCHAR,
        "last_login" TIMESTAMPTZ,
        "refresh_token" VARCHAR,
        "password_reset_token" VARCHAR,
        "password_reset_expires" TIMESTAMPTZ,
        "email_verified" BOOLEAN NOT NULL DEFAULT false,
        "is_first_login" BOOLEAN NOT NULL DEFAULT true,
        "created_by" VARCHAR,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "deleted_at" TIMESTAMPTZ
      )
    `);

    // Academic Years
    await queryRunner.query(`
      CREATE TABLE "academic_years" (
        "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "name" VARCHAR(20) NOT NULL UNIQUE,
        "start_date" DATE NOT NULL,
        "end_date" DATE NOT NULL,
        "is_current" BOOLEAN NOT NULL DEFAULT false,
        "description" VARCHAR,
        "fee_target" DECIMAL(15,2) NOT NULL DEFAULT 0,
        "monthly_targets" JSONB,
        "quarterly_targets" JSONB,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "deleted_at" TIMESTAMPTZ
      )
    `);

    // Classes
    await queryRunner.query(`
      CREATE TABLE "classes" (
        "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "name" VARCHAR(100) NOT NULL,
        "grade" VARCHAR(20) NOT NULL,
        "section" VARCHAR(10),
        "description" VARCHAR,
        "max_capacity" INT NOT NULL DEFAULT 40,
        "is_active" BOOLEAN NOT NULL DEFAULT true,
        "academic_year_id" UUID NOT NULL REFERENCES "academic_years"("id"),
        "class_teacher_id" UUID REFERENCES "users"("id"),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "deleted_at" TIMESTAMPTZ
      )
    `);

    // Students
    await queryRunner.query(`
      CREATE TABLE "students" (
        "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "user_id" UUID NOT NULL UNIQUE REFERENCES "users"("id"),
        "registration_number" VARCHAR(30) NOT NULL UNIQUE,
        "roll_number" VARCHAR(20),
        "class_id" UUID REFERENCES "classes"("id"),
        "academic_year_id" UUID NOT NULL REFERENCES "academic_years"("id"),
        "admission_date" DATE,
        "admission_status" "admission_status_enum" NOT NULL DEFAULT 'admitted',
        "father_name" VARCHAR,
        "father_phone" VARCHAR,
        "father_email" VARCHAR,
        "mother_name" VARCHAR,
        "mother_phone" VARCHAR,
        "guardian_name" VARCHAR,
        "guardian_phone" VARCHAR,
        "guardian_relation" VARCHAR,
        "emergency_contact" VARCHAR,
        "previous_school" VARCHAR,
        "previous_grade" VARCHAR,
        "blood_group" VARCHAR(10),
        "nationality" VARCHAR(60),
        "religion" VARCHAR(60),
        "has_siblings" BOOLEAN NOT NULL DEFAULT false,
        "sibling_discount_eligible" BOOLEAN NOT NULL DEFAULT false,
        "is_active" BOOLEAN NOT NULL DEFAULT true,
        "transport_required" BOOLEAN NOT NULL DEFAULT false,
        "hostel_required" BOOLEAN NOT NULL DEFAULT false,
        "notes" TEXT,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "deleted_at" TIMESTAMPTZ,
        UNIQUE("roll_number", "academic_year_id")
      )
    `);

    // Fee Structures
    await queryRunner.query(`
      CREATE TABLE "fee_structures" (
        "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "name" VARCHAR(150) NOT NULL,
        "description" TEXT,
        "category" "fee_category_enum" NOT NULL,
        "frequency" "fee_frequency_enum" NOT NULL,
        "amount" DECIMAL(12,2) NOT NULL,
        "academic_year_id" UUID NOT NULL REFERENCES "academic_years"("id"),
        "class_id" UUID REFERENCES "classes"("id"),
        "is_mandatory" BOOLEAN NOT NULL DEFAULT true,
        "is_active" BOOLEAN NOT NULL DEFAULT true,
        "due_day_of_month" INT,
        "due_date" DATE,
        "late_fee_enabled" BOOLEAN NOT NULL DEFAULT true,
        "late_fee_type" "discount_type_enum",
        "late_fee_value" DECIMAL(8,2),
        "grace_period_days" INT NOT NULL DEFAULT 7,
        "installment_schedule" JSONB,
        "applicable_months" INT[],
        "sort_order" INT NOT NULL DEFAULT 0,
        "created_by" VARCHAR,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "deleted_at" TIMESTAMPTZ
      )
    `);

    // Discounts
    await queryRunner.query(`
      CREATE TABLE "discounts" (
        "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "name" VARCHAR(150) NOT NULL,
        "description" TEXT,
        "category" "discount_category_enum" NOT NULL,
        "type" "discount_type_enum" NOT NULL,
        "value" DECIMAL(8,2) NOT NULL,
        "student_id" UUID REFERENCES "students"("id"),
        "fee_structure_id" UUID REFERENCES "fee_structures"("id"),
        "academic_year_id" UUID NOT NULL REFERENCES "academic_years"("id"),
        "valid_from" DATE,
        "valid_until" DATE,
        "is_active" BOOLEAN NOT NULL DEFAULT true,
        "approved_by" VARCHAR,
        "created_by" VARCHAR,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "deleted_at" TIMESTAMPTZ
      )
    `);

    // Fee Invoices
    await queryRunner.query(`
      CREATE TABLE "fee_invoices" (
        "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "invoice_number" VARCHAR(40) NOT NULL UNIQUE,
        "student_id" UUID NOT NULL REFERENCES "students"("id"),
        "academic_year_id" UUID NOT NULL REFERENCES "academic_years"("id"),
        "billing_month" INT,
        "billing_year" INT,
        "billing_quarter" INT,
        "billing_label" VARCHAR,
        "issue_date" DATE NOT NULL,
        "due_date" DATE NOT NULL,
        "status" "invoice_status_enum" NOT NULL DEFAULT 'issued',
        "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
        "discount_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
        "late_fee_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
        "total_amount" DECIMAL(12,2) NOT NULL,
        "paid_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
        "balance_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
        "waived_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
        "line_items" JSONB NOT NULL,
        "notes" TEXT,
        "reminder_count" INT NOT NULL DEFAULT 0,
        "last_reminder_at" TIMESTAMPTZ,
        "created_by" VARCHAR,
        "cancelled_by" VARCHAR,
        "cancelled_at" TIMESTAMPTZ,
        "cancellation_reason" VARCHAR,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "deleted_at" TIMESTAMPTZ
      )
    `);

    // Fee Waivers
    await queryRunner.query(`
      CREATE TABLE "fee_waivers" (
        "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "invoice_id" UUID NOT NULL REFERENCES "fee_invoices"("id"),
        "student_id" UUID NOT NULL REFERENCES "students"("id"),
        "type" "discount_type_enum" NOT NULL,
        "value" DECIMAL(8,2) NOT NULL,
        "waived_amount" DECIMAL(12,2) NOT NULL,
        "reason" TEXT NOT NULL,
        "status" "waiver_status_enum" NOT NULL DEFAULT 'pending',
        "requested_by" VARCHAR,
        "reviewed_by" UUID REFERENCES "users"("id"),
        "reviewed_at" TIMESTAMPTZ,
        "review_remarks" TEXT,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "deleted_at" TIMESTAMPTZ
      )
    `);

    // Payments
    await queryRunner.query(`
      CREATE TABLE "payments" (
        "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "receipt_number" VARCHAR(40) NOT NULL UNIQUE,
        "invoice_id" UUID NOT NULL REFERENCES "fee_invoices"("id"),
        "student_id" UUID NOT NULL REFERENCES "students"("id"),
        "amount" DECIMAL(12,2) NOT NULL,
        "method" "payment_method_enum" NOT NULL,
        "status" "payment_status_enum" NOT NULL DEFAULT 'completed',
        "payment_date" DATE NOT NULL,
        "transaction_id" VARCHAR(100),
        "bank_name" VARCHAR(100),
        "cheque_number" VARCHAR(50),
        "cheque_date" DATE,
        "remarks" TEXT,
        "is_refunded" BOOLEAN NOT NULL DEFAULT false,
        "refunded_amount" DECIMAL(12,2),
        "refund_reason" TEXT,
        "refunded_at" TIMESTAMPTZ,
        "refunded_by" VARCHAR,
        "collected_by" VARCHAR,
        "verified_by" VARCHAR,
        "verified_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "deleted_at" TIMESTAMPTZ
      )
    `);

    // Notification Logs
    await queryRunner.query(`
      CREATE TABLE "notification_logs" (
        "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "recipient_id" UUID REFERENCES "users"("id"),
        "recipient_email" VARCHAR,
        "recipient_phone" VARCHAR,
        "type" "notification_type_enum" NOT NULL,
        "event" "notification_event_enum" NOT NULL,
        "subject" VARCHAR NOT NULL,
        "body" TEXT NOT NULL,
        "is_sent" BOOLEAN NOT NULL DEFAULT false,
        "sent_at" TIMESTAMPTZ,
        "error_message" TEXT,
        "retry_count" INT NOT NULL DEFAULT 0,
        "reference_id" VARCHAR,
        "reference_type" VARCHAR,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "deleted_at" TIMESTAMPTZ
      )
    `);

    // Indexes for performance
    await queryRunner.query(`CREATE INDEX idx_students_academic_year ON students(academic_year_id)`);
    await queryRunner.query(`CREATE INDEX idx_students_class ON students(class_id)`);
    await queryRunner.query(`CREATE INDEX idx_invoices_student ON fee_invoices(student_id)`);
    await queryRunner.query(`CREATE INDEX idx_invoices_status ON fee_invoices(status)`);
    await queryRunner.query(`CREATE INDEX idx_invoices_due_date ON fee_invoices(due_date)`);
    await queryRunner.query(`CREATE INDEX idx_invoices_academic_year ON fee_invoices(academic_year_id)`);
    await queryRunner.query(`CREATE INDEX idx_payments_student ON payments(student_id)`);
    await queryRunner.query(`CREATE INDEX idx_payments_date ON payments(payment_date)`);
    await queryRunner.query(`CREATE INDEX idx_payments_invoice ON payments(invoice_id)`);
    await queryRunner.query(`CREATE INDEX idx_notif_recipient ON notification_logs(recipient_id)`);

    console.log('✅ Initial schema migration complete');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "notification_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "payments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "fee_waivers"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "fee_invoices"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "discounts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "fee_structures"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "students"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "classes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "academic_years"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
    // Drop enums
    const enums = ['user_role_enum','user_status_enum','gender_enum','fee_category_enum','fee_frequency_enum',
      'invoice_status_enum','payment_status_enum','payment_method_enum','discount_type_enum',
      'discount_category_enum','admission_status_enum','notification_type_enum','notification_event_enum','waiver_status_enum'];
    for (const e of enums) await queryRunner.query(`DROP TYPE IF EXISTS "${e}"`);
  }
}
