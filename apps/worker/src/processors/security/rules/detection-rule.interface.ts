import type { PrismaClient } from '@prisma/client';

// ─── Breach detection rule interface ──────────────────────────────────────────

export interface Violation {
  incident_type: string;
  severity: string;
  description: string;
  affected_tenants: string[];
  metadata: Record<string, unknown>;
}

export interface DetectionRule {
  name: string;
  evaluate(prisma: PrismaClient): Promise<Violation[]>;
}
