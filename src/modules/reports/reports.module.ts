import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeeInvoice } from '../fee-invoices/entities/fee-invoice.entity';
import { Payment } from '../payments/entities/payment.entity';
import { Student } from '../students/entities/student.entity';
import { AcademicYear } from '../academic-years/entities/academic-year.entity';
import { Class } from '../classes/entities/class.entity';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([FeeInvoice, Payment, Student, AcademicYear, Class]),
  ],
  providers: [ReportsService],
  controllers: [ReportsController],
  exports: [ReportsService],
})
export class ReportsModule {}
