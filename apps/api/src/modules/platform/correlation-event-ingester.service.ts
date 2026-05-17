import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import {
  recordCorrelationEvent,
  setCorrelationEventSink,
  type CorrelationEventInput,
} from '../../common/services/correlation-event-sink';
import { PrismaService } from '../prisma/prisma.service';

const FLUSH_INTERVAL_MS = 2000;
const MAX_BATCH_SIZE = 50;

@Injectable()
export class CorrelationEventIngesterService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CorrelationEventIngesterService.name);
  private readonly buffer: CorrelationEventInput[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    setCorrelationEventSink((event) => this.enqueue(event));
    this.flushTimer = setInterval(() => {
      void this.flush();
    }, FLUSH_INTERVAL_MS);
  }

  async onModuleDestroy(): Promise<void> {
    setCorrelationEventSink(null);
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }

  enqueue(event: CorrelationEventInput): void {
    this.buffer.push(event);
    if (this.buffer.length >= MAX_BATCH_SIZE) {
      void this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) {
      return;
    }
    const batch = this.buffer.splice(0, MAX_BATCH_SIZE);
    try {
      await this.prisma.platformCorrelationEvent.createMany({
        data: batch.map((event) => ({
          correlation_id: event.correlation_id,
          source: event.source,
          event_type: event.event_type,
          payload: event.payload,
          tenant_id: event.tenant_id,
          user_id: event.user_id,
        })),
      });
    } catch (err: unknown) {
      this.logger.warn(
        `Dropped ${batch.length} platform correlation event(s) after write failure`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  record(input: CorrelationEventInput): void {
    recordCorrelationEvent({
      ...input,
      payload: JSON.parse(JSON.stringify(input.payload ?? {})) as Prisma.InputJsonValue,
    });
  }
}
