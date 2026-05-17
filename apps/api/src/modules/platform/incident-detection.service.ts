import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { PlatformIncidentService } from './platform-incident.service';
import { RedisPubSubCallback, RedisPubSubService } from './redis-pubsub.service';

const INCIDENT_AUTO_RESOLVE_INTERVAL_MS = 5 * 60 * 1000;

@Injectable()
export class IncidentDetectionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IncidentDetectionService.name);
  private readonly alertCallback: RedisPubSubCallback = (event) => {
    void this.handleAlertEvent(event);
  };
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly redisPubSub: RedisPubSubService,
    private readonly incidents: PlatformIncidentService,
  ) {}

  onModuleInit(): void {
    this.redisPubSub.subscribe('platform:alerts', this.alertCallback);
    this.intervalHandle = setInterval(() => {
      void this.incidents.autoResolveMonitoringIncidents().catch((err: unknown) => {
        this.logger.error('[autoResolveMonitoringIncidents] Failed', err);
      });
    }, INCIDENT_AUTO_RESOLVE_INTERVAL_MS);
    this.logger.log('Incident detection subscribed to platform alerts');
  }

  onModuleDestroy(): void {
    this.redisPubSub.unsubscribe('platform:alerts', this.alertCallback);
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  async handleAlertEvent(event: Record<string, unknown>): Promise<void> {
    try {
      const type = typeof event.type === 'string' ? event.type : null;
      const alertId = typeof event.alert_id === 'string' ? event.alert_id : null;
      if (!alertId) return;

      if (type === 'alert_fired') {
        await this.incidents.createOrAttachFromAlert(alertId);
        return;
      }

      if (type === 'alert_resolved') {
        const resolvedAt =
          typeof event.resolved_at === 'string' ? new Date(event.resolved_at) : new Date();
        await this.incidents.recordAlertResolved(alertId, resolvedAt);
      }
    } catch (err: unknown) {
      this.logger.error('[handleAlertEvent] Incident detection failed', err);
    }
  }
}
