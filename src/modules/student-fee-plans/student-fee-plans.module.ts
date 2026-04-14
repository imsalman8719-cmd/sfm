import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StudentFeePlan } from './entities/student-fee-plan.entity';
import { StudentFeePlansService } from './student-fee-plans.service';
import { StudentFeePlansController } from './student-fee-plans.controller';
import { StudentsModule } from '../students/students.module';

@Module({
  imports: [TypeOrmModule.forFeature([StudentFeePlan]), StudentsModule],
  providers: [StudentFeePlansService],
  controllers: [StudentFeePlansController],
  exports: [StudentFeePlansService],
})
export class StudentFeePlansModule {}
