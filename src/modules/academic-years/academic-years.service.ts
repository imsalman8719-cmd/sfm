import {
  Injectable, NotFoundException, ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AcademicYear } from './entities/academic-year.entity';
import { CreateAcademicYearDto, UpdateAcademicYearDto } from './dto/academic-year.dto';

@Injectable()
export class AcademicYearsService {
  constructor(
    @InjectRepository(AcademicYear)
    private readonly repo: Repository<AcademicYear>,
  ) {}

  async create(dto: CreateAcademicYearDto): Promise<AcademicYear> {
    const existing = await this.repo.findOne({ where: { name: dto.name } });
    if (existing) throw new ConflictException(`Academic year '${dto.name}' already exists`);

    if (dto.isCurrent) await this.repo.update({}, { isCurrent: false });

    const year = this.repo.create(dto);
    return this.repo.save(year);
  }

  async findAll(): Promise<AcademicYear[]> {
    return this.repo.find({ order: { startDate: 'DESC' } });
  }

  async findOne(id: string): Promise<AcademicYear> {
    const year = await this.repo.findOne({ where: { id } });
    if (!year) throw new NotFoundException(`Academic year #${id} not found`);
    return year;
  }

  async findCurrent(): Promise<AcademicYear> {
    const year = await this.repo.findOne({ where: { isCurrent: true } });
    if (!year) throw new NotFoundException('No current academic year set');
    return year;
  }

  async update(id: string, dto: UpdateAcademicYearDto): Promise<AcademicYear> {
    const year = await this.findOne(id);
    if (dto.isCurrent) await this.repo.update({}, { isCurrent: false });
    Object.assign(year, dto);
    return this.repo.save(year);
  }

  async setCurrent(id: string): Promise<AcademicYear> {
    await this.repo.update({}, { isCurrent: false });
    const year = await this.findOne(id);
    year.isCurrent = true;
    return this.repo.save(year);
  }

  async updateTargets(
    id: string,
    feeTarget: number,
    monthlyTargets?: Record<string, number>,
    quarterlyTargets?: Record<string, number>,
  ): Promise<AcademicYear> {
    const year = await this.findOne(id);
    year.feeTarget = feeTarget;
    if (monthlyTargets) year.monthlyTargets = monthlyTargets;
    if (quarterlyTargets) year.quarterlyTargets = quarterlyTargets;
    return this.repo.save(year);
  }

  async delete(id: string): Promise<void> {
    const year = await this.findOne(id);
    await this.repo.softDelete(id);
  }
}
