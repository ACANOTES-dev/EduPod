import { createHash } from 'crypto';

import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

import { PrismaService } from '../../prisma/prisma.service';

import { SentryAlertEmitterService } from './sentry-alert-emitter.service';
import { SentryIngestionService } from './sentry-ingestion.service';
import { SentryPayloadNormalizerService } from './sentry-payload-normalizer.service';
import { SentrySignatureService } from './sentry-signature.service';

type RawRequest = Request & { rawBody?: Buffer };

@Controller('v1/admin/_internal/sentry-webhook')
export class SentryWebhookController {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly signatures: SentrySignatureService,
    private readonly normalizer: SentryPayloadNormalizerService,
    private readonly ingestion: SentryIngestionService,
    private readonly alerts: SentryAlertEmitterService,
  ) {}

  // POST /v1/admin/_internal/sentry-webhook
  @Post()
  @HttpCode(HttpStatus.OK)
  async receive(
    @Req() request: RawRequest,
    @Headers('sentry-hook-signature') signature: string | undefined,
    @Headers('sentry-hook-resource') resource: string | undefined,
  ) {
    const rawBody = bodyBuffer(request);
    const payloadSha = sha256(rawBody);
    const secret = this.config.get<string>('SENTRY_WEBHOOK_SECRET');
    const payload = parsePayload(rawBody);
    const payloadKind = payloadKindFrom(resource, payload);
    const sentryIssueId = issueIdFrom(payload);
    const sourceIpHash = sourceIp(request)
      ? sha256(Buffer.from(sourceIp(request) ?? ''))
      : undefined;

    if (!secret) {
      await this.auditReceipt({
        error_message: 'Sentry webhook secret is not configured.',
        payload_kind: payloadKind,
        payload_sha256: payloadSha,
        sentry_issue_id: sentryIssueId,
        signature_valid: false,
        source_ip_hash: sourceIpHash,
      });
      await this.alerts.emit({
        key: 'webhook.secret_missing',
        message: 'Sentry webhook rejected because SENTRY_WEBHOOK_SECRET is missing.',
        severity: 'critical',
      });
      throw new UnauthorizedException({
        code: 'SENTRY_WEBHOOK_SECRET_MISSING',
        message: 'Sentry webhook signing is not configured.',
      });
    }

    const signatureValid = this.signatures.verify({ body: rawBody, secret, signature });
    if (!signatureValid) {
      await this.auditReceipt({
        error_message: 'Invalid Sentry webhook signature.',
        payload_kind: payloadKind,
        payload_sha256: payloadSha,
        sentry_issue_id: sentryIssueId,
        signature_valid: false,
        source_ip_hash: sourceIpHash,
      });
      await this.alerts.emit({
        key: 'webhook.signature_invalid',
        message: 'Sentry webhook rejected because the signature was invalid.',
        severity: 'critical',
      });
      throw new UnauthorizedException({
        code: 'SENTRY_WEBHOOK_SIGNATURE_INVALID',
        message: 'Sentry webhook signature is invalid.',
      });
    }

    const replay = await this.isReplay(payloadSha);
    const audit = await this.auditReceipt({
      payload_kind: payloadKind,
      payload_sha256: payloadSha,
      replay_detected: replay,
      sentry_issue_id: sentryIssueId,
      signature_valid: true,
      source_ip_hash: sourceIpHash,
    });
    if (replay) {
      await this.prisma.platformSentryWebhookAudit.update({
        where: { id: audit.id },
        data: { error_message: 'Replay duplicate ignored.', processed_at: new Date() },
      });
      return { accepted: true, replay_detected: true };
    }

    try {
      const normalized = await this.normalizer.normalize(payload, resource);
      const mirrored = await this.ingestion.ingest(normalized);
      await this.prisma.platformSentryWebhookAudit.update({
        where: { id: audit.id },
        data: {
          processed_at: new Date(),
          sentry_issue_id: mirrored.sentry_issue_id,
        },
      });
      return { accepted: true, id: mirrored.id, sentry_issue_id: mirrored.sentry_issue_id };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Sentry webhook processing failed.';
      console.error('[SentryWebhookController.receive]', err);
      await this.prisma.platformSentryWebhookAudit.update({
        where: { id: audit.id },
        data: { error_message: message.slice(0, 1000), processed_at: new Date() },
      });
      return { accepted: true, processed: false };
    }
  }

  private async auditReceipt(input: {
    error_message?: string;
    payload_kind: string;
    payload_sha256: string;
    replay_detected?: boolean;
    sentry_issue_id?: string;
    signature_valid: boolean;
    source_ip_hash?: string;
  }) {
    return this.prisma.platformSentryWebhookAudit.create({
      data: {
        error_message: input.error_message,
        payload_kind: input.payload_kind.slice(0, 40),
        payload_sha256: input.payload_sha256,
        replay_detected: input.replay_detected ?? false,
        sentry_issue_id: input.sentry_issue_id,
        signature_valid: input.signature_valid,
        source_ip_hash: input.source_ip_hash,
      },
    });
  }

  private async isReplay(payloadSha: string): Promise<boolean> {
    const since = new Date(Date.now() - 10 * 60 * 1000);
    const existing = await this.prisma.platformSentryWebhookAudit.findFirst({
      where: {
        payload_sha256: payloadSha,
        received_at: { gte: since },
        signature_valid: true,
      },
      select: { id: true },
    });
    return Boolean(existing);
  }
}

function bodyBuffer(request: RawRequest): Buffer {
  if (request.rawBody) return request.rawBody;
  if (Buffer.isBuffer(request.body)) return request.body;
  if (typeof request.body === 'string') return Buffer.from(request.body);
  return Buffer.from(JSON.stringify(request.body ?? {}));
}

function parsePayload(rawBody: Buffer): Record<string, unknown> {
  try {
    const parsed = JSON.parse(rawBody.toString('utf8'));
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (err: unknown) {
    console.error('[SentryWebhookController.parsePayload]', err);
    return {};
  }
}

function payloadKindFrom(resource: string | undefined, payload: Record<string, unknown>): string {
  if (resource?.trim()) return resource.trim();
  const action = typeof payload.action === 'string' ? payload.action : undefined;
  return action === 'resolved' ? 'issue_resolved' : (action ?? 'issue_alert');
}

function issueIdFrom(payload: Record<string, unknown>): string | undefined {
  const data = record(payload.data);
  const issue = record(data?.issue) ?? record(payload.issue);
  const id = issue?.id ?? issue?.shortId;
  return typeof id === 'string' ? id.slice(0, 80) : undefined;
}

function sourceIp(request: Request): string | undefined {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) return forwarded.split(',')[0]?.trim();
  return request.ip;
}

function sha256(input: Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
