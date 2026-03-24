import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

export interface PayrollAnomaly {
  entry_id: string;
  staff_name: string;
  staff_profile_id: string;
  anomaly_type: string;
  description: string;
  severity: 'warning' | 'error';
}

@Injectable()
export class PayrollAnomalyService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Scan a payroll run for anomalies using rule-based detection.
   * Flags: missing data, zero classes for per-class staff, large pay swings,
   * duplicate entries, and entries exceeding working days.
   */
  async scanForAnomalies(
    tenantId: string,
    runId: string,
  ): Promise<{ run_id: string; anomaly_count: number; anomalies: PayrollAnomaly[] }> {
    const run = await this.prisma.payrollRun.findFirst({
      where: { id: runId, tenant_id: tenantId },
      include: {
        entries: {
          include: {
            staff_profile: {
              select: {
                id: true,
                user: { select: { first_name: true, last_name: true } },
              },
            },
          },
        },
      },
    });

    if (!run) {
      throw new NotFoundException({
        code: 'PAYROLL_RUN_NOT_FOUND',
        message: `Payroll run "${runId}" not found`,
      });
    }

    const anomalies: PayrollAnomaly[] = [];

    // Track seen staff to detect duplicates
    const seenStaff = new Set<string>();

    // Get previous run for month-over-month comparison
    const previousRun = await this.prisma.payrollRun.findFirst({
      where: {
        tenant_id: tenantId,
        status: 'finalised',
        OR: [
          { period_year: { lt: run.period_year } },
          {
            period_year: run.period_year,
            period_month: { lt: run.period_month },
          },
        ],
      },
      orderBy: [{ period_year: 'desc' }, { period_month: 'desc' }],
      include: {
        entries: {
          select: { staff_profile_id: true, total_pay: true },
        },
      },
    });

    const previousPayMap = new Map<string, number>();
    if (previousRun) {
      for (const e of previousRun.entries) {
        previousPayMap.set(e.staff_profile_id, Number(e.total_pay));
      }
    }

    for (const entry of run.entries) {
      const staffName = `${entry.staff_profile.user.first_name} ${entry.staff_profile.user.last_name}`;

      // Rule 1: Duplicate entries
      if (seenStaff.has(entry.staff_profile_id)) {
        anomalies.push({
          entry_id: entry.id,
          staff_name: staffName,
          staff_profile_id: entry.staff_profile_id,
          anomaly_type: 'DUPLICATE_ENTRY',
          description: `Duplicate payroll entry detected for ${staffName}`,
          severity: 'error',
        });
      }
      seenStaff.add(entry.staff_profile_id);

      // Rule 2: Per-class staff with 0 classes taught
      if (entry.compensation_type === 'per_class' && (entry.classes_taught === 0 || entry.classes_taught === null)) {
        anomalies.push({
          entry_id: entry.id,
          staff_name: staffName,
          staff_profile_id: entry.staff_profile_id,
          anomaly_type: 'ZERO_CLASSES',
          description: `Per-class staff ${staffName} has 0 classes taught`,
          severity: 'warning',
        });
      }

      // Rule 3: Days worked exceeding total working days
      if (
        entry.compensation_type === 'salaried' &&
        entry.days_worked !== null &&
        entry.days_worked > run.total_working_days
      ) {
        anomalies.push({
          entry_id: entry.id,
          staff_name: staffName,
          staff_profile_id: entry.staff_profile_id,
          anomaly_type: 'DAYS_EXCEED_WORKING_DAYS',
          description: `${staffName} has ${entry.days_worked} days worked, exceeding ${run.total_working_days} total working days`,
          severity: 'warning',
        });
      }

      // Rule 4: Pay >20% different from previous month
      const prevPay = previousPayMap.get(entry.staff_profile_id);
      if (prevPay && prevPay > 0) {
        const currentPay = entry.override_total_pay != null
          ? Number(entry.override_total_pay)
          : Number(entry.total_pay);
        const changePct = Math.abs((currentPay - prevPay) / prevPay) * 100;

        if (changePct >= 20) {
          anomalies.push({
            entry_id: entry.id,
            staff_name: staffName,
            staff_profile_id: entry.staff_profile_id,
            anomaly_type: 'LARGE_PAY_VARIANCE',
            description: `${staffName} pay changed ${changePct.toFixed(1)}% vs previous month (${prevPay.toFixed(2)} → ${currentPay.toFixed(2)})`,
            severity: 'warning',
          });
        }
      }

      // Rule 5: Missing days_worked for salaried
      if (entry.compensation_type === 'salaried' && entry.days_worked === null) {
        anomalies.push({
          entry_id: entry.id,
          staff_name: staffName,
          staff_profile_id: entry.staff_profile_id,
          anomaly_type: 'MISSING_DAYS_WORKED',
          description: `Salaried staff ${staffName} is missing days_worked value`,
          severity: 'error',
        });
      }

      // Rule 6: Staff with no compensation record (zero pay)
      if (Number(entry.basic_pay) === 0 && Number(entry.bonus_pay) === 0) {
        anomalies.push({
          entry_id: entry.id,
          staff_name: staffName,
          staff_profile_id: entry.staff_profile_id,
          anomaly_type: 'ZERO_PAY',
          description: `${staffName} has zero basic and bonus pay — check compensation configuration`,
          severity: 'warning',
        });
      }
    }

    return {
      run_id: runId,
      anomaly_count: anomalies.length,
      anomalies,
    };
  }
}
