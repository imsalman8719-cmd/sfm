import { AppDataSource } from '../data-source';
import { User } from '../../modules/users/entities/user.entity';
import { AcademicYear } from '../../modules/academic-years/entities/academic-year.entity';
import { Class } from '../../modules/classes/entities/class.entity';
import { FeeStructure } from '../../modules/fee-structures/entities/fee-structure.entity';
import { UserRole, UserStatus, FeeCategory, FeeFrequency, DiscountType } from '../../common/enums';
import * as bcrypt from 'bcrypt';

async function seed() {
  await AppDataSource.initialize();
  console.log('🌱 Starting database seed...');

  const userRepo = AppDataSource.getRepository(User);
  const yearRepo = AppDataSource.getRepository(AcademicYear);
  const classRepo = AppDataSource.getRepository(Class);
  const feeRepo = AppDataSource.getRepository(FeeStructure);

  // ── 1. Super Admin ──────────────────────────────────────────────────────────
  let superAdmin = await userRepo.findOne({ where: { email: 'superadmin@school.edu' } });
  if (!superAdmin) {
    superAdmin = userRepo.create({
      firstName: 'Super',
      lastName: 'Admin',
      email: 'superadmin@school.edu',
      passwordHash: await bcrypt.hash('Admin@123456', 12),
      role: UserRole.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
      emailVerified: true,
      isFirstLogin: false,
      employeeId: 'EMP-SA-001',
    });
    await userRepo.save(superAdmin);
    console.log('✅ Super Admin created: superadmin@school.edu / Admin@123456');
  }

  // ── 2. Finance User ─────────────────────────────────────────────────────────
  let financeUser = await userRepo.findOne({ where: { email: 'finance@school.edu' } });
  if (!financeUser) {
    financeUser = userRepo.create({
      firstName: 'Finance',
      lastName: 'Manager',
      email: 'finance@school.edu',
      passwordHash: await bcrypt.hash('Finance@123', 12),
      role: UserRole.FINANCE,
      status: UserStatus.ACTIVE,
      emailVerified: true,
      isFirstLogin: false,
      employeeId: 'EMP-FIN-001',
      department: 'Finance',
    });
    await userRepo.save(financeUser);
    console.log('✅ Finance user created: finance@school.edu / Finance@123');
  }

  // ── 3. Admission User ───────────────────────────────────────────────────────
  let admissionUser = await userRepo.findOne({ where: { email: 'admission@school.edu' } });
  if (!admissionUser) {
    admissionUser = userRepo.create({
      firstName: 'Admission',
      lastName: 'Officer',
      email: 'admission@school.edu',
      passwordHash: await bcrypt.hash('Admission@123', 12),
      role: UserRole.ADMISSION,
      status: UserStatus.ACTIVE,
      emailVerified: true,
      isFirstLogin: false,
      employeeId: 'EMP-ADM-001',
      department: 'Admissions',
    });
    await userRepo.save(admissionUser);
    console.log('✅ Admission user created: admission@school.edu / Admission@123');
  }

  // ── 4. Academic Year ────────────────────────────────────────────────────────
  let academicYear = await yearRepo.findOne({ where: { name: '2024-2025' } });
  if (!academicYear) {
    academicYear = yearRepo.create({
      name: '2024-2025',
      startDate: new Date('2024-04-01'),
      endDate: new Date('2025-03-31'),
      isCurrent: true,
      feeTarget: 5000000,
      monthlyTargets: {
        '4': 420000, '5': 420000, '6': 420000,
        '7': 420000, '8': 420000, '9': 420000,
        '10': 420000, '11': 420000, '12': 420000,
        '1': 420000, '2': 420000, '3': 380000,
      },
      quarterlyTargets: {
        Q1: 1260000, Q2: 1260000, Q3: 1260000, Q4: 1220000,
      },
    });
    await yearRepo.save(academicYear);
    console.log('✅ Academic year 2024-2025 created');
  }

  // ── 5. Classes ──────────────────────────────────────────────────────────────
  const classData = [
    { name: 'Nursery A', grade: 'Nursery', section: 'A' },
    { name: 'KG A', grade: 'KG', section: 'A' },
    { name: 'Grade 1 - A', grade: '1', section: 'A' },
    { name: 'Grade 1 - B', grade: '1', section: 'B' },
    { name: 'Grade 5 - A', grade: '5', section: 'A' },
    { name: 'Grade 8 - A', grade: '8', section: 'A' },
    { name: 'Grade 10 - A', grade: '10', section: 'A' },
    { name: 'Grade 12 - A', grade: '12', section: 'A' },
  ];

  const savedClasses: Class[] = [];
  for (const cd of classData) {
    let cls = await classRepo.findOne({ where: { name: cd.name, academicYearId: academicYear.id } });
    if (!cls) {
      cls = classRepo.create({ ...cd, academicYearId: academicYear.id, maxCapacity: 35 });
      await classRepo.save(cls);
    }
    savedClasses.push(cls);
  }
  console.log(`✅ ${savedClasses.length} classes created`);

  // ── 6. Fee Structures ───────────────────────────────────────────────────────
  const feeStructures = [
    {
      name: 'Monthly Tuition Fee – Primary',
      category: FeeCategory.TUITION,
      frequency: FeeFrequency.MONTHLY,
      amount: 8500,
      isMandatory: true,
      lateFeeEnabled: true,
      lateFeeType: DiscountType.PERCENTAGE,
      lateFeeValue: 2,
      gracePeriodDays: 7,
      dueDayOfMonth: 10,
      sortOrder: 1,
    },
    {
      name: 'Monthly Tuition Fee – Secondary',
      category: FeeCategory.TUITION,
      frequency: FeeFrequency.MONTHLY,
      amount: 12000,
      isMandatory: true,
      lateFeeEnabled: true,
      lateFeeType: DiscountType.PERCENTAGE,
      lateFeeValue: 2,
      gracePeriodDays: 7,
      dueDayOfMonth: 10,
      sortOrder: 1,
    },
    {
      name: 'Annual Admission / Registration Fee',
      category: FeeCategory.ADMISSION,
      frequency: FeeFrequency.ONE_TIME,
      amount: 15000,
      isMandatory: true,
      lateFeeEnabled: false,
      sortOrder: 2,
    },
    {
      name: 'Annual Examination Fee',
      category: FeeCategory.EXAM,
      frequency: FeeFrequency.ANNUAL,
      amount: 5000,
      isMandatory: true,
      lateFeeEnabled: true,
      lateFeeType: DiscountType.FIXED,
      lateFeeValue: 500,
      gracePeriodDays: 5,
      sortOrder: 3,
    },
    {
      name: 'Library Fee',
      category: FeeCategory.LIBRARY,
      frequency: FeeFrequency.ANNUAL,
      amount: 2000,
      isMandatory: false,
      sortOrder: 4,
    },
    {
      name: 'Sports & Activities Fee',
      category: FeeCategory.SPORTS,
      frequency: FeeFrequency.SEMI_ANNUAL,
      amount: 3000,
      isMandatory: false,
      sortOrder: 5,
    },
    {
      name: 'Transport Fee (Monthly)',
      category: FeeCategory.TRANSPORT,
      frequency: FeeFrequency.MONTHLY,
      amount: 4000,
      isMandatory: false,
      sortOrder: 6,
    },
  ];

  for (const fs of feeStructures) {
    const existing = await feeRepo.findOne({ where: { name: fs.name, academicYearId: academicYear.id } });
    if (!existing) {
      await feeRepo.save(feeRepo.create({ ...fs, academicYearId: academicYear.id }));
    }
  }
  console.log(`✅ ${feeStructures.length} fee structures created`);

  console.log('\n🎉 Seed complete!\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Default Credentials:');
  console.log('  Super Admin : superadmin@school.edu / Admin@123456');
  console.log('  Finance     : finance@school.edu    / Finance@123');
  console.log('  Admission   : admission@school.edu  / Admission@123');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  await AppDataSource.destroy();
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
