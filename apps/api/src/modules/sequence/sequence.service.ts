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
      const rawExec = db as unknown as {
        $executeRaw: (sql: Prisma.Sql) => Promise<number>;
      };

      // eslint-disable-next-line school/no-raw-sql-outside-rls -- SELECT FOR UPDATE sequence lock within RLS transaction
      let rows = (await rawTx.$queryRaw(
        Prisma.sql`SELECT current_value FROM tenant_sequences WHERE tenant_id = ${tenantId}::uuid AND sequence_type = ${sequenceType} FOR UPDATE`,
      )) as Array<{ current_value: bigint }>;

      if (!rows.length) {
        // Lazy-initialize the sequence row for this tenant+type. Concurrent
        // callers race via the unique constraint; ON CONFLICT DO NOTHING makes
        // this safe without a pre-check, and the subsequent SELECT re-reads
        // whichever row won the insert race under the FOR UPDATE lock.
        // eslint-disable-next-line school/no-raw-sql-outside-rls -- INSERT row for lazy sequence init within RLS transaction
        await rawExec.$executeRaw(
          Prisma.sql`INSERT INTO tenant_sequences (tenant_id, sequence_type, current_value) VALUES (${tenantId}::uuid, ${sequenceType}, 0) ON CONFLICT (tenant_id, sequence_type) DO NOTHING`,
        );
        // eslint-disable-next-line school/no-raw-sql-outside-rls -- SELECT FOR UPDATE sequence lock within RLS transaction
        rows = (await rawTx.$queryRaw(
          Prisma.sql`SELECT current_value FROM tenant_sequences WHERE tenant_id = ${tenantId}::uuid AND sequence_type = ${sequenceType} FOR UPDATE`,
        )) as Array<{ current_value: bigint }>;
      }

      const newValue = Number(rows[0]?.current_value ?? 0) + 1;

      // eslint-disable-next-line school/no-raw-sql-outside-rls -- SELECT FOR UPDATE sequence lock within RLS transaction
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
   * Generate a sequential household reference using the tenant_sequences table.
   * Format: HH-{padded_sequence} (e.g., HH-000001). Collision-free by design.
   */
  async generateHouseholdReference(tenantId: string, tx?: unknown): Promise<string> {
    return this.nextNumber(tenantId, 'household', tx, 'HH');
  }

  private formatNumber(sequenceType: string, value: number, prefix?: string): string {
    const padded = String(value).padStart(6, '0');

    if (prefix) {
      return `${prefix}-${padded}`;
    }

    switch (sequenceType) {
      case 'application':
        return `APP-${padded}`;
      default:
        return `${sequenceType.toUpperCase()}-${padded}`;
    }
  }
}
