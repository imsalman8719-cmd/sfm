import {
  Injectable, NotFoundException, BadRequestException, ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { format } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';
import { Payment } from './entities/payment.entity';
import { FeeInvoice } from '../fee-invoices/entities/fee-invoice.entity';
import { CreatePaymentDto, RefundPaymentDto, PaymentFilterDto } from './dto/payment.dto';
import { PaginationDto, PaginatedResult } from '../../common/dto/pagination.dto';
import { PaymentStatus, InvoiceStatus } from '../../common/enums';
import { FeeInvoicesService } from '../fee-invoices/fee-invoices.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment) private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(FeeInvoice) private readonly invoiceRepo: Repository<FeeInvoice>,
    private readonly invoicesService: FeeInvoicesService,
    private readonly notificationsService: NotificationsService,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreatePaymentDto, collectedBy?: string): Promise<Payment> {
    return this.dataSource.transaction(async (manager) => {
      const invoice = await manager.findOne(FeeInvoice, {
        where: { id: dto.invoiceId },
        relations: ['student', 'student.user'],
      });
      if (!invoice) throw new NotFoundException('Invoice not found');
      if (invoice.status === InvoiceStatus.CANCELLED) throw new BadRequestException('Invoice is cancelled');
      if (invoice.status === InvoiceStatus.PAID) throw new ConflictException('Invoice is already fully paid');

      const balance = Number(invoice.balanceAmount);
      if (dto.amount > balance + 0.01) {
        throw new BadRequestException(
          `Payment amount (${dto.amount}) exceeds outstanding balance (${balance})`,
        );
      }

      const receiptNumber = this.generateReceiptNumber();

      const payment = manager.create(Payment, {
        receiptNumber,
        invoiceId: dto.invoiceId,
        studentId: invoice.studentId,
        amount: dto.amount,
        method: dto.method,
        status: PaymentStatus.COMPLETED,
        paymentDate: new Date(dto.paymentDate),
        transactionId: dto.transactionId,
        bankName: dto.bankName,
        chequeNumber: dto.chequeNumber,
        chequeDate: dto.chequeDate ? new Date(dto.chequeDate) : undefined,
        remarks: dto.remarks,
        collectedBy,
      });

      const savedPayment = await manager.save(Payment, payment);

      // Update invoice balance
      invoice.paidAmount = Number(invoice.paidAmount) + dto.amount;
      invoice.balanceAmount = Math.max(0, Number(invoice.balanceAmount) - dto.amount);

      if (invoice.balanceAmount <= 0.01) {
        invoice.status = InvoiceStatus.PAID;
        invoice.balanceAmount = 0;
      } else if (invoice.paidAmount > 0) {
        invoice.status = InvoiceStatus.PARTIALLY_PAID;
      }

      await manager.save(FeeInvoice, invoice);

      // Send receipt notification
      this.notificationsService.sendPaymentReceiptNotification(savedPayment, invoice, invoice.student).catch(() => {});

      return savedPayment;
    });
  }

  async findAll(pagination: PaginationDto, filters: PaymentFilterDto): Promise<PaginatedResult<Payment>> {
    const qb = this.paymentRepo.createQueryBuilder('p')
      .leftJoinAndSelect('p.invoice', 'inv')
      .leftJoinAndSelect('p.student', 's')
      .leftJoinAndSelect('s.user', 'u')
      .leftJoinAndSelect('s.class', 'cls');

    if (filters.studentId) qb.andWhere('p.student_id = :sid', { sid: filters.studentId });
    if (filters.invoiceId) qb.andWhere('p.invoice_id = :iid', { iid: filters.invoiceId });
    if (filters.method) qb.andWhere('p.method = :method', { method: filters.method });
    if (filters.fromDate) qb.andWhere('p.payment_date >= :from', { from: filters.fromDate });
    if (filters.toDate) qb.andWhere('p.payment_date <= :to', { to: filters.toDate });

    if (pagination.search) {
      qb.andWhere(
        '(p.receipt_number ILIKE :q OR u.first_name ILIKE :q OR u.last_name ILIKE :q OR s.registration_number ILIKE :q)',
        { q: `%${pagination.search}%` },
      );
    }

    qb.orderBy('p.payment_date', 'DESC').skip(pagination.skip).take(pagination.limit);
    const [data, total] = await qb.getManyAndCount();
    return new PaginatedResult(data, total, pagination.page, pagination.limit);
  }

  async findOne(id: string): Promise<Payment> {
    const p = await this.paymentRepo.findOne({
      where: { id },
      relations: ['invoice', 'student', 'student.user', 'student.class'],
    });
    if (!p) throw new NotFoundException(`Payment #${id} not found`);
    return p;
  }

  async findByReceiptNumber(receiptNumber: string): Promise<Payment> {
    const p = await this.paymentRepo.findOne({
      where: { receiptNumber },
      relations: ['invoice', 'student', 'student.user'],
    });
    if (!p) throw new NotFoundException(`Receipt ${receiptNumber} not found`);
    return p;
  }

  async refund(id: string, dto: RefundPaymentDto, refundedBy: string): Promise<Payment> {
    return this.dataSource.transaction(async (manager) => {
      const payment = await manager.findOne(Payment, { where: { id }, relations: ['invoice'] });
      if (!payment) throw new NotFoundException('Payment not found');
      if (payment.isRefunded) throw new ConflictException('Payment already refunded');
      if (dto.refundedAmount > Number(payment.amount)) {
        throw new BadRequestException('Refund amount cannot exceed original payment amount');
      }

      payment.isRefunded = true;
      payment.refundedAmount = dto.refundedAmount;
      payment.refundReason = dto.refundReason;
      payment.refundedAt = new Date();
      payment.refundedBy = refundedBy;
      payment.status = PaymentStatus.REFUNDED;
      await manager.save(Payment, payment);

      // Reverse the balance on the invoice
      const invoice = await manager.findOne(FeeInvoice, { where: { id: payment.invoiceId } });
      if (invoice) {
        invoice.paidAmount = Math.max(0, Number(invoice.paidAmount) - dto.refundedAmount);
        invoice.balanceAmount = Number(invoice.totalAmount) - Number(invoice.paidAmount) - Number(invoice.waivedAmount);
        if (invoice.balanceAmount > 0 && invoice.status === InvoiceStatus.PAID) {
          invoice.status = InvoiceStatus.PARTIALLY_PAID;
        }
        await manager.save(FeeInvoice, invoice);
      }

      return payment;
    });
  }

  async verify(id: string, verifiedBy: string): Promise<Payment> {
    const payment = await this.findOne(id);
    payment.verifiedBy = verifiedBy;
    payment.verifiedAt = new Date();
    return this.paymentRepo.save(payment);
  }

  async getDailySummary(date: string): Promise<any> {
    const result = await this.paymentRepo.createQueryBuilder('p')
      .select('p.method', 'method')
      .addSelect('SUM(p.amount)', 'total')
      .addSelect('COUNT(p.id)', 'count')
      .where('p.payment_date = :date', { date })
      .andWhere('p.status = :status', { status: PaymentStatus.COMPLETED })
      .groupBy('p.method')
      .getRawMany();

    const totalCollected = result.reduce((s, r) => s + parseFloat(r.total), 0);
    return { date, byMethod: result, totalCollected };
  }

  async getMonthlyCollection(year: number, month: number): Promise<number> {
    const result = await this.paymentRepo.createQueryBuilder('p')
      .select('SUM(p.amount)', 'total')
      .where('EXTRACT(YEAR FROM p.payment_date) = :year', { year })
      .andWhere('EXTRACT(MONTH FROM p.payment_date) = :month', { month })
      .andWhere('p.status = :status', { status: PaymentStatus.COMPLETED })
      .getRawOne();
    return parseFloat(result?.total || '0');
  }

  private generateReceiptNumber(): string {
    const datePart = format(new Date(), 'yyyyMMdd');
    const rand = uuidv4().split('-')[0].toUpperCase();
    return `RCP-${datePart}-${rand}`;
  }
}
