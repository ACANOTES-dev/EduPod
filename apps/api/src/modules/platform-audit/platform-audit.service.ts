import { createHash } from 'crypto';

import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type PlatformAuditAction, type PlatformAuditLog } from '@prisma/client';

import type { PlatformAuditLogQuery } from '@school/shared';

import { PrismaService } from '../prisma/prisma.service';

export interface PlatformAuditContext {
  actor_user_id: string;
  ip_address?: string;
  user_agent?: string;
}

export interface PlatformAuditPayload {
  before?: unknown;
  after?: unknown;
  extra?: unknown;
}

export interface PlatformAuditLogInput extends PlatformAuditContext {
  action: PlatformAuditAction;
  target_resource_type: string;
  target_resource_id?: string;
  target_tenant_id?: string;
  payload: PlatformAuditPayload;
  reason?: string;
}

export type PlatformAuditLogRow = PlatformAuditLog & {
  actor: {
    email: string;
    first_name: string;
    last_name: string;
  };
};

const GENESIS_HASH = '0'.repeat(64);

@Injectable()
export class PlatformAuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Synchronously writes a platform audit row. Callers must let failures bubble
   * so platform mutations do not appear successful when audit persistence failed.
   */
  async log(input: PlatformAuditLogInput): Promise<PlatformAuditLog> {
    const createdAt = new Date();

    return this.prisma.$transaction(
      async (tx) => {
        const previous = await tx.platformAuditLog.findFirst({
          orderBy: { created_at: 'desc' },
          select: { row_hash: true },
        });
        const prevHash = previous?.row_hash ?? null;
        const rowHash = this.computeRowHash({
          ...input,
          created_at: createdAt.toISOString(),
          prev_hash: prevHash,
        });

        return tx.platformAuditLog.create({
          data: {
            actor_user_id: input.actor_user_id,
            action: input.action,
            target_resource_type: input.target_resource_type,
            target_resource_id: input.target_resource_id,
            target_tenant_id: input.target_tenant_id,
            payload: toJson(input.payload),
            reason: input.reason,
            ip_address: input.ip_address,
            user_agent: input.user_agent,
            prev_hash: prevHash,
            row_hash: rowHash,
            created_at: createdAt,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async list(query: PlatformAuditLogQuery): Promise<{
    data: PlatformAuditLogRow[];
    meta: { page: number; pageSize: number; total: number };
  }> {
    const where: Prisma.PlatformAuditLogWhereInput = {};
    if (query.actor_user_id) where.actor_user_id = query.actor_user_id;
    if (query.action) where.action = query.action;
    if (query.target_resource_type) where.target_resource_type = query.target_resource_type;
    if (query.target_tenant_id) where.target_tenant_id = query.target_tenant_id;
    if (query.start_date || query.end_date) {
      where.created_at = {
        ...(query.start_date ? { gte: query.start_date } : {}),
        ...(query.end_date ? { lte: query.end_date } : {}),
      };
    }

    const skip = (query.page - 1) * query.pageSize;
    const [data, total] = await Promise.all([
      this.prisma.platformAuditLog.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: query.pageSize,
        include: {
          actor: {
            select: { email: true, first_name: true, last_name: true },
          },
        },
      }),
      this.prisma.platformAuditLog.count({ where }),
    ]);

    return { data, meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  async get(id: string): Promise<PlatformAuditLogRow> {
    const row = await this.prisma.platformAuditLog.findUnique({
      where: { id },
      include: {
        actor: {
          select: { email: true, first_name: true, last_name: true },
        },
      },
    });
    if (!row) {
      throw new NotFoundException({
        code: 'PLATFORM_AUDIT_LOG_NOT_FOUND',
        message: `Platform audit log "${id}" not found`,
      });
    }
    return row;
  }

  async verifyChainIntegrity(): Promise<{ broken_at: string | null }> {
    const rows = await this.prisma.platformAuditLog.findMany({
      orderBy: { created_at: 'asc' },
    });
    let previousHash: string | null = null;

    for (const row of rows) {
      if (row.prev_hash !== previousHash) {
        return { broken_at: row.id };
      }
      const expected = this.computeRowHash({
        actor_user_id: row.actor_user_id,
        action: row.action,
        target_resource_type: row.target_resource_type,
        target_resource_id: row.target_resource_id ?? undefined,
        target_tenant_id: row.target_tenant_id ?? undefined,
        payload: row.payload,
        reason: row.reason ?? undefined,
        ip_address: row.ip_address ?? undefined,
        user_agent: row.user_agent ?? undefined,
        created_at: row.created_at.toISOString(),
        prev_hash: row.prev_hash,
      });
      if (expected !== row.row_hash) {
        return { broken_at: row.id };
      }
      previousHash = row.row_hash;
    }

    return { broken_at: null };
  }

  private computeRowHash(row: Record<string, unknown>): string {
    const prevHash = typeof row.prev_hash === 'string' ? row.prev_hash : GENESIS_HASH;
    const canonical = stableStringify(row);
    return createHash('sha256').update(`${prevHash}${canonical}`).digest('hex');
  }
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {}, jsonReplacer)) as Prisma.InputJsonValue;
}

function stableStringify(value: unknown): string {
  if (typeof value === 'bigint') {
    return JSON.stringify(value.toString());
  }
  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}

function jsonReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}
