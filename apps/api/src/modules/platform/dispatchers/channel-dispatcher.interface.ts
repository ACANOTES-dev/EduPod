import type { PlatformAlertChannelType } from '@prisma/client';

export interface AlertPayload {
  rule_name: string;
  severity: string;
  message: string;
  metric_value: number;
  ack_url?: string;
  is_dead_man_check?: boolean;
  is_test?: boolean;
}

export interface AlertChannelForDispatch {
  id: string;
  name: string;
  type: PlatformAlertChannelType;
  config: unknown;
  is_enabled: boolean;
}

export interface ChannelDispatcher {
  send(config: unknown, alert: AlertPayload): Promise<void>;
}
