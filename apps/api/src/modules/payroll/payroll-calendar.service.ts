import { Injectable, Logger } from '@nestjs/common';

import { SettingsService } from '../configuration/settings.service';
import { PrismaService } from '../prisma/prisma.service';

export interface PayDateInfo {
  year: number;
  month: number;
  month_label: string;
  pay_date: string;
  preparation_deadline: string;
}

@Injectable()
export class PayrollCalendarService {
  private readonly logger = new Logger(PayrollCalendarService.name);

  private readonly MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
  ) {}

  async getPayrollCalendar(tenantId: string, year?: number): Promise<{
    pay_dates: PayDateInfo[];
    pay_day: number;
    preparation_lead_days: number;
  }> {
    const { payDay, leadDays } = await this.getPayrollSettings(tenantId);
    const targetYear = year ?? new Date().getFullYear();

    const payDates: PayDateInfo[] = [];

    for (let month = 1; month <= 12; month++) {
      const payDate = this.computePayDate(targetYear, month, payDay);
      const prepDeadline = this.subtractDays(payDate, leadDays);

      payDates.push({
        year: targetYear,
        month,
        month_label: this.MONTH_NAMES[month - 1] ?? '',
        pay_date: payDate,
        preparation_deadline: prepDeadline,
      });
    }

    return {
      pay_dates: payDates,
      pay_day: payDay,
      preparation_lead_days: leadDays,
    };
  }

  async getNextPayDate(tenantId: string): Promise<{
    next_pay_date: string;
    days_until_pay: number;
    preparation_deadline: string;
    days_until_preparation_deadline: number;
    current_month: number;
    current_year: number;
  }> {
    const { payDay, leadDays } = await this.getPayrollSettings(tenantId);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const currentPayDate = this.computePayDate(
      today.getFullYear(),
      today.getMonth() + 1,
      payDay,
    );

    let nextPayDateStr: string;
    let targetMonth: number;
    let targetYear: number;

    const currentPayDateObj = new Date(currentPayDate);

    if (today <= currentPayDateObj) {
      // This month's pay date is upcoming or today
      nextPayDateStr = currentPayDate;
      targetMonth = today.getMonth() + 1;
      targetYear = today.getFullYear();
    } else {
      // Advance to next month
      let nm = today.getMonth() + 2;
      let ny = today.getFullYear();
      if (nm > 12) {
        nm = 1;
        ny++;
      }
      nextPayDateStr = this.computePayDate(ny, nm, payDay);
      targetMonth = nm;
      targetYear = ny;
    }

    const nextPayDateObj = new Date(nextPayDateStr);
    const daysUntilPay = Math.ceil(
      (nextPayDateObj.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );

    const prepDeadline = this.subtractDays(nextPayDateStr, leadDays);
    const prepDeadlineObj = new Date(prepDeadline);
    const daysUntilPrep = Math.ceil(
      (prepDeadlineObj.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );

    return {
      next_pay_date: nextPayDateStr,
      days_until_pay: daysUntilPay,
      preparation_deadline: prepDeadline,
      days_until_preparation_deadline: Math.max(0, daysUntilPrep),
      current_month: targetMonth,
      current_year: targetYear,
    };
  }

  async checkPreparationDeadline(tenantId: string): Promise<{
    is_past_deadline: boolean;
    preparation_deadline: string;
    next_pay_date: string;
    days_overdue: number;
  }> {
    const nextPayInfo = await this.getNextPayDate(tenantId);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const deadline = new Date(nextPayInfo.preparation_deadline);
    const isPast = today > deadline;
    const daysOverdue = isPast
      ? Math.ceil((today.getTime() - deadline.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    return {
      is_past_deadline: isPast,
      preparation_deadline: nextPayInfo.preparation_deadline,
      next_pay_date: nextPayInfo.next_pay_date,
      days_overdue: daysOverdue,
    };
  }

  private async getPayrollSettings(tenantId: string): Promise<{
    payDay: number;
    leadDays: number;
  }> {
    let payDay = 25;
    let leadDays = 5;

    try {
      const settings = await this.settingsService.getSettings(tenantId);
      const payrollSettings = (settings as unknown as Record<string, Record<string, unknown>>)['payroll'];
      if (payrollSettings) {
        if (typeof payrollSettings['payDay'] === 'number') {
          payDay = payrollSettings['payDay'] as number;
        }
        if (typeof payrollSettings['payrollPreparationLeadDays'] === 'number') {
          leadDays = payrollSettings['payrollPreparationLeadDays'] as number;
        }
      }
    } catch {
      this.logger.warn(`Could not load payroll calendar settings for tenant ${tenantId}, using defaults`);
    }

    return { payDay, leadDays };
  }

  /**
   * Compute the pay date for a month, clamping to last day if needed.
   * E.g., pay_day=31 in February → Feb 28/29.
   */
  private computePayDate(year: number, month: number, payDay: number): string {
    const daysInMonth = new Date(year, month, 0).getDate();
    const actualDay = Math.min(payDay, daysInMonth);
    const d = new Date(year, month - 1, actualDay);
    return d.toISOString().split('T')[0] ?? '';
  }

  private subtractDays(dateStr: string, days: number): string {
    const d = new Date(dateStr);
    d.setDate(d.getDate() - days);
    return d.toISOString().split('T')[0] ?? '';
  }
}
