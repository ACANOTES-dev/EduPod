import crypto from 'crypto';

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { GdprOutboundData } from '@school/shared/gdpr';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Unambiguous character set (no I/O/0/1) — 32 characters for clean modulo */
const TOKEN_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TOKEN_LENGTH = 14;

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class GdprTokenService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── PROCESS OUTBOUND ────────────────────────────────────────────────────────

  async processOutbound(
    tenantId: string,
    exportType: string,
    data: GdprOutboundData,
    triggeredByUserId: string,
    options?: {
      overrideTokenisation?: boolean;
      overrideReason?: string;
      overrideByUserId?: string;
    },
  ): Promise<{
    processedData: GdprOutboundData;
    tokenMap: Record<string, string> | null;
  }> {
    // 1. Look up export policy
    const policy = await this.prisma.gdprExportPolicy.findUnique({
      where: { export_type: exportType },
    });

    if (!policy) {
      throw new NotFoundException({
        code: 'EXPORT_POLICY_NOT_FOUND',
        message: `No export policy found for type "${exportType}"`,
      });
    }

    // 2. Determine whether to tokenise
    const shouldTokenise = this.resolveTokenisation(policy.tokenisation, options);

    // 3. Tokenise or pass through
    let processedData: GdprOutboundData;
    let tokenMap: Record<string, string> | null = null;
    const tokenIds: string[] = [];

    if (shouldTokenise && data.entities.length > 0) {
      const result = await this.tokeniseEntities(tenantId, data);
      processedData = result.processedData;
      tokenMap = result.tokenMap;
      tokenIds.push(...result.tokenIds);
    } else {
      processedData = data;
    }

    // 4. Log usage
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });
    await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      await db.gdprTokenUsageLog.create({
        data: {
          tenant_id: tenantId,
          export_type: exportType,
          tokenised: shouldTokenise,
          policy_applied: policy.tokenisation,
          lawful_basis: policy.lawful_basis,
          tokens_used: tokenIds,
          entity_count: data.entityCount,
          triggered_by: triggeredByUserId,
          override_by: options?.overrideByUserId ?? null,
          override_reason: options?.overrideReason ?? null,
        },
      });
    });

    return { processedData, tokenMap };
  }

  // ─── PROCESS INBOUND ─────────────────────────────────────────────────────────

  async processInbound(
    _tenantId: string,
    response: string,
    tokenMap: Record<string, string> | null,
  ): Promise<string> {
    if (!tokenMap || Object.keys(tokenMap).length === 0) {
      return response;
    }

    let result = response;
    for (const [token, realValue] of Object.entries(tokenMap)) {
      // Replace all occurrences of the token with the real value
      result = result.split(token).join(realValue);
    }

    return result;
  }

  // ─── GENERATE TOKEN ──────────────────────────────────────────────────────────

  generateToken(): string {
    const bytes = crypto.randomBytes(TOKEN_LENGTH);
    let token = '';
    for (let i = 0; i < TOKEN_LENGTH; i++) {
      const byte = bytes[i];
      if (byte === undefined) {
        throw new Error(`Unexpected: randomBytes returned fewer than ${TOKEN_LENGTH} bytes`);
      }
      token += TOKEN_CHARSET[byte % 32];
    }
    return token;
  }

  // ─── GET USAGE LOG ───────────────────────────────────────────────────────────

  async getUsageLog(
    tenantId: string,
    params: {
      page: number;
      pageSize: number;
      export_type?: string;
      date_from?: string;
      date_to?: string;
    },
  ): Promise<{
    data: unknown[];
    meta: { page: number; pageSize: number; total: number };
  }> {
    const where: Record<string, unknown> = { tenant_id: tenantId };

    if (params.export_type) {
      where.export_type = params.export_type;
    }

    if (params.date_from || params.date_to) {
      const createdAt: Record<string, Date> = {};
      if (params.date_from) {
        createdAt.gte = new Date(params.date_from);
      }
      if (params.date_to) {
        createdAt.lte = new Date(params.date_to);
      }
      where.created_at = createdAt;
    }

    const skip = (params.page - 1) * params.pageSize;

    const [data, total] = await Promise.all([
      this.prisma.gdprTokenUsageLog.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: params.pageSize,
      }),
      this.prisma.gdprTokenUsageLog.count({ where }),
    ]);

    return {
      data,
      meta: { page: params.page, pageSize: params.pageSize, total },
    };
  }

  // ─── GET USAGE STATS ─────────────────────────────────────────────────────────

  async getUsageStats(
    tenantId: string,
    params: { date_from?: string; date_to?: string },
  ): Promise<{
    totalTokensGenerated: number;
    usageByService: Array<{ export_type: string; count: number }>;
    usageByMonth: Array<{ month: string; count: number }>;
  }> {
    const tokenWhere: Record<string, unknown> = { tenant_id: tenantId };
    const logWhere: Record<string, unknown> = { tenant_id: tenantId };

    if (params.date_from || params.date_to) {
      const createdAt: Record<string, Date> = {};
      if (params.date_from) {
        createdAt.gte = new Date(params.date_from);
      }
      if (params.date_to) {
        createdAt.lte = new Date(params.date_to);
      }
      tokenWhere.created_at = createdAt;
      logWhere.created_at = createdAt;
    }

    // Total tokens generated
    const totalTokensGenerated = await this.prisma.gdprAnonymisationToken.count({
      where: tokenWhere,
    });

    // Usage grouped by export_type
    const usageByServiceRaw = await this.prisma.gdprTokenUsageLog.groupBy({
      by: ['export_type'],
      where: logWhere,
      _count: { id: true },
      orderBy: { export_type: 'asc' },
    });

    const usageByService = usageByServiceRaw.map((row) => ({
      export_type: row.export_type,
      count: row._count.id,
    }));

    // Usage grouped by month — fetch all logs and aggregate in JS
    // (Prisma does not support date_trunc groupBy natively)
    const allLogs = await this.prisma.gdprTokenUsageLog.findMany({
      where: logWhere,
      select: { created_at: true },
      orderBy: { created_at: 'asc' },
    });

    const monthCounts = new Map<string, number>();
    for (const log of allLogs) {
      const d = new Date(log.created_at);
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      monthCounts.set(key, (monthCounts.get(key) ?? 0) + 1);
    }

    const usageByMonth = Array.from(monthCounts.entries()).map(([month, count]) => ({
      month,
      count,
    }));

    return { totalTokensGenerated, usageByService, usageByMonth };
  }

  // ─── GET EXPORT POLICIES ─────────────────────────────────────────────────────

  async getExportPolicies(): Promise<unknown[]> {
    return this.prisma.gdprExportPolicy.findMany({
      orderBy: { export_type: 'asc' },
    });
  }

  // ─── DELETE TOKENS FOR ENTITY ─────────────────────────────────────────────────

  async deleteTokensForEntity(
    tenantId: string,
    entityType: string,
    entityId: string,
  ): Promise<number> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const result = await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.gdprAnonymisationToken.deleteMany({
        where: {
          tenant_id: tenantId,
          entity_type: entityType,
          entity_id: entityId,
        },
      });
    });

    return (result as { count: number }).count;
  }

  // ─── PRIVATE HELPERS ──────────────────────────────────────────────────────────

  /**
   * Determine whether to tokenise based on policy and override options.
   */
  private resolveTokenisation(
    policyTokenisation: string,
    options?: {
      overrideTokenisation?: boolean;
      overrideReason?: string;
      overrideByUserId?: string;
    },
  ): boolean {
    switch (policyTokenisation) {
      case 'always':
        // Override NOT allowed — if caller tries to disable, reject
        if (options?.overrideTokenisation === false) {
          throw new BadRequestException({
            code: 'OVERRIDE_NOT_ALLOWED',
            message: 'Cannot override always-tokenise policy',
          });
        }
        return true;

      case 'never':
        // Override NOT allowed — always pass through
        if (options?.overrideTokenisation === true) {
          throw new BadRequestException({
            code: 'OVERRIDE_NOT_ALLOWED',
            message: 'Cannot override never-tokenise policy',
          });
        }
        return false;

      case 'configurable':
        // Default is tokenise; can be overridden off with a reason
        if (options?.overrideTokenisation === false) {
          if (!options.overrideReason) {
            throw new BadRequestException({
              code: 'OVERRIDE_REASON_REQUIRED',
              message: 'A reason is required when overriding tokenisation on a configurable policy',
            });
          }
          return false;
        }
        return true;

      default:
        return true;
    }
  }

  /**
   * Tokenise all entity fields: find-or-create tokens via RLS transaction.
   * Returns deep-copied data with fields replaced by tokens, the reverse map,
   * and the list of token record IDs (for audit logging).
   */
  private async tokeniseEntities(
    tenantId: string,
    data: GdprOutboundData,
  ): Promise<{
    processedData: GdprOutboundData;
    tokenMap: Record<string, string>;
    tokenIds: string[];
  }> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const result = await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      const tokenMap: Record<string, string> = {};
      const tokenIds: string[] = [];

      // Deep copy entities with tokenised field values
      const processedEntities = await Promise.all(
        data.entities.map(async (entity) => {
          const tokenisedFields: Record<string, string> = {};

          for (const [fieldType, realValue] of Object.entries(entity.fields)) {
            // Find existing token
            const existing = await db.gdprAnonymisationToken.findFirst({
              where: {
                tenant_id: tenantId,
                entity_type: entity.type,
                entity_id: entity.id,
                field_type: fieldType,
              },
            });

            if (existing) {
              // Reuse and update last_used_at
              await db.gdprAnonymisationToken.update({
                where: { id: existing.id },
                data: { last_used_at: new Date() },
              });
              tokenisedFields[fieldType] = existing.token;
              tokenMap[existing.token] = realValue;
              tokenIds.push(existing.id);
            } else {
              // Create new token
              const newToken = this.generateToken();
              const created = await db.gdprAnonymisationToken.create({
                data: {
                  tenant_id: tenantId,
                  entity_type: entity.type,
                  entity_id: entity.id,
                  field_type: fieldType,
                  token: newToken,
                },
              });
              tokenisedFields[fieldType] = newToken;
              tokenMap[newToken] = realValue;
              tokenIds.push(created.id);
            }
          }

          return {
            type: entity.type as 'student' | 'parent' | 'staff' | 'household',
            id: entity.id,
            fields: tokenisedFields,
          };
        }),
      );

      return {
        processedData: {
          entities: processedEntities,
          entityCount: data.entityCount,
        },
        tokenMap,
        tokenIds,
      };
    });

    return result as {
      processedData: GdprOutboundData;
      tokenMap: Record<string, string>;
      tokenIds: string[];
    };
  }
}
