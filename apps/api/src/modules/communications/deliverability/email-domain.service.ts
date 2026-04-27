import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma, TenantEmailDomain } from '@prisma/client';
import { Resend } from 'resend';

import { COMMS_CACHE_BUS_CHANNEL } from '@school/shared';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { EmailConfigService } from '../../configuration/email-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

import type { DnsRecord } from './dns-records.types';
import { EMAIL_DOMAIN_NOTIFIER, type EmailDomainNotifier } from './email-domain-notifier.token';

const VERIFIED_CACHE_TTL_SECONDS = 5 * 60;

/**
 * Per-tenant email-sender domain registration with Resend + DNS verification.
 *
 * Lifecycle:
 *   - register → POST `domains.create` to Resend → persist row with
 *     `status='pending'` and the canonical SPF/DKIM/DMARC record list
 *   - refresh (manual or 30-min cron) → GET `domains.get(sid)` → re-evaluate
 *     per-record statuses → flip `status='verified'` only when ALL three
 *     are verified
 *   - delete → best-effort `domains.remove(sid)` then local delete
 *
 * Used by `ResendEmailProvider.send()` via `getVerified(tenantId, domain)`
 * (5-min Redis-cached read keyed `email-domain:verified:{tenantId}:{domain}`).
 * Mutations publish to the `comms:config-changed` Redis bus so subscribers
 * can drop their per-tenant Resend client cache.
 */
@Injectable()
export class EmailDomainService {
  private readonly logger = new Logger(EmailDomainService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailConfig: EmailConfigService,
    private readonly redisService: RedisService,
    @Inject(EMAIL_DOMAIN_NOTIFIER) private readonly notifier: EmailDomainNotifier,
  ) {}

  // ─── Registration ──────────────────────────────────────────────────────────

  async registerDomain(
    tenantId: string,
    userId: string,
    domain: string,
  ): Promise<TenantEmailDomain> {
    const normalised = domain.toLowerCase().trim();

    const existing = await this.prisma.tenantEmailDomain.findFirst({
      where: { tenant_id: tenantId, domain: normalised },
    });
    if (existing) {
      throw new BadRequestException({
        code: 'DOMAIN_ALREADY_REGISTERED',
        message: `Domain "${normalised}" is already registered for this tenant.`,
      });
    }

    const client = await this.getResendClient(tenantId);
    const resp = await client.domains.create({ name: normalised }).catch((err: Error) => {
      this.logger.error(`[registerDomain] tenant=${tenantId} domain=${normalised}: ${err.message}`);
      throw new BadRequestException({
        code: 'RESEND_DOMAIN_CREATE_FAILED',
        message: `Resend rejected domain registration: ${err.message}`,
      });
    });
    if (resp.error) {
      throw new BadRequestException({
        code: 'RESEND_DOMAIN_CREATE_FAILED',
        message: `Resend rejected domain registration: ${resp.error.message}`,
      });
    }
    const resendDomainId = resp.data?.id;
    if (!resendDomainId) {
      throw new BadRequestException({
        code: 'RESEND_DOMAIN_CREATE_INVALID_RESPONSE',
        message: 'Resend returned an empty domain id.',
      });
    }

    const records = this.normaliseRecords(
      (resp.data as unknown as { records?: ReadonlyArray<unknown> }).records ?? [],
    );

    const rls = createRlsClient(this.prisma, { tenant_id: tenantId, user_id: userId });
    return rls.$transaction(async (tx) => {
      const txdb = tx as unknown as PrismaService;
      const row = await txdb.tenantEmailDomain.create({
        data: {
          tenant_id: tenantId,
          domain: normalised,
          resend_domain_id: resendDomainId,
          status: 'pending',
          spf_status: 'pending',
          dkim_status: 'pending',
          dmarc_status: 'pending',
          dns_records_json: records as unknown as Prisma.InputJsonValue,
          created_by_user_id: userId,
          last_checked_at: new Date(),
        },
      });
      await this.invalidate(tenantId, normalised);
      return row;
    });
  }

  // ─── Read paths ────────────────────────────────────────────────────────────

