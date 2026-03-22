import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SequenceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate the next sequence number for a given type within a tenant.
   * Uses SELECT ... FOR UPDATE to prevent duplicates under concurrency.
   * Can accept an existing transaction client or create its own.
   */
  async nextNumber(
    tenantId: string,
    sequenceType: string,
    tx?: unknown,
    prefix?: string,
  ): Promise<string> {
    const doWork = async (db: unknown): Promise<string> => {
      // Use raw query for FOR UPDATE locking
      const rawTx = db as unknown as {
        $queryRaw: (sql: Prisma.Sql) => Promise<unknown[]>;
      };

      const rows = (await rawTx.$queryRaw(
        Prisma.sql`SELECT current_value FROM tenant_sequences WHERE tenant_id = ${tenantId}::uuid AND sequence_type = ${sequenceType} FOR UPDATE`,
      )) as Array<{ current_value: bigint }>;

      if (!rows.length) {
        throw new Error(
          `Sequence type "${sequenceType}" not found for tenant ${tenantId}`,
        );
      }

      const newValue = Number(rows[0]?.current_value ?? 0) + 1;

      const rawExec = db as unknown as {
        $executeRaw: (sql: Prisma.Sql) => Promise<number>;
      };
      await rawExec.$executeRaw(
        Prisma.sql`UPDATE tenant_sequences SET current_value = ${newValue} WHERE tenant_id = ${tenantId}::uuid AND sequence_type = ${sequenceType}`,
      );

      return this.formatNumber(sequenceType, newValue, prefix);
    };

    if (tx) {
      return doWork(tx);
    }
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });
    return rlsClient.$transaction(async (newTx) => doWork(newTx)) as Promise<string>;
  }

  /**
   * Generate a randomised household reference in XXX999-9 format.
   * Includes collision check — retries on duplicate within tenant.
   * This reference doubles as the parent's initial portal password.
   */
  async generateHouseholdReference(
    tenantId: string,
    tx?: unknown,
  ): Promise<string> {
    const doWork = async (db: unknown): Promise<string> => {
      const rawTx = db as unknown as {
        $queryRaw: (sql: Prisma.Sql) => Promise<unknown[]>;
      };

      const maxAttempts = 10;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const ref = this.randomHouseholdRef();

        // Check uniqueness within tenant
        const existing = (await rawTx.$queryRaw(
          Prisma.sql`SELECT 1 FROM households WHERE tenant_id = ${tenantId}::uuid AND household_number = ${ref} LIMIT 1`,
        )) as unknown[];

        if (existing.length === 0) {
          return ref;
        }
      }

      throw new Error(
        'Failed to generate unique household reference after 10 attempts',
      );
    };

    if (tx) {
      return doWork(tx);
    }
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });
    return rlsClient.$transaction(async (newTx) => doWork(newTx)) as Promise<string>;
  }

  /** Generate a random reference in XXX999-9 format (e.g., SJF558-5). */
  private randomHouseholdRef(): string {
    const letters = 'ABCDEFGHJKMNPQRSTUVWXYZ'; // Exclude I, L, O to avoid confusion
    const l1 = letters[Math.floor(Math.random() * letters.length)];
    const l2 = letters[Math.floor(Math.random() * letters.length)];
    const l3 = letters[Math.floor(Math.random() * letters.length)];
    const d1 = Math.floor(Math.random() * 10);
    const d2 = Math.floor(Math.random() * 10);
    const d3 = Math.floor(Math.random() * 10);
    const d4 = Math.floor(Math.random() * 10);
    return `${l1}${l2}${l3}${d1}${d2}${d3}-${d4}`;
  }

  private formatNumber(sequenceType: string, value: number, prefix?: string): string {
    const now = new Date();
    const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const padded = String(value).padStart(6, '0');

    if (prefix) {
      return `${prefix}-${yearMonth}-${padded}`;
    }

    switch (sequenceType) {
      case 'application':
        return `APP-${yearMonth}-${padded}`;
      default:
        return `${sequenceType.toUpperCase()}-${yearMonth}-${padded}`;
    }
  }
}
