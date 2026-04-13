import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FeeStructure } from './entities/fee-structure.entity';
import { Discount } from './entities/discount.entity';
import {
  CreateFeeStructureDto, UpdateFeeStructureDto,
  CreateDiscountDto, UpdateDiscountDto,
} from './dto/fee-structure.dto';
import { PaginationDto, PaginatedResult } from '../../common/dto/pagination.dto';

@Injectable()
export class FeeStructuresService {
  constructor(
    @InjectRepository(FeeStructure) private readonly feeRepo: Repository<FeeStructure>,
    @InjectRepository(Discount) private readonly discountRepo: Repository<Discount>,
  ) {}

  // ── Fee Structures ──────────────────────────────────────────────────────────

  async createFeeStructure(dto: CreateFeeStructureDto, createdBy?: string): Promise<FeeStructure> {
    const fs = this.feeRepo.create({ ...dto, createdBy });
    return this.feeRepo.save(fs);
  }

  async findAllFeeStructures(
    pagination: PaginationDto,
    filters?: { academicYearId?: string; classId?: string; isActive?: boolean },
  ): Promise<PaginatedResult<FeeStructure>> {
    const qb = this.feeRepo.createQueryBuilder('fs')
      .leftJoinAndSelect('fs.academicYear', 'year')
      .leftJoinAndSelect('fs.class', 'class');

    if (filters?.academicYearId) qb.andWhere('fs.academic_year_id = :ay', { ay: filters.academicYearId });
    if (filters?.classId) qb.andWhere('(fs.class_id = :cid OR fs.class_id IS NULL)', { cid: filters.classId });
    if (filters?.isActive !== undefined) qb.andWhere('fs.is_active = :active', { active: filters.isActive });
    if (pagination.search) qb.andWhere('fs.name ILIKE :q', { q: `%${pagination.search}%` });

    qb.orderBy('fs.sort_order', 'ASC').addOrderBy('fs.category', 'ASC')
      .skip(pagination.skip).take(pagination.limit);

    const [data, total] = await qb.getManyAndCount();
    return new PaginatedResult(data, total, pagination.page, pagination.limit);
  }

  async findFeeStructureById(id: string): Promise<FeeStructure> {
    const fs = await this.feeRepo.findOne({ where: { id }, relations: ['academicYear', 'class'] });
    if (!fs) throw new NotFoundException(`Fee structure #${id} not found`);
    return fs;
  }

  async findApplicableForStudent(studentClassId: string, academicYearId: string): Promise<FeeStructure[]> {
    return this.feeRepo.createQueryBuilder('fs')
      .where('fs.academic_year_id = :ay', { ay: academicYearId })
      .andWhere('fs.is_active = true')
      .andWhere('(fs.class_id = :classId OR fs.class_id IS NULL)', { classId: studentClassId })
      .orderBy('fs.sort_order', 'ASC')
      .getMany();
  }

  async updateFeeStructure(id: string, dto: UpdateFeeStructureDto): Promise<FeeStructure> {
    const fs = await this.findFeeStructureById(id);
    Object.assign(fs, dto);
    return this.feeRepo.save(fs);
  }

  async toggleFeeStructureActive(id: string): Promise<FeeStructure> {
    const fs = await this.findFeeStructureById(id);
    fs.isActive = !fs.isActive;
    return this.feeRepo.save(fs);
  }

  async deleteFeeStructure(id: string): Promise<void> {
    await this.findFeeStructureById(id);
    await this.feeRepo.softDelete(id);
  }

  async copyFeeStructuresToYear(fromYearId: string, toYearId: string): Promise<number> {
    const structures = await this.feeRepo.find({ where: { academicYearId: fromYearId } });
    const copies = structures.map((s) => {
      const copy = this.feeRepo.create({ ...s, id: undefined, academicYearId: toYearId, createdAt: undefined, updatedAt: undefined });
      return copy;
    });
    await this.feeRepo.save(copies);
    return copies.length;
  }

  // ── Discounts ───────────────────────────────────────────────────────────────

  async createDiscount(dto: CreateDiscountDto, createdBy?: string): Promise<Discount> {
    const disc = this.discountRepo.create({ ...dto, createdBy });
    return this.discountRepo.save(disc);
  }

  async findAllDiscounts(filters?: { academicYearId?: string; studentId?: string }): Promise<Discount[]> {
    const qb = this.discountRepo.createQueryBuilder('d')
      .leftJoinAndSelect('d.student', 's')
      .leftJoinAndSelect('s.user', 'u')
      .leftJoinAndSelect('d.feeStructure', 'fs');

    if (filters?.academicYearId) qb.andWhere('d.academic_year_id = :ay', { ay: filters.academicYearId });
    if (filters?.studentId) qb.andWhere('(d.student_id = :sid OR d.student_id IS NULL)', { sid: filters.studentId });

    return qb.orderBy('d.created_at', 'DESC').getMany();
  }

  async findDiscountById(id: string): Promise<Discount> {
    const d = await this.discountRepo.findOne({ where: { id }, relations: ['student', 'feeStructure'] });
    if (!d) throw new NotFoundException(`Discount #${id} not found`);
    return d;
  }

  async findDiscountsForStudent(studentId: string, academicYearId: string): Promise<Discount[]> {
    return this.discountRepo.find({
      where: [
        { studentId, academicYearId, isActive: true },
        { studentId: null, academicYearId, isActive: true },
      ],
    });
  }

  async updateDiscount(id: string, dto: UpdateDiscountDto): Promise<Discount> {
    const d = await this.findDiscountById(id);
    Object.assign(d, dto);
    return this.discountRepo.save(d);
  }

  async approveDiscount(id: string, approvedBy: string): Promise<Discount> {
    const d = await this.findDiscountById(id);
    d.approvedBy = approvedBy;
    return this.discountRepo.save(d);
  }

  async deleteDiscount(id: string): Promise<void> {
    await this.findDiscountById(id);
    await this.discountRepo.softDelete(id);
  }
}
