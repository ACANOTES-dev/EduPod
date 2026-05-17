import type { Prisma } from '@prisma/client';

export interface CorrelationEventInput {
  correlation_id: string;
  source: string;
  event_type: string;
  payload: Prisma.InputJsonValue;
  tenant_id?: string;
  user_id?: string;
}

type CorrelationEventSink = (event: CorrelationEventInput) => void;

let activeSink: CorrelationEventSink | null = null;

export function setCorrelationEventSink(sink: CorrelationEventSink | null): void {
  activeSink = sink;
}

export function recordCorrelationEvent(event: CorrelationEventInput): void {
  activeSink?.(event);
}
