import { Injectable } from '@nestjs/common';

import type { LeaveTypeResponse } from '@school/shared';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LeaveTypesService {
  constructor(private readonly prisma: PrismaService) {}

  // Returns the effective leave-type catalogue for a tenant: tenant-specific
  // rows take precedence over same-code system rows.
  async list(tenantId: string): Promise<{ data: LeaveTypeResponse[] }> {
    const rows = await this.prisma.leaveType.findMany({
      where: {
        is_active: true,
        OR: [{ tenant_id: null }, { tenant_id: tenantId }],
      },
      orderBy: { display_order: 'asc' },
    });

    // Tenant overrides shadow system rows with the same code.
    const byCode = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      const existing = byCode.get(row.code);
      if (!existing || (existing.tenant_id === null && row.tenant_id !== null)) {
        byCode.set(row.code, row);
      }
    }

    const data: LeaveTypeResponse[] = Array.from(byCode.values())
      .sort((a, b) => a.display_order - b.display_order)
      .map((r) => ({
        id: r.id,
        code: r.code,
        label: r.label,
        requires_approval: r.requires_approval,
        is_paid_default: r.is_paid_default,
        max_days_per_request: r.max_days_per_request,
        requires_evidence: r.requires_evidence,
        display_order: r.display_order,
      }));

    return { data };
  }

  async findById(tenantId: string, id: string) {
    return this.prisma.leaveType.findFirst({
      where: { id, OR: [{ tenant_id: null }, { tenant_id: tenantId }] },
    });
  }
}
