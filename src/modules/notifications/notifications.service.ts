import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { NotificationLog } from './entities/notification-log.entity';
import { FeeInvoice } from '../fee-invoices/entities/fee-invoice.entity';
import { Payment } from '../payments/entities/payment.entity';
import { Student } from '../students/entities/student.entity';
import { NotificationType, NotificationEvent } from '../../common/enums';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private transporter: nodemailer.Transporter;

  constructor(
    @InjectRepository(NotificationLog)
    private readonly logRepo: Repository<NotificationLog>,
    private readonly configService: ConfigService,
  ) {
    this.transporter = nodemailer.createTransport({
      host: configService.get('mail.host'),
      port: configService.get('mail.port'),
      secure: false,
      auth: {
        user: configService.get('mail.user'),
        pass: configService.get('mail.password'),
      },
    });
  }

  async sendInvoiceNotification(invoice: FeeInvoice, student: Student): Promise<void> {
    const email = student.user?.email || student.fatherEmail;
    if (!email) return;

    const subject = `Fee Invoice Generated – ${invoice.invoiceNumber}`;
    const body = this.buildInvoiceEmailBody(invoice, student);

    await this.sendEmail(email, subject, body, {
      recipientId: student.userId,
      event: NotificationEvent.INVOICE_GENERATED,
      referenceId: invoice.id,
      referenceType: 'invoice',
    });
  }

  async sendPaymentReceiptNotification(payment: Payment, invoice: FeeInvoice, student: Student): Promise<void> {
    const email = student.user?.email || student.fatherEmail;
    if (!email) return;

    const subject = `Payment Receipt – ${payment.receiptNumber}`;
    const body = this.buildReceiptEmailBody(payment, invoice, student);

    await this.sendEmail(email, subject, body, {
      recipientId: student.userId,
      event: NotificationEvent.PAYMENT_RECEIVED,
      referenceId: payment.id,
      referenceType: 'payment',
    });
  }

  async sendOverdueNotification(invoice: FeeInvoice, student: Student): Promise<void> {
    const email = student.user?.email || student.fatherEmail;
    if (!email) return;

    const subject = `OVERDUE: Fee Invoice ${invoice.invoiceNumber} – Action Required`;
    const body = this.buildOverdueEmailBody(invoice, student);

    await this.sendEmail(email, subject, body, {
      recipientId: student.userId,
      event: NotificationEvent.PAYMENT_OVERDUE,
      referenceId: invoice.id,
      referenceType: 'invoice',
    });
  }

  async sendReminderNotification(invoice: FeeInvoice, student: Student): Promise<void> {
    const email = student.user?.email || student.fatherEmail;
    if (!email) return;

    const subject = `Payment Reminder – Invoice ${invoice.invoiceNumber} due soon`;
    const body = this.buildReminderEmailBody(invoice, student);

    await this.sendEmail(email, subject, body, {
      recipientId: student.userId,
      event: NotificationEvent.REMINDER_SENT,
      referenceId: invoice.id,
      referenceType: 'invoice',
    });
  }

  async sendPasswordResetEmail(email: string, resetToken: string): Promise<void> {
    const frontendUrl = this.configService.get('app.frontendUrl');
    const subject = 'Password Reset Request';
    const body = `
      <h2>Password Reset</h2>
      <p>You requested a password reset. Click the link below to reset your password:</p>
      <a href="${frontendUrl}/reset-password?token=${resetToken}" style="padding:12px 24px;background:#007bff;color:#fff;border-radius:4px;text-decoration:none;">Reset Password</a>
      <p>This link expires in 1 hour. If you did not request this, please ignore this email.</p>
    `;
    await this.sendEmail(email, subject, body, {
      event: NotificationEvent.PASSWORD_RESET,
      referenceType: 'auth',
    });
  }

  async findLogs(filters?: { recipientId?: string; event?: NotificationEvent }): Promise<NotificationLog[]> {
    const qb = this.logRepo.createQueryBuilder('log').orderBy('log.created_at', 'DESC');
    if (filters?.recipientId) qb.andWhere('log.recipient_id = :rid', { rid: filters.recipientId });
    if (filters?.event) qb.andWhere('log.event = :event', { event: filters.event });
    return qb.take(100).getMany();
  }

  // ── Private Helpers ─────────────────────────────────────────────────────────

  private async sendEmail(
    to: string,
    subject: string,
    html: string,
    meta: Partial<NotificationLog>,
  ): Promise<void> {
    const log = this.logRepo.create({
      recipientEmail: to,
      type: NotificationType.EMAIL,
      subject,
      body: html,
      isSent: false,
      ...meta,
    });

    try {
      await this.transporter.sendMail({
        from: this.configService.get('mail.from'),
        to,
        subject,
        html,
      });
      log.isSent = true;
      log.sentAt = new Date();
    } catch (err) {
      log.errorMessage = err.message;
      this.logger.error(`Email send failed to ${to}: ${err.message}`);
    } finally {
      await this.logRepo.save(log).catch(() => {});
    }
  }

  private buildInvoiceEmailBody(invoice: FeeInvoice, student: Student): string {
    return `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden">
        <div style="background:#1a3c5e;color:#fff;padding:24px">
          <h2 style="margin:0">Fee Invoice – ${invoice.invoiceNumber}</h2>
        </div>
        <div style="padding:24px">
          <p>Dear ${student.user?.firstName} ${student.user?.lastName},</p>
          <p>A new fee invoice has been generated for your account.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0">
            <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Invoice No</td><td style="padding:8px;border:1px solid #ddd">${invoice.invoiceNumber}</td></tr>
            <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Billing Period</td><td style="padding:8px;border:1px solid #ddd">${invoice.billingLabel || '-'}</td></tr>
            <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Total Amount</td><td style="padding:8px;border:1px solid #ddd"><strong>PKR ${Number(invoice.totalAmount).toLocaleString()}</strong></td></tr>
            <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Due Date</td><td style="padding:8px;border:1px solid #ddd;color:#e53e3e">${new Date(invoice.dueDate).toDateString()}</td></tr>
          </table>
          <p>Please make payment before the due date to avoid late fee charges.</p>
        </div>
        <div style="background:#f5f5f5;padding:16px;text-align:center;font-size:12px;color:#666">School Finance Management System</div>
      </div>
    `;
  }

  private buildReceiptEmailBody(payment: Payment, invoice: FeeInvoice, student: Student): string {
    return `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden">
        <div style="background:#276749;color:#fff;padding:24px">
          <h2 style="margin:0">✓ Payment Receipt – ${payment.receiptNumber}</h2>
        </div>
        <div style="padding:24px">
          <p>Dear ${student.user?.firstName} ${student.user?.lastName},</p>
          <p>Your payment has been successfully recorded. Thank you!</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0">
            <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Receipt No</td><td style="padding:8px;border:1px solid #ddd">${payment.receiptNumber}</td></tr>
            <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Invoice No</td><td style="padding:8px;border:1px solid #ddd">${invoice.invoiceNumber}</td></tr>
            <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Amount Paid</td><td style="padding:8px;border:1px solid #ddd;color:#276749"><strong>PKR ${Number(payment.amount).toLocaleString()}</strong></td></tr>
            <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Payment Method</td><td style="padding:8px;border:1px solid #ddd">${payment.method.toUpperCase()}</td></tr>
            <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Date</td><td style="padding:8px;border:1px solid #ddd">${new Date(payment.paymentDate).toDateString()}</td></tr>
            <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Remaining Balance</td><td style="padding:8px;border:1px solid #ddd">${Number(invoice.balanceAmount) > 0 ? `PKR ${Number(invoice.balanceAmount).toLocaleString()}` : 'FULLY PAID ✓'}</td></tr>
          </table>
        </div>
        <div style="background:#f5f5f5;padding:16px;text-align:center;font-size:12px;color:#666">School Finance Management System</div>
      </div>
    `;
  }

  private buildOverdueEmailBody(invoice: FeeInvoice, student: Student): string {
    return `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden">
        <div style="background:#c53030;color:#fff;padding:24px">
          <h2 style="margin:0">⚠ Overdue Fee Notice</h2>
        </div>
        <div style="padding:24px">
          <p>Dear ${student.user?.firstName} ${student.user?.lastName},</p>
          <p>Your fee invoice <strong>${invoice.invoiceNumber}</strong> is now overdue. Please make the payment immediately to avoid any academic consequences.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0">
            <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Invoice No</td><td style="padding:8px;border:1px solid #ddd">${invoice.invoiceNumber}</td></tr>
            <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Outstanding Balance</td><td style="padding:8px;border:1px solid #ddd;color:#c53030"><strong>PKR ${Number(invoice.balanceAmount).toLocaleString()}</strong></td></tr>
            <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Due Date (Passed)</td><td style="padding:8px;border:1px solid #ddd">${new Date(invoice.dueDate).toDateString()}</td></tr>
          </table>
          <p>Please contact the finance office immediately.</p>
        </div>
        <div style="background:#f5f5f5;padding:16px;text-align:center;font-size:12px;color:#666">School Finance Management System</div>
      </div>
    `;
  }

  private buildReminderEmailBody(invoice: FeeInvoice, student: Student): string {
    return `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden">
        <div style="background:#d69e2e;color:#fff;padding:24px">
          <h2 style="margin:0">Payment Reminder</h2>
        </div>
        <div style="padding:24px">
          <p>Dear ${student.user?.firstName} ${student.user?.lastName},</p>
          <p>This is a friendly reminder that your fee invoice is due soon.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0">
            <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Invoice No</td><td style="padding:8px;border:1px solid #ddd">${invoice.invoiceNumber}</td></tr>
            <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Outstanding</td><td style="padding:8px;border:1px solid #ddd"><strong>PKR ${Number(invoice.balanceAmount).toLocaleString()}</strong></td></tr>
            <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Due Date</td><td style="padding:8px;border:1px solid #ddd">${new Date(invoice.dueDate).toDateString()}</td></tr>
          </table>
        </div>
        <div style="background:#f5f5f5;padding:16px;text-align:center;font-size:12px;color:#666">School Finance Management System</div>
      </div>
    `;
  }
}
