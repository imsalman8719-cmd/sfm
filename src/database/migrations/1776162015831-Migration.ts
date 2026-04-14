import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1776162015831 implements MigrationInterface {
    name = 'Migration1776162015831'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."users_role_enum" AS ENUM('super_admin', 'finance', 'admission', 'teacher', 'student', 'parent')`);
        await queryRunner.query(`CREATE TYPE "public"."users_status_enum" AS ENUM('active', 'inactive', 'suspended', 'pending')`);
        await queryRunner.query(`CREATE TYPE "public"."users_gender_enum" AS ENUM('male', 'female', 'other')`);
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "first_name" character varying(100) NOT NULL, "last_name" character varying(100) NOT NULL, "email" character varying(150) NOT NULL, "phone" character varying(20), "password_hash" character varying NOT NULL, "role" "public"."users_role_enum" NOT NULL, "status" "public"."users_status_enum" NOT NULL DEFAULT 'active', "gender" "public"."users_gender_enum", "date_of_birth" date, "address" character varying, "avatar_url" character varying, "employee_id" character varying, "department" character varying, "last_login" TIMESTAMP WITH TIME ZONE, "refresh_token" character varying, "password_reset_token" character varying, "password_reset_expires" TIMESTAMP WITH TIME ZONE, "email_verified" boolean NOT NULL DEFAULT false, "is_first_login" boolean NOT NULL DEFAULT true, "created_by" character varying, CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "UQ_9760615d88ed518196bb79ea03d" UNIQUE ("employee_id"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_97672ac88f789774dd47f7c8be" ON "users" ("email") `);
        await queryRunner.query(`CREATE TABLE "academic_years" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "name" character varying(20) NOT NULL, "start_date" date NOT NULL, "end_date" date NOT NULL, "is_current" boolean NOT NULL DEFAULT false, "description" character varying, "fee_target" numeric(15,2) NOT NULL DEFAULT '0', "monthly_targets" jsonb, "quarterly_targets" jsonb, CONSTRAINT "UQ_645d0f115fa85aaecffdc11cbaa" UNIQUE ("name"), CONSTRAINT "PK_2021b90bfbfa6c9da7df34ca1cf" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "classes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "name" character varying(100) NOT NULL, "grade" character varying(20) NOT NULL, "section" character varying(10), "description" character varying, "max_capacity" integer NOT NULL DEFAULT '40', "is_active" boolean NOT NULL DEFAULT true, "academic_year_id" uuid NOT NULL, "class_teacher_id" uuid, CONSTRAINT "PK_e207aa15404e9b2ce35910f9f7f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."students_admission_status_enum" AS ENUM('applied', 'under_review', 'admitted', 'rejected', 'withdrawn')`);
        await queryRunner.query(`CREATE TABLE "students" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "user_id" uuid NOT NULL, "registration_number" character varying(30) NOT NULL, "roll_number" character varying(20), "class_id" uuid, "academic_year_id" uuid NOT NULL, "admission_date" date, "admission_status" "public"."students_admission_status_enum" NOT NULL DEFAULT 'admitted', "father_name" character varying, "father_phone" character varying, "father_email" character varying, "mother_name" character varying, "mother_phone" character varying, "guardian_name" character varying, "guardian_phone" character varying, "guardian_relation" character varying, "emergency_contact" character varying, "previous_school" character varying, "previous_grade" character varying, "blood_group" character varying(10), "nationality" character varying(60), "religion" character varying(60), "has_siblings" boolean NOT NULL DEFAULT false, "sibling_discount_eligible" boolean NOT NULL DEFAULT false, "is_active" boolean NOT NULL DEFAULT true, "transport_required" boolean NOT NULL DEFAULT false, "hostel_required" boolean NOT NULL DEFAULT false, "notes" text, CONSTRAINT "UQ_fb3eff90b11bddf7285f9b4e281" UNIQUE ("user_id"), CONSTRAINT "UQ_82946fdb5652b83cacb81e9083e" UNIQUE ("registration_number"), CONSTRAINT "REL_fb3eff90b11bddf7285f9b4e28" UNIQUE ("user_id"), CONSTRAINT "PK_7d7f07271ad4ce999880713f05e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_4ae6feeb1b5373c648536559bb" ON "students" ("roll_number", "academic_year_id") `);
        await queryRunner.query(`CREATE TYPE "public"."fee_structures_category_enum" AS ENUM('tuition', 'admission', 'exam', 'library', 'laboratory', 'transport', 'hostel', 'sports', 'uniform', 'miscellaneous', 'late_fee', 'discount')`);
        await queryRunner.query(`CREATE TYPE "public"."fee_structures_frequency_enum" AS ENUM('one_time', 'monthly', 'quarterly', 'semi_annual', 'annual', 'custom')`);
        await queryRunner.query(`CREATE TYPE "public"."fee_structures_late_fee_type_enum" AS ENUM('percentage', 'fixed')`);
        await queryRunner.query(`CREATE TABLE "fee_structures" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "name" character varying(150) NOT NULL, "description" text, "category" "public"."fee_structures_category_enum" NOT NULL, "frequency" "public"."fee_structures_frequency_enum" NOT NULL, "amount" numeric(12,2) NOT NULL, "academic_year_id" uuid NOT NULL, "class_id" uuid, "is_mandatory" boolean NOT NULL DEFAULT true, "is_active" boolean NOT NULL DEFAULT true, "due_day_of_month" integer, "due_date" date, "late_fee_enabled" boolean NOT NULL DEFAULT true, "late_fee_type" "public"."fee_structures_late_fee_type_enum", "late_fee_value" numeric(8,2), "grace_period_days" integer NOT NULL DEFAULT '7', "installment_schedule" jsonb, "applicable_months" integer array, "sort_order" integer NOT NULL DEFAULT '0', "created_by" character varying, CONSTRAINT "PK_d634078deb9cf5ceb5788ad9b53" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."discounts_category_enum" AS ENUM('merit', 'need_based', 'sibling', 'staff_ward', 'special')`);
        await queryRunner.query(`CREATE TYPE "public"."discounts_type_enum" AS ENUM('percentage', 'fixed')`);
        await queryRunner.query(`CREATE TABLE "discounts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "name" character varying(150) NOT NULL, "description" text, "category" "public"."discounts_category_enum" NOT NULL, "type" "public"."discounts_type_enum" NOT NULL, "value" numeric(8,2) NOT NULL, "student_id" uuid, "fee_structure_id" uuid, "academic_year_id" uuid NOT NULL, "valid_from" date, "valid_until" date, "is_active" boolean NOT NULL DEFAULT true, "approved_by" character varying, "created_by" character varying, CONSTRAINT "PK_66c522004212dc814d6e2f14ecc" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."fee_invoices_status_enum" AS ENUM('draft', 'issued', 'partially_paid', 'paid', 'overdue', 'waived', 'cancelled')`);
        await queryRunner.query(`CREATE TABLE "fee_invoices" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "invoice_number" character varying(40) NOT NULL, "student_id" uuid NOT NULL, "academic_year_id" uuid NOT NULL, "billing_month" integer, "billing_year" integer, "billing_quarter" integer, "billing_label" character varying, "issue_date" date NOT NULL, "due_date" date NOT NULL, "status" "public"."fee_invoices_status_enum" NOT NULL DEFAULT 'issued', "subtotal" numeric(12,2) NOT NULL DEFAULT '0', "discount_amount" numeric(12,2) NOT NULL DEFAULT '0', "late_fee_amount" numeric(12,2) NOT NULL DEFAULT '0', "total_amount" numeric(12,2) NOT NULL, "paid_amount" numeric(12,2) NOT NULL DEFAULT '0', "balance_amount" numeric(12,2) NOT NULL DEFAULT '0', "waived_amount" numeric(12,2) NOT NULL DEFAULT '0', "line_items" jsonb NOT NULL, "notes" text, "reminder_count" integer NOT NULL DEFAULT '0', "last_reminder_at" TIMESTAMP WITH TIME ZONE, "created_by" character varying, "cancelled_by" character varying, "cancelled_at" TIMESTAMP WITH TIME ZONE, "cancellation_reason" character varying, CONSTRAINT "UQ_609befa42ec7a590b54b9ff58b2" UNIQUE ("invoice_number"), CONSTRAINT "PK_6916959219c76dfb86ecc822ab0" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_609befa42ec7a590b54b9ff58b" ON "fee_invoices" ("invoice_number") `);
        await queryRunner.query(`CREATE TYPE "public"."fee_waivers_type_enum" AS ENUM('percentage', 'fixed')`);
        await queryRunner.query(`CREATE TYPE "public"."fee_waivers_status_enum" AS ENUM('pending', 'approved', 'rejected')`);
        await queryRunner.query(`CREATE TABLE "fee_waivers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "invoice_id" uuid NOT NULL, "student_id" uuid NOT NULL, "type" "public"."fee_waivers_type_enum" NOT NULL, "value" numeric(8,2) NOT NULL, "waived_amount" numeric(12,2) NOT NULL, "reason" text NOT NULL, "status" "public"."fee_waivers_status_enum" NOT NULL DEFAULT 'pending', "requested_by" character varying, "reviewed_by" uuid, "reviewed_at" TIMESTAMP WITH TIME ZONE, "review_remarks" text, CONSTRAINT "PK_9b4212a775746cbd6ab60d1c9f6" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."payments_method_enum" AS ENUM('cash', 'bank_transfer', 'cheque', 'online', 'pos')`);
        await queryRunner.query(`CREATE TYPE "public"."payments_status_enum" AS ENUM('pending', 'completed', 'failed', 'refunded', 'cancelled')`);
        await queryRunner.query(`CREATE TABLE "payments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "receipt_number" character varying(40) NOT NULL, "invoice_id" uuid NOT NULL, "student_id" uuid NOT NULL, "amount" numeric(12,2) NOT NULL, "method" "public"."payments_method_enum" NOT NULL, "status" "public"."payments_status_enum" NOT NULL DEFAULT 'completed', "payment_date" date NOT NULL, "transaction_id" character varying(100), "bank_name" character varying(100), "cheque_number" character varying(50), "cheque_date" date, "remarks" text, "is_refunded" boolean NOT NULL DEFAULT false, "refunded_amount" numeric(12,2), "refund_reason" text, "refunded_at" TIMESTAMP WITH TIME ZONE, "refunded_by" character varying, "collected_by" character varying, "verified_by" character varying, "verified_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_a6659e5eb1bf3b467c819e7f167" UNIQUE ("receipt_number"), CONSTRAINT "PK_197ab7af18c93fbb0c9b28b4a59" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_a6659e5eb1bf3b467c819e7f16" ON "payments" ("receipt_number") `);
        await queryRunner.query(`CREATE TYPE "public"."notification_logs_type_enum" AS ENUM('email', 'sms', 'system')`);
        await queryRunner.query(`CREATE TYPE "public"."notification_logs_event_enum" AS ENUM('invoice_generated', 'payment_received', 'payment_overdue', 'reminder_sent', 'discount_applied', 'waiver_applied', 'account_created', 'password_reset')`);
        await queryRunner.query(`CREATE TABLE "notification_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "recipient_id" uuid, "recipient_email" character varying, "recipient_phone" character varying, "type" "public"."notification_logs_type_enum" NOT NULL, "event" "public"."notification_logs_event_enum" NOT NULL, "subject" character varying NOT NULL, "body" text NOT NULL, "is_sent" boolean NOT NULL DEFAULT false, "sent_at" TIMESTAMP WITH TIME ZONE, "error_message" text, "retry_count" integer NOT NULL DEFAULT '0', "reference_id" character varying, "reference_type" character varying, CONSTRAINT "PK_19c524e644cdeaebfcffc284871" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."student_fee_plans_billing_frequency_enum" AS ENUM('one_time', 'monthly', 'quarterly', 'semi_annual', 'annual', 'custom')`);
        await queryRunner.query(`CREATE TABLE "student_fee_plans" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "student_id" uuid NOT NULL, "fee_structure_id" uuid NOT NULL, "academic_year_id" uuid NOT NULL, "billing_frequency" "public"."student_fee_plans_billing_frequency_enum" NOT NULL, "custom_amount" numeric(12,2), "is_active" boolean NOT NULL DEFAULT true, "notes" character varying, "created_by" character varying, CONSTRAINT "UQ_54908dd6fca17570d0477b9897a" UNIQUE ("student_id", "fee_structure_id", "academic_year_id", "deleted_at"), CONSTRAINT "PK_07af6ae46f305b4427dd3c7df6e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "global_settings" ("id" character varying(10) NOT NULL DEFAULT 'global', "monthly_invoice_day" integer NOT NULL DEFAULT '1', "quarterly_invoice_days_before" integer NOT NULL DEFAULT '7', "semi_annual_invoice_days_before" integer NOT NULL DEFAULT '14', "annual_invoice_days_before" integer NOT NULL DEFAULT '30', "default_due_days" integer NOT NULL DEFAULT '10', "auto_invoice_enabled" boolean NOT NULL DEFAULT true, "auto_overdue_marking_enabled" boolean NOT NULL DEFAULT true, "auto_reminder_enabled" boolean NOT NULL DEFAULT true, "reminder_days_before_due" integer NOT NULL DEFAULT '3', "school_name" character varying, "school_address" character varying, "school_phone" character varying, "currency_symbol" character varying NOT NULL DEFAULT 'PKR', "updated_at" TIMESTAMP WITH TIME ZONE, "updated_by" character varying, CONSTRAINT "PK_fec5e2c0bf238e30b25d4a82976" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "classes" ADD CONSTRAINT "FK_28b990f2f869e1d1652a15388f5" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "classes" ADD CONSTRAINT "FK_9c888a9cd3efc25a72a0be264b0" FOREIGN KEY ("class_teacher_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "students" ADD CONSTRAINT "FK_fb3eff90b11bddf7285f9b4e281" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "students" ADD CONSTRAINT "FK_de6ad4ae6936dce474e2823984e" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "students" ADD CONSTRAINT "FK_6bc0f2720400592a016f284ac28" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "fee_structures" ADD CONSTRAINT "FK_4649c7e79b41c39871d78afe0e4" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "fee_structures" ADD CONSTRAINT "FK_e8d5f252faed8dfe19f49bbd780" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "discounts" ADD CONSTRAINT "FK_8e2b5a5b659879e0b1f3ab7e7e9" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "discounts" ADD CONSTRAINT "FK_18d80c879f5a22410991fdcbd11" FOREIGN KEY ("fee_structure_id") REFERENCES "fee_structures"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "discounts" ADD CONSTRAINT "FK_ccae6afedfb8ec21e6f4bd1d53c" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "fee_invoices" ADD CONSTRAINT "FK_14b956ec2d4d139dcf692cf116d" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "fee_invoices" ADD CONSTRAINT "FK_31ddc60f24bde64b484c0ce091e" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "fee_waivers" ADD CONSTRAINT "FK_17d80241fbb2b82932c183304e3" FOREIGN KEY ("invoice_id") REFERENCES "fee_invoices"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "fee_waivers" ADD CONSTRAINT "FK_febd12a3c947641436f75f26064" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "payments" ADD CONSTRAINT "FK_563a5e248518c623eebd987d43e" FOREIGN KEY ("invoice_id") REFERENCES "fee_invoices"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "payments" ADD CONSTRAINT "FK_9fd5d6ef620b0140a67ff2d95c4" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "notification_logs" ADD CONSTRAINT "FK_72a345cc2f0dcad486c6432e97f" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "student_fee_plans" ADD CONSTRAINT "FK_158f1aeccbed547b49809e227cd" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "student_fee_plans" ADD CONSTRAINT "FK_effbe418dc0b6196aac5fa447f8" FOREIGN KEY ("fee_structure_id") REFERENCES "fee_structures"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "student_fee_plans" ADD CONSTRAINT "FK_f983c24e42eb81916590fdec0a1" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "student_fee_plans" DROP CONSTRAINT "FK_f983c24e42eb81916590fdec0a1"`);
        await queryRunner.query(`ALTER TABLE "student_fee_plans" DROP CONSTRAINT "FK_effbe418dc0b6196aac5fa447f8"`);
        await queryRunner.query(`ALTER TABLE "student_fee_plans" DROP CONSTRAINT "FK_158f1aeccbed547b49809e227cd"`);
        await queryRunner.query(`ALTER TABLE "notification_logs" DROP CONSTRAINT "FK_72a345cc2f0dcad486c6432e97f"`);
        await queryRunner.query(`ALTER TABLE "payments" DROP CONSTRAINT "FK_9fd5d6ef620b0140a67ff2d95c4"`);
        await queryRunner.query(`ALTER TABLE "payments" DROP CONSTRAINT "FK_563a5e248518c623eebd987d43e"`);
        await queryRunner.query(`ALTER TABLE "fee_waivers" DROP CONSTRAINT "FK_febd12a3c947641436f75f26064"`);
        await queryRunner.query(`ALTER TABLE "fee_waivers" DROP CONSTRAINT "FK_17d80241fbb2b82932c183304e3"`);
        await queryRunner.query(`ALTER TABLE "fee_invoices" DROP CONSTRAINT "FK_31ddc60f24bde64b484c0ce091e"`);
        await queryRunner.query(`ALTER TABLE "fee_invoices" DROP CONSTRAINT "FK_14b956ec2d4d139dcf692cf116d"`);
        await queryRunner.query(`ALTER TABLE "discounts" DROP CONSTRAINT "FK_ccae6afedfb8ec21e6f4bd1d53c"`);
        await queryRunner.query(`ALTER TABLE "discounts" DROP CONSTRAINT "FK_18d80c879f5a22410991fdcbd11"`);
        await queryRunner.query(`ALTER TABLE "discounts" DROP CONSTRAINT "FK_8e2b5a5b659879e0b1f3ab7e7e9"`);
        await queryRunner.query(`ALTER TABLE "fee_structures" DROP CONSTRAINT "FK_e8d5f252faed8dfe19f49bbd780"`);
        await queryRunner.query(`ALTER TABLE "fee_structures" DROP CONSTRAINT "FK_4649c7e79b41c39871d78afe0e4"`);
        await queryRunner.query(`ALTER TABLE "students" DROP CONSTRAINT "FK_6bc0f2720400592a016f284ac28"`);
        await queryRunner.query(`ALTER TABLE "students" DROP CONSTRAINT "FK_de6ad4ae6936dce474e2823984e"`);
        await queryRunner.query(`ALTER TABLE "students" DROP CONSTRAINT "FK_fb3eff90b11bddf7285f9b4e281"`);
        await queryRunner.query(`ALTER TABLE "classes" DROP CONSTRAINT "FK_9c888a9cd3efc25a72a0be264b0"`);
        await queryRunner.query(`ALTER TABLE "classes" DROP CONSTRAINT "FK_28b990f2f869e1d1652a15388f5"`);
        await queryRunner.query(`DROP TABLE "global_settings"`);
        await queryRunner.query(`DROP TABLE "student_fee_plans"`);
        await queryRunner.query(`DROP TYPE "public"."student_fee_plans_billing_frequency_enum"`);
        await queryRunner.query(`DROP TABLE "notification_logs"`);
        await queryRunner.query(`DROP TYPE "public"."notification_logs_event_enum"`);
        await queryRunner.query(`DROP TYPE "public"."notification_logs_type_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_a6659e5eb1bf3b467c819e7f16"`);
        await queryRunner.query(`DROP TABLE "payments"`);
        await queryRunner.query(`DROP TYPE "public"."payments_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."payments_method_enum"`);
        await queryRunner.query(`DROP TABLE "fee_waivers"`);
        await queryRunner.query(`DROP TYPE "public"."fee_waivers_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."fee_waivers_type_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_609befa42ec7a590b54b9ff58b"`);
        await queryRunner.query(`DROP TABLE "fee_invoices"`);
        await queryRunner.query(`DROP TYPE "public"."fee_invoices_status_enum"`);
        await queryRunner.query(`DROP TABLE "discounts"`);
        await queryRunner.query(`DROP TYPE "public"."discounts_type_enum"`);
        await queryRunner.query(`DROP TYPE "public"."discounts_category_enum"`);
        await queryRunner.query(`DROP TABLE "fee_structures"`);
        await queryRunner.query(`DROP TYPE "public"."fee_structures_late_fee_type_enum"`);
        await queryRunner.query(`DROP TYPE "public"."fee_structures_frequency_enum"`);
        await queryRunner.query(`DROP TYPE "public"."fee_structures_category_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_4ae6feeb1b5373c648536559bb"`);
        await queryRunner.query(`DROP TABLE "students"`);
        await queryRunner.query(`DROP TYPE "public"."students_admission_status_enum"`);
        await queryRunner.query(`DROP TABLE "classes"`);
        await queryRunner.query(`DROP TABLE "academic_years"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_97672ac88f789774dd47f7c8be"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TYPE "public"."users_gender_enum"`);
        await queryRunner.query(`DROP TYPE "public"."users_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
    }

}
