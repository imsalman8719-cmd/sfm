import {
  Injectable, NotFoundException, ConflictException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Student } from './entities/student.entity';
import { User } from '../users/entities/user.entity';
import { CreateStudentDto, UpdateStudentDto, AssignClassDto } from './dto/student.dto';
import { PaginationDto, PaginatedResult } from '../../common/dto/pagination.dto';
import { UserRole, AdmissionStatus } from '../../common/enums';

@Injectable()
export class StudentsService {
  constructor(
    @InjectRepository(Student) private readonly studentRepo: Repository<Student>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateStudentDto, createdBy?: string): Promise<Student> {
    return this.dataSource.transaction(async (manager) => {
      // 1. Check email uniqueness
      const existingUser = await manager.findOne(User, { where: { email: dto.email } });
      if (existingUser) throw new ConflictException('Email already in use');

      // 2. Create User account
      const user = manager.create(User, {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        passwordHash: dto.password,
        phone: dto.phone,
        gender: dto.gender,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
        address: dto.address,
        role: UserRole.STUDENT,
        createdBy,
      });
      const savedUser = await manager.save(User, user);

      // 3. Generate registration number: STU-YYYY-XXXXX
      const year = new Date().getFullYear();
      const seq = uuidv4().split('-')[0].toUpperCase();
      const registrationNumber = `STU-${year}-${seq}`;

      // 4. Create Student profile
      const student = manager.create(Student, {
        userId: savedUser.id,
        registrationNumber,
        academicYearId: dto.academicYearId,
        classId: dto.classId,
        rollNumber: dto.rollNumber,
        admissionDate: dto.admissionDate ? new Date(dto.admissionDate) : new Date(),
        admissionStatus: dto.admissionStatus || AdmissionStatus.ADMITTED,
        fatherName: dto.fatherName,
        fatherPhone: dto.fatherPhone,
        fatherEmail: dto.fatherEmail,
        motherName: dto.motherName,
        motherPhone: dto.motherPhone,
        guardianName: dto.guardianName,
        guardianPhone: dto.guardianPhone,
        guardianRelation: dto.guardianRelation,
        emergencyContact: dto.emergencyContact,
        previousSchool: dto.previousSchool,
        previousGrade: dto.previousGrade,
        bloodGroup: dto.bloodGroup,
        nationality: dto.nationality,
        religion: dto.religion,
        transportRequired: dto.transportRequired || false,
        hostelRequired: dto.hostelRequired || false,
        hasSiblings: dto.hasSiblings || false,
        notes: dto.notes,
      });

      return manager.save(Student, student);
    });
  }

  async findAll(
    pagination: PaginationDto,
    filters?: {
      academicYearId?: string;
      classId?: string;
      admissionStatus?: AdmissionStatus;
      isActive?: boolean;
    },
  ): Promise<PaginatedResult<Student>> {
    const qb = this.studentRepo.createQueryBuilder('student')
      .leftJoinAndSelect('student.user', 'user')
      .leftJoinAndSelect('student.class', 'class')
      .leftJoinAndSelect('student.academicYear', 'year')
      .where('student.deleted_at IS NULL');

    if (filters?.academicYearId) qb.andWhere('student.academic_year_id = :ay', { ay: filters.academicYearId });
    if (filters?.classId) qb.andWhere('student.class_id = :classId', { classId: filters.classId });
    if (filters?.admissionStatus) qb.andWhere('student.admission_status = :status', { status: filters.admissionStatus });
    if (filters?.isActive !== undefined) qb.andWhere('student.is_active = :active', { active: filters.isActive });

    if (pagination.search) {
      qb.andWhere(
        `(user.first_name ILIKE :q OR user.last_name ILIKE :q OR user.email ILIKE :q
          OR student.registration_number ILIKE :q OR student.roll_number ILIKE :q)`,
        { q: `%${pagination.search}%` },
      );
    }

    qb.orderBy('student.createdAt', 'DESC').skip(pagination.skip).take(pagination.limit);
    const [data, total] = await qb.getManyAndCount();
    return new PaginatedResult(data, total, pagination.page, pagination.limit);
  }

