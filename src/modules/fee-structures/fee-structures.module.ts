import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeeStructure } from './entities/fee-structure.entity';
import { Discount } from './entities/discount.entity';
import { FeeStructuresService } from './fee-structures.service';
import { FeeStructuresController } from './fee-structures.controller';

@Module({
  imports: [TypeOrmModule.forFeature([FeeStructure, Discount])],
  providers: [FeeStructuresService],
  controllers: [FeeStructuresController],
  exports: [FeeStructuresService],
})
export class FeeStructuresModule {}
