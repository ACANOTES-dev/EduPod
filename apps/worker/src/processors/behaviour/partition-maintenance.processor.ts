import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { type PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';

// ─── Job constants ──────────────────────────────────────────────────────────

export const BEHAVIOUR_PARTITION_MAINTENANCE_JOB = 'behaviour:partition-maintenance';

export interface PartitionMaintenancePayload {
  // Not tenant-aware — this manages DB schema, not tenant data
}

// ─── Partitioned tables configuration ───────────────────────────────────────

interface PartitionConfig {
  table: string;
  strategy: 'monthly' | 'yearly';
}

const PARTITIONED_TABLES: PartitionConfig[] = [
  { table: 'behaviour_entity_history', strategy: 'monthly' },
  { table: 'behaviour_policy_evaluations', strategy: 'monthly' },
  { table: 'behaviour_policy_action_executions', strategy: 'monthly' },
  { table: 'behaviour_parent_acknowledgements', strategy: 'monthly' },
  { table: 'behaviour_alerts', strategy: 'yearly' },
  { table: 'behaviour_alert_recipients', strategy: 'yearly' },
];

// ─── Processor ──────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.BEHAVIOUR)
export class PartitionMaintenanceProcessor extends WorkerHost {
  private readonly logger = new Logger(PartitionMaintenanceProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<PartitionMaintenancePayload>): Promise<Record<string, unknown>> {
    if (job.name !== BEHAVIOUR_PARTITION_MAINTENANCE_JOB) return {};

    this.logger.log(`Processing ${BEHAVIOUR_PARTITION_MAINTENANCE_JOB}`);

    const created: string[] = [];
    const now = new Date();

    for (const config of PARTITIONED_TABLES) {
      try {
        if (config.strategy === 'monthly') {
          // Create next 3 months of partitions
          for (let i = 0; i <= 3; i++) {
            const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
            const partitionName = this.getMonthlyPartitionName(config.table, date);
            const rangeStart = this.formatDate(date);
            const nextMonth = new Date(date.getFullYear(), date.getMonth() + 1, 1);
            const rangeEnd = this.formatDate(nextMonth);

            await this.createPartitionIfNotExists(config.table, partitionName, rangeStart, rangeEnd);
            created.push(partitionName);
          }
        } else {
          // Create next 2 years of partitions
          for (let i = 0; i <= 2; i++) {
            const year = now.getFullYear() + i;
            const partitionName = this.getYearlyPartitionName(config.table, year);
            const rangeStart = `${year}-01-01`;
            const rangeEnd = `${year + 1}-01-01`;

            await this.createPartitionIfNotExists(config.table, partitionName, rangeStart, rangeEnd);
            created.push(partitionName);
          }
        }
      } catch (error) {
        this.logger.error(`Failed to manage partitions for ${config.table}: ${error}`);
      }
    }

    this.logger.log(`Partition maintenance complete. Created/verified: ${created.length} partitions.`);

    return { created_partitions: created.length, tables_processed: PARTITIONED_TABLES.length };
  }

  private getMonthlyPartitionName(table: string, date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${table}_${year}_${month}`;
  }

  private getYearlyPartitionName(table: string, year: number): string {
    return `${table}_${year}`;
  }

  private formatDate(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
  }

  private async createPartitionIfNotExists(
    parentTable: string,
    partitionName: string,
    rangeStart: string,
    rangeEnd: string,
  ): Promise<void> {
    // Check if partition already exists
    const exists = await this.prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
      `SELECT EXISTS (
        SELECT 1 FROM pg_tables WHERE tablename = $1
      ) as exists`,
      partitionName,
    );

    if (exists[0]?.exists) {
      return; // Already exists
    }

    // Create the partition
    // Note: Using $executeRawUnsafe here is safe because partition/table names are
    // derived from our own constants, not user input
    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS ${partitionName}
       PARTITION OF ${parentTable}
       FOR VALUES FROM ('${rangeStart}') TO ('${rangeEnd}')`,
    );

    this.logger.log(`Created partition ${partitionName} (${rangeStart} to ${rangeEnd})`);
  }
}
