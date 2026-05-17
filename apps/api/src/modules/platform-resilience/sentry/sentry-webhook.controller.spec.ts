import { createHmac } from 'crypto';

import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import type { PrismaService } from '../../prisma/prisma.service';

import type { SentryAlertEmitterService } from './sentry-alert-emitter.service';
import type { SentryIngestionService } from './sentry-ingestion.service';
import type { SentryPayloadNormalizerService } from './sentry-payload-normalizer.service';
import { SentrySignatureService } from './sentry-signature.service';
import { SentryWebhookController } from './sentry-webhook.controller';

describe('SentryWebhookController', () => {
  const payload = Buffer.from(
    JSON.stringify({
      action: 'created',
      data: { issue: { id: 'ISSUE-1', title: 'Boom' } },
    }),
  );

  function buildController(secret?: string) {
    const config = { get: jest.fn(() => secret) } as ConfigService;
    const prisma = {
      platformSentryWebhookAudit: {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      },
    } as PrismaService;
    const normalizer = {
      normalize: jest.fn().mockResolvedValue({ sentry_issue_id: 'ISSUE-1' }),
    } as SentryPayloadNormalizerService;
    const ingestion = {
      ingest: jest.fn().mockResolvedValue({ id: 'mirror-1', sentry_issue_id: 'ISSUE-1' }),
    } as SentryIngestionService;
    const alerts = { emit: jest.fn().mockResolvedValue(undefined) } as SentryAlertEmitterService;
    return {
      alerts,
      controller: new SentryWebhookController(
        config,
        prisma,
        new SentrySignatureService(),
        normalizer,
        ingestion,
        alerts,
      ),
      ingestion,
      normalizer,
      prisma,
    };
  }

  it('fails closed and audits when the signing secret is missing', async () => {
    const { alerts, controller, prisma } = buildController();

    await expect(
      controller.receive(
        { headers: {}, ip: '127.0.0.1', rawBody: payload } as never,
        undefined,
        'issue_alert',
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.platformSentryWebhookAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ signature_valid: false }),
      }),
    );
    expect(alerts.emit).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'webhook.secret_missing', severity: 'critical' }),
    );
  });

  it('accepts signed payloads and ignores replay duplicates', async () => {
    const secret = 'secret';
    const { controller, ingestion, normalizer, prisma } = buildController(secret);
    const signature = createHmac('sha256', secret).update(payload).digest('hex');

    const accepted = await controller.receive(
      { headers: {}, ip: '127.0.0.1', rawBody: payload } as never,
      signature,
      'issue_alert',
    );

    expect(accepted).toEqual({ accepted: true, id: 'mirror-1', sentry_issue_id: 'ISSUE-1' });
    expect(normalizer.normalize).toHaveBeenCalled();
    expect(ingestion.ingest).toHaveBeenCalled();

    jest
      .spyOn(prisma.platformSentryWebhookAudit, 'findFirst')
      .mockResolvedValueOnce({ id: 'audit-0' });
    const replay = await controller.receive(
      { headers: {}, ip: '127.0.0.1', rawBody: payload } as never,
      signature,
      'issue_alert',
    );

    expect(replay).toEqual({ accepted: true, replay_detected: true });
  });
});
