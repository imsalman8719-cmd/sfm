import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment } from './entities/payment.entity';
import { FeeInvoice } from '../fee-invoices/entities/fee-invoice.entity';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { FeeInvoicesModule } from '../fee-invoices/fee-invoices.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, FeeInvoice]),
    FeeInvoicesModule,
    NotificationsModule,
  ],
  providers: [PaymentsService],
  controllers: [PaymentsController],
  exports: [PaymentsService],
})
export class PaymentsModule {}
