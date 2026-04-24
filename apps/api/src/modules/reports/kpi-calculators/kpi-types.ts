import type { PrismaClient } from '@prisma/client';

export interface KpiCalculatorResult {
  value: string | number;
  value_raw: number;
  delta: {
    value: number;
    unit: 'percent' | 'absolute';
    direction: 'up' | 'down' | 'flat';
    better_when: 'up' | 'down';
  } | null;
  sparkline: number[];
  severity: 'normal' | 'warning' | 'critical' | null;
}

export type PrismaTransaction = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use'
>;
