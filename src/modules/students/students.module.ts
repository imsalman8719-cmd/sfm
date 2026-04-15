import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Student } from './entities/student.entity';
import { User } from '../users/entities/user.entity';
import { StudentsService } from './students.service';
import { StudentsController } from './students.controller';
import { FeeInvoicesModule } from '../fee-invoices/fee-invoices.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Student, User]),
    forwardRef(() => FeeInvoicesModule),
  ],
  providers: [StudentsService],
  controllers: [StudentsController],
  exports: [StudentsService, TypeOrmModule],
})
export class StudentsModule {}
