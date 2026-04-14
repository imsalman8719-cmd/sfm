import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Student } from './entities/student.entity';
import { User } from '../users/entities/user.entity';
import { StudentsService } from './students.service';
import { StudentsController } from './students.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Student, User])],
  providers: [StudentsService],
  controllers: [StudentsController],
  exports: [StudentsService, TypeOrmModule],
})
export class StudentsModule {}
