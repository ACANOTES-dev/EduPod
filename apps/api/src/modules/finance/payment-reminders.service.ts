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
   * Record the reminder (dedup) AND enqueue an actual notification row for
   * each channel — the notifications worker picks these up on its next tick
   * (see `DispatchQueuedProcessor`, runs every 30 seconds).
   */
  private async dispatchReminder(
    tenantId: string,
    invoiceId: string,
    reminderType: 'due_soon' | 'overdue' | 'final_notice',
    channel: string,
  ): Promise<void> {
    try {
      const channelValues = channel === 'both' ? ['email', 'whatsapp'] : [channel];

      // Resolve recipient + invoice context once
      const invoice = await this.prisma.invoice.findFirst({
        where: { id: invoiceId, tenant_id: tenantId },
        select: {
          id: true,
          invoice_number: true,
          due_date: true,
          balance_amount: true,
          currency_code: true,
          household: {
            select: {
              household_name: true,
              billing_parent: { select: { user_id: true } },
            },
          },
        },
      });

      if (!invoice) {
        this.logger.warn(`dispatchReminder: invoice ${invoiceId} not found for tenant ${tenantId}`);
        return;
      }

      // Resolve the tenant's default locale for the notification. This is a
      // cross-module read; the dedicated TenantReadFacade path isn't available
      // to finance without a DI cycle (tenants depends on audit, audit on
      // finance for payroll). Keep it local, minimal select.
      // eslint-disable-next-line school/no-cross-module-prisma-access
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { default_locale: true },
      });
      const locale = tenant?.default_locale ?? 'en';
      const recipientUserId = invoice.household?.billing_parent?.user_id ?? null;

      const templateKey = `payment_reminder_${reminderType}`;
      const payload = {
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
        due_date: invoice.due_date.toISOString(),
        balance_amount: Number(invoice.balance_amount),
        currency_code: invoice.currency_code,
        household_name: invoice.household?.household_name ?? null,
        reminder_type: reminderType,
      };

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

        if (!recipientUserId) {
          this.logger.warn(
            `dispatchReminder: no billing parent user for invoice ${invoiceId} — dedup row written, notification skipped`,
          );
          continue;
        }

        // Writing into the shared notifications table so DispatchQueuedProcessor
        // picks it up. Using the service wrapper (NotificationsService.createBatch)
        // would require a finance->communications module import and causes a
        // circular dependency via the audit interceptor. Keeping direct access
        // for this single write path.
        // eslint-disable-next-line school/no-cross-module-prisma-access
        await this.prisma.notification.create({
          data: {
            tenant_id: tenantId,
            recipient_user_id: recipientUserId,
            channel: ch as never,
            template_key: templateKey,
            locale,
            status: 'queued',
            payload_json: payload,
            source_entity_type: 'invoice',
            source_entity_id: invoiceId,
            idempotency_key: `invoice-reminder:${invoiceId}:${reminderType}:${ch}`,
          },
        });
      }

      this.logger.log(
        `Reminder dispatched: invoice=${invoiceId} type=${reminderType} channel=${channel} recipient=${recipientUserId ?? 'none'}`,
      );
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
