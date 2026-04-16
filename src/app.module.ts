import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD, APP_FILTER } from '@nestjs/core';

import { appConfig, dbConfig, jwtConfig, mailConfig, feeConfig } from './config';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

// Entities
import { User } from './modules/users/entities/user.entity';
import { AcademicYear } from './modules/academic-years/entities/academic-year.entity';
import { Class } from './modules/classes/entities/class.entity';
import { Student } from './modules/students/entities/student.entity';
import { FeeStructure } from './modules/fee-structures/entities/fee-structure.entity';
import { Discount } from './modules/fee-structures/entities/discount.entity';
import { FeeInvoice } from './modules/fee-invoices/entities/fee-invoice.entity';
import { FeeWaiver } from './modules/fee-invoices/entities/fee-waiver.entity';
import { Payment } from './modules/payments/entities/payment.entity';
import { NotificationLog } from './modules/notifications/entities/notification-log.entity';
import { GlobalSettings } from './modules/settings/entities/global-settings.entity';

// Feature Modules
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { AcademicYearsModule } from './modules/academic-years/academic-years.module';
import { ClassesModule } from './modules/classes/classes.module';
import { StudentsModule } from './modules/students/students.module';
import { FeeStructuresModule } from './modules/fee-structures/fee-structures.module';
import { FeeInvoicesModule } from './modules/fee-invoices/fee-invoices.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ReportsModule } from './modules/reports/reports.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { SettingsModule } from './modules/settings/settings.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, dbConfig, jwtConfig, mailConfig, feeConfig],
      envFilePath: ['.env.local', '.env'],
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [{
        ttl: config.get<number>('THROTTLE_TTL', 60) * 1000,
        limit: config.get<number>('THROTTLE_LIMIT', 100),
      }],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('database.host'),
        port: config.get('database.port'),
        username: config.get('database.username'),
        password: config.get('database.password'),
        database: config.get('database.name'),
        entities: [
          User, AcademicYear, Class, Student,
          FeeStructure, Discount, FeeInvoice, FeeWaiver,
          Payment, NotificationLog, GlobalSettings,
        ],
        synchronize: config.get('database.sync'),
        logging: config.get('database.logging'),
        migrations: ['dist/database/migrations/*.js'],
      }),
    }),
    AuthModule, UsersModule, AcademicYearsModule, ClassesModule,
    StudentsModule, FeeStructuresModule, FeeInvoicesModule,
    PaymentsModule, ReportsModule, NotificationsModule,
    SettingsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
})
export class AppModule {}
