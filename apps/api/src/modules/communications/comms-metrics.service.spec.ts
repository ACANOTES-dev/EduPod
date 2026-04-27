import { Registry } from 'prom-client';

import type { MetricsService } from '../metrics/metrics.service';

import { CommsMetricsService } from './comms-metrics.service';

describe('CommsMetricsService', () => {
  let registry: Registry;
  let service: CommsMetricsService;

  beforeEach(() => {
    registry = new Registry();
    const fakeMetrics = { getCommsRegistry: () => registry } as unknown as MetricsService;
    service = new CommsMetricsService(fakeMetrics);
    service.onModuleInit();
  });

  it('registers all expected metric names', async () => {
    const names = (await registry.getMetricsAsJSON()).map((m) => m.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'notifications_dispatched_total',
        'notifications_dispatch_duration_seconds',
        'notifications_suppressed_total',
        'notifications_webhook_received_total',
        'notifications_template_renders_total',
        'notifications_provider_errors_total',
      ]),
    );
  });

  it('increments dispatch counter', async () => {
    service.recordDispatch('T1', 'email', 'sent', 240);
    const text = await registry.metrics();
    expect(text).toContain(
      'notifications_dispatched_total{tenant_id="T1",channel="email",status="sent"} 1',
    );
  });

  it('records webhook with stringified bool', async () => {
    service.recordWebhook('T1', 'email', 'delivered', true);
    service.recordWebhook('T1', 'email', 'delivered', false);
    const text = await registry.metrics();
    expect(text).toContain('signature_valid="true"');
    expect(text).toContain('signature_valid="false"');
  });

  it('records suppression counter', async () => {
    service.recordSuppression('T1', 'sms', 'hard_bounce');
    const text = await registry.metrics();
    expect(text).toContain(
      'notifications_suppressed_total{tenant_id="T1",channel="sms",reason="hard_bounce"} 1',
    );
  });

  it('records provider errors counter', async () => {
    service.recordProviderError('T1', 'email', 'resend.invalid_key');
    const text = await registry.metrics();
    expect(text).toContain(
      'notifications_provider_errors_total{tenant_id="T1",channel="email",error_code="resend.invalid_key"} 1',
    );
  });
});
