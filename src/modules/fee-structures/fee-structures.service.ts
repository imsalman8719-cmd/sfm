import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
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
    // Coerce empty-string optional UUID fields to null so the DB stores NULL
    // (the frontend sends classId: "" when "All Classes" is selected)
    const sanitized = this.sanitizeDto(dto);
    const fs = this.feeRepo.create({ ...sanitized, createdBy });
    return this.feeRepo.save(fs);
  }

  async findAllFeeStructures(
    pagination: PaginationDto,
    filters?: { academicYearId?: string; classId?: string; isActive?: boolean },
  ): Promise<PaginatedResult<FeeStructure>> {
    // TypeORM 0.3.x bug: leftJoinAndSelect + skip/take generates a pagination
    // subquery where createOrderByCombinedWithSelectExpression fails to resolve
    // joined alias metadata. Fix: use a two-step approach —
    //   1. Query just IDs with pagination (no joins, so no subquery bug)
    //   2. Load full entities with relations using those IDs

    const idQb = this.feeRepo.createQueryBuilder('fs')
      .select('fs.id', 'id');

    if (filters?.academicYearId) idQb.andWhere('fs.academic_year_id = :ay', { ay: filters.academicYearId });
    if (filters?.classId) idQb.andWhere('(fs.class_id = :cid OR fs.class_id IS NULL)', { cid: filters.classId });
    if (filters?.isActive !== undefined) idQb.andWhere('fs.is_active = :active', { active: filters.isActive });
    if (pagination.search) idQb.andWhere('fs.name ILIKE :q', { q: `%${pagination.search}%` });

    const total = await idQb.getCount();

    const ids = await idQb
      .orderBy('fs.sort_order', 'ASC')
      .addOrderBy('fs.category', 'ASC')
      .addOrderBy('fs.id', 'ASC')
      .offset(pagination.skip)
      .limit(pagination.limit)
      .getRawMany()
      .then((rows) => rows.map((r) => r.id));

    const data = ids.length
      ? await this.feeRepo.find({ where: { id: In(ids) }, relations: ['academicYear', 'class'] })
      : [];

    // find() doesn't preserve order — restore it
    const ordered = ids.map((id) => data.find((fs) => fs.id === id)).filter(Boolean) as FeeStructure[];

    return new PaginatedResult(ordered, total, pagination.page, pagination.limit);
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
    const sanitized = this.sanitizeDto(dto);
    Object.assign(fs, sanitized);
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

  /**
   * Converts empty-string values on optional UUID fields to null/undefined.
   * This handles the case where the frontend sends classId: "" when the user
   * selects "All Classes" from a <mat-select> with an empty-string sentinel option.
   * An empty string would fail the DB UUID constraint or produce a wrong FK value.
   */
  private sanitizeDto<T extends Partial<CreateFeeStructureDto>>(dto: T): T {
    const optionalUuidFields: Array<keyof CreateFeeStructureDto> = ['classId'];
    const result = { ...dto } as any;
    for (const field of optionalUuidFields) {
      if (field in result && (result[field] === '' || result[field] === null)) {
        result[field] = undefined; // TypeORM will store NULL when undefined on a nullable column
      }
    }
    return result as T;
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
