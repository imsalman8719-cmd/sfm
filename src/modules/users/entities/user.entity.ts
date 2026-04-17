import {
  Entity,
  Column,
  OneToOne,
  OneToMany,
  BeforeInsert,
  BeforeUpdate,
  Index,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import * as bcrypt from 'bcrypt';
import { CoreEntity } from '../../../common/entities/core.entity';
import { UserRole, UserStatus, Gender } from '../../../common/enums';

@Entity('users')
export class User extends CoreEntity {
  @Column({ name: 'first_name', length: 100 })
  firstName: string;

  @Column({ name: 'last_name', length: 100 })
  lastName: string;

  @Column({ nullable: true, length: 150 })
  email: string | null;

  @Column({ nullable: true, length: 20 })
  phone: string;

  @Column({ name: 'password_hash' })
  @Exclude()
  passwordHash: string;

  @Column({ type: 'enum', enum: UserRole })
  role: UserRole;

  @Column({ type: 'enum', enum: UserStatus, default: UserStatus.ACTIVE })
  status: UserStatus;

  @Column({ type: 'enum', enum: Gender, nullable: true })
  gender: Gender;

  @Column({ name: 'date_of_birth', type: 'date', nullable: true })
  dateOfBirth: Date;

  @Column({ nullable: true })
  address: string;

  @Column({ name: 'avatar_url', nullable: true })
  avatarUrl: string;

  @Column({ name: 'employee_id', nullable: true, unique: true })
  employeeId: string;

  @Column({ name: 'department', nullable: true })
  department: string;

  @Column({ name: 'last_login', nullable: true, type: 'timestamptz' })
  lastLogin: Date;

  @Column({ name: 'refresh_token', nullable: true })
  @Exclude()
  refreshToken: string;

  @Column({ name: 'password_reset_token', nullable: true })
  @Exclude()
  passwordResetToken: string;

  @Column({ name: 'password_reset_expires', nullable: true, type: 'timestamptz' })
  @Exclude()
  passwordResetExpires: Date;

  @Column({ name: 'email_verified', default: false })
  emailVerified: boolean;

  @Column({ name: 'is_first_login', default: true })
  isFirstLogin: boolean;

  @Column({ name: 'created_by', nullable: true })
  createdBy: string;

  // Relations (lazy references to avoid circular deps)
  // Student profile linked via StudentProfile entity

  get fullName(): string {
    return `${this.firstName} ${this.lastName}`;
  }

  @BeforeInsert()
  @BeforeUpdate()
  async hashPassword() {
    if (this.passwordHash && !this.passwordHash.startsWith('$2b$')) {
      this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
    }
  }

  async validatePassword(password: string): Promise<boolean> {
    return bcrypt.compare(password, this.passwordHash);
  }
}
