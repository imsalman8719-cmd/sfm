import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeeInvoice } from './entities/fee-invoice.entity';
import { FeeWaiver } from './entities/fee-waiver.entity';
import { Student } from '../students/entities/student.entity';
import { FeeStructure } from '../fee-structures/entities/fee-structure.entity';
import { Discount } from '../fee-structures/entities/discount.entity';
import { StudentFeePlan } from '../student-fee-plans/entities/student-fee-plan.entity';
import { AcademicYear } from '../academic-years/entities/academic-year.entity';
import { GlobalSettings } from '../settings/entities/global-settings.entity';
import { FeeInvoicesService } from './fee-invoices.service';
import { FeeInvoicesController } from './fee-invoices.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FeeInvoice, FeeWaiver, Student, FeeStructure, Discount,
      StudentFeePlan, AcademicYear, GlobalSettings,
    ]),
    NotificationsModule,
  ],
  providers: [FeeInvoicesService],
  controllers: [FeeInvoicesController],
  exports: [FeeInvoicesService],
})
export class FeeInvoicesModule {}