  async listDomains(
    tenantId: string,
    page = 1,
    pageSize = 20,
  ): Promise<{
    data: TenantEmailDomain[];
    meta: { page: number; pageSize: number; total: number };
  }> {
    const [data, total] = await Promise.all([
      this.prisma.tenantEmailDomain.findMany({
        where: { tenant_id: tenantId },
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.tenantEmailDomain.count({ where: { tenant_id: tenantId } }),
    ]);
    return { data, meta: { page, pageSize, total } };
  }

  async getDomain(tenantId: string, domainId: string): Promise<TenantEmailDomain | null> {
    return this.prisma.tenantEmailDomain.findFirst({
      where: { id: domainId, tenant_id: tenantId },
    });
  }

  // ─── Refresh ───────────────────────────────────────────────────────────────

  async refreshDomain(tenantId: string, domainId: string): Promise<TenantEmailDomain> {
    const row = await this.prisma.tenantEmailDomain.findFirst({
      where: { id: domainId, tenant_id: tenantId },
    });
    if (!row) {
      throw new NotFoundException({
        code: 'DOMAIN_NOT_FOUND',
        message: `Email domain "${domainId}" not found for this tenant.`,
      });
    }
    if (!row.resend_domain_id) {
      throw new BadRequestException({
        code: 'DOMAIN_NOT_REGISTERED_AT_RESEND',
        message: `Domain "${row.domain}" has no Resend ID — re-register it.`,
      });
    }
    return this.refreshOne(tenantId, row);
  }

  /** Shared by manual refresh and the worker cron applier. */
  async refreshOne(tenantId: string, row: TenantEmailDomain): Promise<TenantEmailDomain> {
    const client = await this.getResendClient(tenantId);
    let records: DnsRecord[];
    try {
      const resp = await client.domains.get(row.resend_domain_id ?? '');
      if (resp.error) {
        return this.applyFailure(tenantId, row.id, resp.error.message);
      }
      records = this.normaliseRecords(
        (resp.data as unknown as { records?: ReadonlyArray<unknown> }).records ?? [],
      );
    } catch (err) {
      const e = err as Error;
      this.logger.error(`[refreshOne] tenant=${tenantId} domain=${row.domain}: ${e.message}`);
      return this.applyFailure(tenantId, row.id, e.message);
    }

    const spf = this.statusFor(records, 'SPF');
    const dkim = this.statusFor(records, 'DKIM');
    const dmarc = this.statusFor(records, 'DMARC');
    const allVerified = spf === 'verified' && dkim === 'verified' && dmarc === 'verified';
    const previousStatus = row.status;

    const rls = createRlsClient(this.prisma, { tenant_id: tenantId });
    const updated = await rls.$transaction(async (tx) => {
      const txdb = tx as unknown as PrismaService;
      const next = await txdb.tenantEmailDomain.update({
        where: { id: row.id },
        data: {
          spf_status: spf,
          dkim_status: dkim,
          dmarc_status: dmarc,
          status: allVerified ? 'verified' : 'pending',
          verified_at: allVerified && !row.verified_at ? new Date() : row.verified_at,
          last_checked_at: new Date(),
          dns_records_json: records as unknown as Prisma.InputJsonValue,
          failure_reason: null,
        },
      });
      await this.invalidate(tenantId, row.domain);
      return next;
    });

    if (allVerified && previousStatus !== 'verified' && updated.created_by_user_id) {
      try {
        await this.notifier.notifyVerified(tenantId, updated);
      } catch (err) {
        const e = err as Error;
        this.logger.error(`[refreshOne] notifier failed tenant=${tenantId}: ${e.message}`);
      }
    }
    return updated;
  }

  // ─── Delete ────────────────────────────────────────────────────────────────

  async deleteDomain(tenantId: string, domainId: string, userId: string): Promise<void> {
    const row = await this.prisma.tenantEmailDomain.findFirst({
      where: { id: domainId, tenant_id: tenantId },
    });
    if (!row) {
      throw new NotFoundException({
        code: 'DOMAIN_NOT_FOUND',
        message: `Email domain "${domainId}" not found for this tenant.`,
      });
    }

    if (row.resend_domain_id) {
      try {
        const client = await this.getResendClient(tenantId);
        await client.domains.remove(row.resend_domain_id);
      } catch (err) {
        // Tolerate Resend 404 — purge locally regardless. Log other errors but proceed.
        const e = err as Error & { statusCode?: number };
        if (e.statusCode !== 404) {
          this.logger.warn(
            `[deleteDomain] Resend remove failed: ${e.message}; continuing local delete`,
          );
        }
      }
    }

    const rls = createRlsClient(this.prisma, { tenant_id: tenantId, user_id: userId });
    await rls.$transaction(async (tx) => {
      const txdb = tx as unknown as PrismaService;
      await txdb.tenantEmailDomain.delete({ where: { id: row.id } });
      await this.invalidate(tenantId, row.domain);
    });
  }

  // ─── Hot-path read used by ResendEmailProvider.send() ──────────────────────

  /**
   * Returns the verified row for `(tenant_id, domain)`, or null if no
   * verified row exists. 5-min Redis cache. A `'__null__'` sentinel is
   * stored for misses so cold recipients don't repeatedly hit the DB.
   */
  async getVerified(tenantId: string, domain: string): Promise<TenantEmailDomain | null> {
    const normalised = domain.toLowerCase().trim();
    const cacheKey = `email-domain:verified:${tenantId}:${normalised}`;
    const redis = this.redisService.getClient();

    const cached = await redis.get(cacheKey);
    if (cached !== null) {
      if (cached === '__null__') return null;
      try {
        return JSON.parse(cached) as TenantEmailDomain;
      } catch (err) {
        // Corrupt cache entry — log and fall through to DB read.
        this.logger.warn(
          `[getVerified] corrupt cache entry tenant=${tenantId} domain=${normalised}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    const row = await this.prisma.tenantEmailDomain.findFirst({
      where: { tenant_id: tenantId, domain: normalised, status: 'verified' },
    });
    await redis.set(
      cacheKey,
      row ? JSON.stringify(row) : '__null__',
      'EX',
      VERIFIED_CACHE_TTL_SECONDS,
    );
    return row;
  }

  // ─── Internals ─────────────────────────────────────────────────────────────

  private async getResendClient(tenantId: string): Promise<Resend> {
    const config = await this.emailConfig.getDecryptedConfig(tenantId);
    if (!config) {
      throw new BadRequestException({
        code: 'EMAIL_NOT_CONFIGURED',
        message: 'Email is not configured for this tenant.',
      });
    }
    return new Resend(config.resend_api_key);
  }

  private normaliseRecords(records: ReadonlyArray<unknown>): DnsRecord[] {
    return records.map((raw) => {
      const r = raw as Record<string, unknown>;
      const rt = String(r.record ?? '').toUpperCase();
      const record: DnsRecord['record'] =
        rt === 'SPF' || rt === 'DKIM' || rt === 'DMARC' ? (rt as DnsRecord['record']) : 'SPF';
      const status = this.coerceStatus(String(r.status ?? 'pending'));
      const typeRaw = String(r.type ?? 'TXT').toUpperCase();
      const type: DnsRecord['type'] =
        typeRaw === 'TXT' || typeRaw === 'MX' || typeRaw === 'CNAME'
          ? (typeRaw as DnsRecord['type'])
          : 'TXT';
      return {
        record,
        name: String(r.name ?? ''),
        type,
        value: String(r.value ?? ''),
        status,
      };
    });
  }

  private coerceStatus(raw: string): DnsRecord['status'] {
    const lc = raw.toLowerCase();
    if (lc === 'verified') return 'verified';
    if (lc === 'failed' || lc === 'temporary_failure') return 'failed';
    return 'pending';
  }

  private statusFor(records: DnsRecord[], type: 'SPF' | 'DKIM' | 'DMARC'): DnsRecord['status'] {
    const matches = records.filter((r) => r.record === type);
    if (matches.length === 0) return 'pending';
    if (matches.every((r) => r.status === 'verified')) return 'verified';
    if (matches.some((r) => r.status === 'failed')) return 'failed';
    return 'pending';
  }

  private async applyFailure(
    tenantId: string,
    domainId: string,
    reason: string,
  ): Promise<TenantEmailDomain> {
    const rls = createRlsClient(this.prisma, { tenant_id: tenantId });
    return rls.$transaction(async (tx) => {
      const txdb = tx as unknown as PrismaService;
      return txdb.tenantEmailDomain.update({
        where: { id: domainId },
        data: { failure_reason: reason.slice(0, 500), last_checked_at: new Date() },
      });
    });
  }

  private async invalidate(tenantId: string, domain: string): Promise<void> {
    const cacheKey = `email-domain:verified:${tenantId}:${domain.toLowerCase()}`;
    const redis = this.redisService.getClient();
    await redis.del(cacheKey);
    await redis.publish(
      COMMS_CACHE_BUS_CHANNEL,
      JSON.stringify({
        tenant_id: tenantId,
        channel: 'email',
        ts: Date.now(),
      }),
    );
  }
}
