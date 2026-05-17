import type { SyntheticCheckKind, SyntheticCheckResultStatus } from '@prisma/client';

export interface HandlerResult {
  status: SyntheticCheckResultStatus;
  latency_ms?: number;
  response_status_code?: number;
  response_body?: string;
  failure_detail?: Record<string, unknown>;
  certificate?: {
    check_error?: string | null;
    check_status: string;
    days_until_expiry?: number | null;
    hostname: string;
    issuer?: string | null;
    not_after?: Date | null;
    not_before?: Date | null;
    subject?: string | null;
  };
  external_dependency?: {
    display_name: string;
    provider_key: string;
    source: string;
    status: string;
    status_detail?: string | null;
    upstream_url?: string | null;
  };
}

export interface SyntheticCheckHandler {
  readonly kind: SyntheticCheckKind;
  execute(input: {
    expected: Record<string, unknown>;
    target: Record<string, unknown>;
    timeout_ms: number;
  }): Promise<HandlerResult>;
}

export function isFailureStatus(status: SyntheticCheckResultStatus): boolean {
  return status === 'failed' || status === 'error' || status === 'degraded';
}
