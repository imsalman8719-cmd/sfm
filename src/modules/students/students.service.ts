import {
  Injectable, NotFoundException, ConflictException, Inject, forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Student } from './entities/student.entity';
import { User } from '../users/entities/user.entity';
import { CreateStudentDto, UpdateStudentDto, AssignClassDto } from './dto/student.dto';
import { PaginationDto, PaginatedResult } from '../../common/dto/pagination.dto';
import { UserRole, AdmissionStatus, FeeFrequency } from '../../common/enums';
import { FeeInvoicesService } from '../fee-invoices/fee-invoices.service';

@Injectable()
export class StudentsService {
  constructor(
    @InjectRepository(Student) private readonly studentRepo: Repository<Student>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly dataSource: DataSource,
    @Inject(forwardRef(() => FeeInvoicesService))
    private readonly feeInvoicesService: FeeInvoicesService,
  ) {}

  async create(dto: CreateStudentDto, createdBy?: string): Promise<Student> {
    // Step 1: Validate email uniqueness
    // const existingUser = await this.userRepo.findOne({ where: { email: dto.email } });
    // if (existingUser) throw new ConflictException('Email already in use');

    let savedStudent: Student;

    await this.dataSource.transaction(async (manager) => {
      // Step 2: Create user account
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

      // Step 3: Generate registration number
      const year = new Date().getFullYear();
      const seq = uuidv4().split('-')[0].toUpperCase();
      const registrationNumber = `STU-${year}-${seq}`;

      // Step 4: Create student profile with fee preferences
      const student = manager.create(Student, {
        userId: savedUser.id,
        registrationNumber,
        academicYearId: dto.academicYearId,
        classId: dto.classId,
        rollNumber: dto.rollNumber,
        admissionDate: dto.admissionDate ? new Date(dto.admissionDate) : new Date(),
        admissionStatus: dto.admissionStatus || AdmissionStatus.ADMITTED,
        billingFrequency: dto.billingFrequency || FeeFrequency.MONTHLY,
        selectedFeeStructureIds: dto.selectedFeeStructureIds || [],
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
        createdBy,
      });
      savedStudent = await manager.save(Student, student);
    });

    // Step 5: Generate full-year invoices OUTSIDE the transaction
    // so that a billing failure doesn't roll back the student creation.
    // Errors are logged but not thrown — the student is already enrolled.
    try {
      await this.feeInvoicesService.generateYearInvoices(savedStudent, createdBy);
    } catch (e) {
      console.error(`[StudentsService] Year-invoice generation failed for ${savedStudent.registrationNumber}: ${e.message}`);
    }

    // Return the fully loaded student
    return this.findOne(savedStudent.id);
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
    const idQb = this.studentRepo.createQueryBuilder('student')
      .select('student.id', 'id')
      .leftJoin('student.user', 'user')
      .where('student.deleted_at IS NULL');

    if (filters?.academicYearId) idQb.andWhere('student.academic_year_id = :ay', { ay: filters.academicYearId });
    if (filters?.classId) idQb.andWhere('student.class_id = :classId', { classId: filters.classId });
    if (filters?.admissionStatus) idQb.andWhere('student.admission_status = :status', { status: filters.admissionStatus });
    if (filters?.isActive !== undefined) idQb.andWhere('student.is_active = :active', { active: filters.isActive });

    if (pagination.search) {
      idQb.andWhere(
        `(user.first_name ILIKE :q OR user.last_name ILIKE :q OR user.email ILIKE :q
          OR student.registration_number ILIKE :q OR student.roll_number ILIKE :q)`,
        { q: `%${pagination.search}%` },
      );
    }

    const total = await idQb.getCount();
    const ids = await idQb
      .orderBy('student.created_at', 'DESC')
      .addOrderBy('student.id', 'ASC')
      .offset(pagination.skip)
      .limit(pagination.limit)
      .getRawMany()
      .then(rows => rows.map(r => r.id));

    const data = ids.length
      ? await this.studentRepo.find({ where: { id: In(ids) }, relations: ['user', 'class', 'academicYear'] })
      : [];

    const ordered = ids.map(id => data.find(s => s.id === id)).filter(Boolean) as Student[];
    return new PaginatedResult(ordered, total, pagination.page, pagination.limit);
  }

  async findOne(id: string): Promise<Student> {
    const s = await this.studentRepo.findOne({ where: { id }, relations: ['user', 'class', 'academicYear'] });
    if (!s) throw new NotFoundException(`Student #${id} not found`);
    return s;
  }

  async findByUserId(userId: string): Promise<Student> {
    const s = await this.studentRepo.findOne({ where: { userId }, relations: ['user', 'class', 'academicYear'] });
    if (!s) throw new NotFoundException('Student profile not found');
    return s;
  }

  async findByRegistrationNumber(regNo: string): Promise<Student> {
    const s = await this.studentRepo.findOne({ where: { registrationNumber: regNo }, relations: ['user', 'class', 'academicYear'] });
    if (!s) throw new NotFoundException(`Student '${regNo}' not found`);
    return s;
  }

  async update(id: string, dto: UpdateStudentDto): Promise<Student> {
    return this.dataSource.transaction(async (manager) => {
      const student = await this.findOne(id);

      // Update user fields if provided
      const userUpdate: any = {};
      if (dto.firstName !== undefined) userUpdate.firstName = dto.firstName;
      if (dto.lastName !== undefined) userUpdate.lastName = dto.lastName;
      if (dto.email !== undefined) userUpdate.email = dto.email;
      if (dto.phone !== undefined) userUpdate.phone = dto.phone;
      if (dto.address !== undefined) userUpdate.address = dto.address;
      if (dto.gender !== undefined) userUpdate.gender = dto.gender;
      if (Object.keys(userUpdate).length) {
        await manager.update(User, student.userId, userUpdate);
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
      .andWhere('(s.father_phone = :fp OR s.mother_phone = :mp)', { fp: student.fatherPhone, mp: student.motherPhone })
      .andWhere('s.is_active = true')
      .getMany();
  }

  async getTotalCount(academicYearId?: string): Promise<number> {
    const qb = this.studentRepo.createQueryBuilder('s').where('s.is_active = true');
    if (academicYearId) qb.andWhere('s.academic_year_id = :ayId', { ayId: academicYearId });
    return qb.getCount();
  }
}
