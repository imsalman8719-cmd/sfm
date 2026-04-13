import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Class } from './entities/class.entity';
import { CreateClassDto, UpdateClassDto } from './dto/class.dto';
import { PaginationDto, PaginatedResult } from '../../common/dto/pagination.dto';

@Injectable()
export class ClassesService {
  constructor(
    @InjectRepository(Class)
    private readonly repo: Repository<Class>,
  ) {}

  async create(dto: CreateClassDto): Promise<Class> {
    const cls = this.repo.create(dto);
    return this.repo.save(cls);
  }

  async findAll(
    pagination: PaginationDto,
    academicYearId?: string,
  ): Promise<PaginatedResult<Class>> {
    const qb = this.repo.createQueryBuilder('class')
      .leftJoinAndSelect('class.academicYear', 'year')
      .leftJoinAndSelect('class.classTeacher', 'teacher')
      .where('class.deleted_at IS NULL');

    if (academicYearId) qb.andWhere('class.academic_year_id = :academicYearId', { academicYearId });
    if (pagination.search) {
      qb.andWhere('(class.name ILIKE :q OR class.grade ILIKE :q)', { q: `%${pagination.search}%` });
    }

    qb.orderBy('class.grade', 'ASC').addOrderBy('class.section', 'ASC')
      .skip(pagination.skip).take(pagination.limit);

    const [data, total] = await qb.getManyAndCount();
    return new PaginatedResult(data, total, pagination.page, pagination.limit);
  }

  async findOne(id: string): Promise<Class> {
    const cls = await this.repo.findOne({
      where: { id },
      relations: ['academicYear', 'classTeacher'],
    });
    if (!cls) throw new NotFoundException(`Class #${id} not found`);
    return cls;
  }

  async findByAcademicYear(academicYearId: string): Promise<Class[]> {
    return this.repo.find({
      where: { academicYearId, isActive: true },
      relations: ['classTeacher'],
      order: { grade: 'ASC', section: 'ASC' },
    });
  }

  async update(id: string, dto: UpdateClassDto): Promise<Class> {
    const cls = await this.findOne(id);
    Object.assign(cls, dto);
    return this.repo.save(cls);
  }

  async getStudentCount(classId: string): Promise<number> {
    return this.repo
      .createQueryBuilder('class')
      .leftJoin('students', 's', 's.class_id = class.id AND s.is_active = true AND s.deleted_at IS NULL')
      .where('class.id = :classId', { classId })
      .getCount();
  }

  async delete(id: string): Promise<void> {
    await this.findOne(id);
    await this.repo.softDelete(id);
  }
}
