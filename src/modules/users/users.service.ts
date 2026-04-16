import {
  Injectable, NotFoundException, ConflictException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PaginationDto, PaginatedResult } from '../../common/dto/pagination.dto';
import { UserRole, UserStatus } from '../../common/enums';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateUserDto, createdBy?: string): Promise<User> {
    const existing = await this.userRepository.findOne({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already in use');

    const user = this.userRepository.create({
      ...dto,
      passwordHash: dto.password,
      createdBy,
      employeeId: dto.role !== UserRole.STUDENT
        ? `EMP-${uuidv4().split('-')[0].toUpperCase()}`
        : undefined,
    });
    return this.userRepository.save(user);
  }

  async findAll(pagination: PaginationDto, role?: UserRole): Promise<PaginatedResult<User>> {
    const qb = this.userRepository.createQueryBuilder('user')
      .where('user.deleted_at IS NULL');
    if (role) qb.andWhere('user.role = :role', { role });
    if (pagination.search) {
      qb.andWhere(
        '(user.first_name ILIKE :q OR user.last_name ILIKE :q OR user.email ILIKE :q OR user.employee_id ILIKE :q)',
        { q: `%${pagination.search}%` },
      );
    }
    qb.orderBy(`user.${pagination.sortBy || 'createdAt'}`, pagination.sortOrder || 'DESC')
      .skip(pagination.skip).take(pagination.limit);
    const [data, total] = await qb.getManyAndCount();
    return new PaginatedResult(data, total, pagination.page, pagination.limit);
  }

  async findOne(id: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException(`User #${id} not found`);
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { email } });
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);
    if (dto.email && dto.email !== user.email) {
      const existing = await this.findByEmail(dto.email);
      if (existing) throw new ConflictException('Email already in use');
    }
    Object.assign(user, dto);
    return this.userRepository.save(user);
  }

  async updateStatus(id: string, status: UserStatus): Promise<User> {
    const user = await this.findOne(id);
    user.status = status;
    return this.userRepository.save(user);
  }

  async changePassword(id: string, oldPassword: string, newPassword: string): Promise<void> {
    const user = await this.findOne(id);
    const valid = await user.validatePassword(oldPassword);
    if (!valid) throw new BadRequestException('Current password is incorrect');
    user.passwordHash = await bcrypt.hash(newPassword, 12);
    user.isFirstLogin = false;
    await this.userRepository.save(user);
  }

  async adminResetPassword(id: string, newPassword: string): Promise<void> {
    const user = await this.findOne(id);
    user.passwordHash = await bcrypt.hash(newPassword, 12);
    user.isFirstLogin = true;
    await this.userRepository.save(user);
  }

  async setRefreshToken(id: string, token: string | null): Promise<void> {
    await this.userRepository.update(id, { refreshToken: token });
  }

  async updateLastLogin(id: string): Promise<void> {
    await this.userRepository.update(id, { lastLogin: new Date() });
  }

  /**
   * Cascading soft-delete:
   *   1. Soft-delete the user record
   *   2. Soft-delete the linked student record (set is_active=false too)
   *
   * Invoices and payments are intentionally preserved as financial audit records.
   */
  async softDelete(id: string): Promise<void> {
    await this.findOne(id); // ensure user exists
    const now = new Date().toISOString();

    await this.dataSource.transaction(async (manager) => {
      // 1. Soft-delete user
      await manager.query(
        `UPDATE users SET deleted_at = $1, status = 'inactive' WHERE id = $2`,
        [now, id],
      );

      // 2. Soft-delete student linked to this user
      await manager.query(
        `UPDATE students SET deleted_at = $1, is_active = false
         WHERE user_id = $2 AND deleted_at IS NULL`,
        [now, id],
      );

    });
  }

  async countByRole(): Promise<Record<string, number>> {
    const result = await this.userRepository
      .createQueryBuilder('user')
      .select('user.role', 'role')
      .addSelect('COUNT(*)', 'count')
      .where('user.deleted_at IS NULL')
      .groupBy('user.role')
      .getRawMany();

    return result.reduce((acc, r) => {
      acc[r.role] = parseInt(r.count, 10);
      return acc;
    }, {});
  }
}
