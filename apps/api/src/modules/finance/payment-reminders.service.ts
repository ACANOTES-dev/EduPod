import { Injectable, Logger } from '@nestjs/common';

import { SettingsService } from '../configuration/settings.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PaymentRemindersService {
  private readonly logger = new Logger(PaymentRemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
  ) {}

  /**
   * Send "due soon" reminders for invoices due within the configured window.
   * Deduplication: only sends once per invoice per reminder type.
   */
  async sendDueSoonReminders(tenantId: string): Promise<number> {
    const settings = await this.settingsService.getSettings(tenantId);
    if (!settings.finance.paymentReminderEnabled) return 0;

    const dueSoonDays = settings.finance.dueSoonReminderDays ?? 3;
    const channel = settings.finance.reminderChannel ?? 'email';

    const now = new Date();
    const cutoffDate = new Date(now);
    cutoffDate.setDate(cutoffDate.getDate() + dueSoonDays);

    // Find issued invoices due within the window
    const invoices = await this.prisma.invoice.findMany({
      where: {
        tenant_id: tenantId,
        status: { in: ['issued', 'partially_paid'] },
        due_date: { gte: now, lte: cutoffDate },
      },
      include: {
        household: {
          select: { id: true, household_name: true, primary_billing_parent_id: true },
        },
        reminders: {
          where: { reminder_type: 'due_soon' },
        },
      },
    });

    let sent = 0;
    for (const invoice of invoices) {
      // Deduplication check
      if (invoice.reminders.length > 0) continue;

      await this.dispatchReminder(tenantId, invoice.id, 'due_soon', channel);
      sent++;
    }

    return sent;
  }

  /**
   * Send "overdue" reminders for invoices past their due date not yet reminded.
   */
  async sendOverdueReminders(tenantId: string): Promise<number> {
    const settings = await this.settingsService.getSettings(tenantId);
    if (!settings.finance.paymentReminderEnabled) return 0;

    const channel = settings.finance.reminderChannel ?? 'email';
    const finalNoticeDays = settings.finance.finalNoticeAfterDays ?? 14;
    const now = new Date();

    // Find overdue invoices (past due, not yet in final notice window)
    const finalNoticeCutoff = new Date(now);
    finalNoticeCutoff.setDate(finalNoticeCutoff.getDate() - finalNoticeDays);

    const invoices = await this.prisma.invoice.findMany({
      where: {
        tenant_id: tenantId,
        status: { in: ['overdue', 'issued', 'partially_paid'] },
        due_date: { lt: now, gt: finalNoticeCutoff },
      },
      include: {
        reminders: {
          where: { reminder_type: 'overdue' },
        },
      },
    });

    let sent = 0;
    for (const invoice of invoices) {
      if (invoice.reminders.length > 0) continue;

      await this.dispatchReminder(tenantId, invoice.id, 'overdue', channel);
      sent++;
    }

    return sent;
  }

  /**
   * Send "final notice" reminders for invoices overdue beyond the configured threshold.
   */
  async sendFinalNotices(tenantId: string): Promise<number> {
    const settings = await this.settingsService.getSettings(tenantId);
    if (!settings.finance.paymentReminderEnabled) return 0;

    const channel = settings.finance.reminderChannel ?? 'email';
    const finalNoticeDays = settings.finance.finalNoticeAfterDays ?? 14;
    const now = new Date();

    const cutoffDate = new Date(now);
    cutoffDate.setDate(cutoffDate.getDate() - finalNoticeDays);

    const invoices = await this.prisma.invoice.findMany({
      where: {
        tenant_id: tenantId,
        status: { in: ['overdue', 'partially_paid'] },
        due_date: { lt: cutoffDate },
      },
      include: {
        reminders: {
          where: { reminder_type: 'final_notice' },
        },
      },
    });

    let sent = 0;
    for (const invoice of invoices) {
      if (invoice.reminders.length > 0) continue;

      await this.dispatchReminder(tenantId, invoice.id, 'final_notice', channel);
      sent++;
    }

    return sent;
  }

  /**
   * Record the reminder and dispatch through the appropriate channel.
   * In practice this would call the notifications service or queue a job.
   */
  private async dispatchReminder(
    tenantId: string,
    invoiceId: string,
    reminderType: string,
    channel: string,
  ): Promise<void> {
    try {
      // Determine channel values for deduplication record
      const channelValues = channel === 'both' ? ['email', 'whatsapp'] : [channel];

      for (const ch of channelValues) {
        await this.prisma.invoiceReminder.create({
          data: {
            tenant_id: tenantId,
            invoice_id: invoiceId,
            reminder_type: reminderType as never,
            channel: ch as never,
            sent_at: new Date(),
          },
        });
      }

      this.logger.log(`Reminder dispatched: invoice=${invoiceId} type=${reminderType} channel=${channel}`);
    } catch (error: unknown) {
      this.logger.error(`Failed to dispatch reminder for invoice ${invoiceId}`, error);
    }
  }

  /**
   * Get reminders sent for a specific invoice.
   */
  async getRemindersForInvoice(tenantId: string, invoiceId: string) {
    return this.prisma.invoiceReminder.findMany({
      where: { tenant_id: tenantId, invoice_id: invoiceId },
      orderBy: { sent_at: 'desc' },
    });
  }
}
