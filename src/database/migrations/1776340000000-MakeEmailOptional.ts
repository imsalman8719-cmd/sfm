import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Makes the users.email column nullable.
 * Staff log in with employeeId, students with registrationNumber.
 * Email is now optional on all user types.
 *
 * Adds a partial unique index so two users can't share the same email,
 * but multiple users can have NULL email.
 */
export class MakeEmailOptional1776340000000 implements MigrationInterface {
  name = 'MakeEmailOptional1776340000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the old unique index / constraint on email
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_email"`);
    await queryRunner.query(
      `ALTER TABLE users DROP CONSTRAINT IF EXISTS "UQ_97672ac88f789774dd47f7c8be3"`,
    );
    await queryRunner.query(
      `ALTER TABLE users DROP CONSTRAINT IF EXISTS "users_email_key"`,
    );

    // Make email nullable
    await queryRunner.query(`ALTER TABLE users ALTER COLUMN email DROP NOT NULL`);

    // Add partial unique index: unique only when email IS NOT NULL
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_users_email_non_null"
       ON users (email) WHERE email IS NOT NULL`,
    );

    console.log('✅ users.email is now nullable with partial unique index');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_users_email_non_null"`);
    await queryRunner.query(`ALTER TABLE users ALTER COLUMN email SET NOT NULL`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_users_email" ON users (email)`);
  }
}