  async findOne(id: string): Promise<Student> {
    const s = await this.studentRepo.findOne({
      where: { id },
      relations: ['user', 'class', 'academicYear'],
    });
    if (!s) throw new NotFoundException(`Student #${id} not found`);
    return s;
  }

  async findByUserId(userId: string): Promise<Student> {
    const s = await this.studentRepo.findOne({
      where: { userId },
      relations: ['user', 'class', 'academicYear'],
    });
    if (!s) throw new NotFoundException('Student profile not found');
    return s;
  }

  async findByRegistrationNumber(regNo: string): Promise<Student> {
    const s = await this.studentRepo.findOne({
      where: { registrationNumber: regNo },
      relations: ['user', 'class', 'academicYear'],
    });
    if (!s) throw new NotFoundException(`Student with registration number '${regNo}' not found`);
    return s;
  }

  async update(id: string, dto: UpdateStudentDto): Promise<Student> {
    return this.dataSource.transaction(async (manager) => {
      const student = await this.findOne(id);

      // Update user fields if provided
      if (dto.firstName || dto.lastName || dto.email || dto.phone || dto.address) {
        await manager.update(User, student.userId, {
          firstName: dto.firstName,
          lastName: dto.lastName,
          email: dto.email,
          phone: dto.phone,
          address: dto.address,
          gender: dto.gender,
        });
      }

      // Update student fields
      const { firstName, lastName, email, phone, password, gender, dateOfBirth, address, ...studentFields } = dto;
      Object.assign(student, studentFields);
      return manager.save(Student, student);
    });
  }

  async assignClass(id: string, dto: AssignClassDto): Promise<Student> {
    const student = await this.findOne(id);
    student.classId = dto.classId;
    if (dto.rollNumber) student.rollNumber = dto.rollNumber;
    return this.studentRepo.save(student);
  }

  async toggleActive(id: string): Promise<Student> {
    const student = await this.findOne(id);
    student.isActive = !student.isActive;
    return this.studentRepo.save(student);
  }

  async getSiblings(studentId: string): Promise<Student[]> {
    const student = await this.findOne(studentId);
    if (!student.fatherPhone && !student.motherPhone) return [];
    return this.studentRepo.createQueryBuilder('s')
      .leftJoinAndSelect('s.user', 'user')
      .where('s.id != :id', { id: studentId })
      .andWhere('(s.father_phone = :fp OR s.mother_phone = :mp)', {
        fp: student.fatherPhone, mp: student.motherPhone,
      })
      .andWhere('s.is_active = true')
      .getMany();
  }

  async getDefaulters(academicYearId: string): Promise<any[]> {
    return this.studentRepo.createQueryBuilder('student')
      .leftJoinAndSelect('student.user', 'user')
      .leftJoinAndSelect('student.class', 'class')
      .innerJoin(
        'fee_invoices', 'invoice',
        `invoice.student_id = student.id 
         AND invoice.academic_year_id = :ayId 
         AND invoice.status IN ('issued','overdue','partially_paid')
         AND invoice.balance_amount > 0`,
        { ayId: academicYearId },
      )
      .select([
        'student.id', 'student.registrationNumber',
        'user.firstName', 'user.lastName', 'user.email',
        'class.name', 'class.grade',
      ])
      .addSelect('SUM(invoice.balance_amount)', 'totalDue')
      .addSelect('COUNT(invoice.id)', 'invoiceCount')
      .groupBy('student.id, student.registrationNumber, user.firstName, user.lastName, user.email, class.name, class.grade')
      .having('SUM(invoice.balance_amount) > 0')
      .orderBy('totalDue', 'DESC')
      .getRawMany();
  }

  async getTotalCount(academicYearId?: string): Promise<number> {
    const qb = this.studentRepo.createQueryBuilder('s').where('s.is_active = true');
    if (academicYearId) qb.andWhere('s.academic_year_id = :ayId', { ayId: academicYearId });
    return qb.getCount();
  }
}
