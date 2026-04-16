import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
dotenv.config();

import { User } from '../modules/users/entities/user.entity';
import { AcademicYear } from '../modules/academic-years/entities/academic-year.entity';
import { Class } from '../modules/classes/entities/class.entity';
import { Student } from '../modules/students/entities/student.entity';
import { FeeStructure } from '../modules/fee-structures/entities/fee-structure.entity';
import { Discount } from '../modules/fee-structures/entities/discount.entity';
import { FeeInvoice } from '../modules/fee-invoices/entities/fee-invoice.entity';
import { FeeWaiver } from '../modules/fee-invoices/entities/fee-waiver.entity';
import { Payment } from '../modules/payments/entities/payment.entity';
import { NotificationLog } from '../modules/notifications/entities/notification-log.entity';
import { GlobalSettings } from '../modules/settings/entities/global-settings.entity';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'school_fee_management',
  entities: [
    User, AcademicYear, Class, Student,
    FeeStructure, Discount, FeeInvoice, FeeWaiver,
    Payment, NotificationLog, GlobalSettings,
  ],
  migrations: ['src/database/migrations/*.ts'],
  synchronize: false,
  logging: process.env.DB_LOGGING === 'true',
});
