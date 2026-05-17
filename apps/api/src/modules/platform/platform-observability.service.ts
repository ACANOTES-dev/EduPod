import { createHash } from 'crypto';
import { readdir, readFile } from 'fs/promises';
import { join, relative } from 'path';

import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type PlatformDeployEvent } from '@prisma/client';

import type {
  CreatePlatformDeployEventDto,
  ListPlatformDeployEventsQuery,
  PlatformRunbookQuery,
  PlatformSeverityPolicyQuery,
  PlatformTopologyQuery,
} from '@school/shared';

import { PrismaService } from '../prisma/prisma.service';

import { SERVICE_TOPOLOGY_SEED, SEVERITY_POLICY_SEED } from './observability-seed';

const RUNBOOK_INDEX_INTERVAL_MS = 60 * 60 * 1000;
const RUNBOOK_INDEX_HOUR_UTC = 2;

type FrontMatterValue = string | string[];
type FrontMatter = Record<string, FrontMatterValue>;

@Injectable()
export class PlatformObservabilityService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PlatformObservabilityService.name);
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private lastRunbookIndexDay: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.seedOperatorFacts();
    } catch (err: unknown) {
      this.logger.warn('Platform observability seed failed; continuing startup', err);
    }
    this.intervalHandle = setInterval(() => {
      void this.runDueRunbookIndex();
    }, RUNBOOK_INDEX_INTERVAL_MS);
    void this.indexRunbooks();
  }

  onModuleDestroy(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  async listCorrelationEvents(correlationId: string) {
    return this.prisma.platformCorrelationEvent.findMany({
      where: { correlation_id: correlationId },
      orderBy: { occurred_at: 'asc' },
      take: 200,
    });
  }

  async listDeploys(query: ListPlatformDeployEventsQuery): Promise<{
    data: PlatformDeployEvent[];
    meta: { page: number; pageSize: number; total: number };
  }> {
    const where: Prisma.PlatformDeployEventWhereInput = {};
    if (query.status) where.status = query.status;
    const skip = (query.page - 1) * query.pageSize;
    const [data, total] = await Promise.all([
      this.prisma.platformDeployEvent.findMany({
        where,
        orderBy: { deployed_at: 'desc' },
        skip,
        take: query.pageSize,
      }),
      this.prisma.platformDeployEvent.count({ where }),
    ]);
    return { data, meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  async getDeploy(id: string) {
    const deploy = await this.prisma.platformDeployEvent.findUnique({ where: { id } });
    if (!deploy) {
      throw new NotFoundException({
        code: 'PLATFORM_DEPLOY_EVENT_NOT_FOUND',
        message: `Platform deploy event "${id}" not found`,
      });
    }
    return deploy;
  }

  async captureDeploy(dto: CreatePlatformDeployEventDto): Promise<PlatformDeployEvent> {
    return this.prisma.platformDeployEvent.create({
      data: {
        sha: dto.sha,
        short_sha: dto.short_sha,
        deploy_run_url: dto.deploy_run_url,
        deploy_run_id: dto.deploy_run_id,
        migration_version: dto.migration_version,
        status: dto.status,
        duration_seconds: dto.duration_seconds,
        rollback_of_id: dto.rollback_of_id,
        commit_message: dto.commit_message,
        commit_author_email: dto.commit_author_email,
        failure_reason: dto.failure_reason,
      },
    });
  }

  async listRunbooks(query: PlatformRunbookQuery) {
    const where: Prisma.PlatformRunbookIndexWhereInput = {};
    if (query.component) where.components = { has: query.component };
    if (query.alert_key) where.alert_keys = { has: query.alert_key };
    if (query.severity) where.severity = query.severity;
    if (query.tag) where.tags = { has: query.tag };
    return this.prisma.platformRunbookIndex.findMany({
      where,
      orderBy: [{ severity: 'asc' }, { title: 'asc' }],
    });
  }

  async listTopology(query: PlatformTopologyQuery) {
    const where: Prisma.PlatformServiceTopologyWhereInput = {};
    if (query.kind) where.kind = query.kind;
    if (query.component) where.related_components = { has: query.component };
    if (query.queue) where.related_queue_names = { has: query.queue };
    if (query.module_key) where.related_module_keys = { has: query.module_key };
    return this.prisma.platformServiceTopology.findMany({
      where,
      orderBy: [{ kind: 'asc' }, { display_name: 'asc' }],
    });
  }

  async listSeverityPolicies(query: PlatformSeverityPolicyQuery) {
    const where: Prisma.PlatformSeverityPolicyWhereInput = {};
    if (query.component) where.component = query.component;
    if (query.product_area) where.product_area = query.product_area;
    if (query.severity) where.severity = query.severity;
    return this.prisma.platformSeverityPolicy.findMany({
      where,
      orderBy: [{ severity: 'asc' }, { title: 'asc' }],
    });
  }

  verifyInternalToken(token: string | undefined): boolean {
    const expected =
      this.configService.get<string>('DEPLOY_EVENT_INTERNAL_TOKEN') ??
      this.configService.get<string>('JWT_SECRET');
    return Boolean(expected && token && token === expected);
  }

  async runDueRunbookIndex(now = new Date()): Promise<void> {
    const dayKey = now.toISOString().slice(0, 10);
    if (now.getUTCHours() < RUNBOOK_INDEX_HOUR_UTC || this.lastRunbookIndexDay === dayKey) {
      return;
    }
    await this.indexRunbooks();
    this.lastRunbookIndexDay = dayKey;
  }

  async indexRunbooks(): Promise<{ indexed: number; skipped: number }> {
    let indexed = 0;
    let skipped = 0;

    let names: string[];
    let root = process.cwd();
    let runbookDir = join(root, 'docs', 'runbooks');
    try {
      const located = await locateRunbookDirectory();
      root = located.root;
      runbookDir = located.runbookDir;
      names = located.names;
    } catch (err: unknown) {
      this.logger.warn('Runbook directory unavailable for indexing', err);
      return { indexed, skipped };
    }

    for (const name of names.filter((entry) => entry.endsWith('.md'))) {
      const absolutePath = join(runbookDir, name);
      const path = relative(root, absolutePath);
      try {
        const content = await readFile(absolutePath, 'utf8');
        const parsed = parseFrontMatter(content);
        if (!parsed) {
          skipped += 1;
          continue;
        }
        const contentSha = createHash('sha256').update(content).digest('hex');
        const title = stringValue(parsed, 'title') ?? name.replace(/\\.md$/, '');
        await this.prisma.platformRunbookIndex.upsert({
          where: { path },
          create: {
            path,
            title,
            description: stringValue(parsed, 'description'),
            alert_keys: arrayValue(parsed, 'alert_keys'),
            audit_actions: arrayValue(parsed, 'audit_actions'),
            error_fingerprints: arrayValue(parsed, 'error_fingerprints'),
            components: arrayValue(parsed, 'components'),
            severity: stringValue(parsed, 'severity'),
            tags: arrayValue(parsed, 'tags'),
            raw_front_matter: toJson(parsed),
            content_sha: contentSha,
          },
          update: {
            title,
            description: stringValue(parsed, 'description'),
            alert_keys: arrayValue(parsed, 'alert_keys'),
            audit_actions: arrayValue(parsed, 'audit_actions'),
            error_fingerprints: arrayValue(parsed, 'error_fingerprints'),
            components: arrayValue(parsed, 'components'),
            severity: stringValue(parsed, 'severity'),
            tags: arrayValue(parsed, 'tags'),
            raw_front_matter: toJson(parsed),
            content_sha: contentSha,
            indexed_at: new Date(),
          },
        });
        indexed += 1;
      } catch (err: unknown) {
        skipped += 1;
        this.logger.warn(`Skipped runbook "${path}" during indexing`, err);
      }
    }

    return { indexed, skipped };
  }

  private async seedOperatorFacts(): Promise<void> {
    await Promise.all([
      ...SERVICE_TOPOLOGY_SEED.map((entry) =>
        this.prisma.platformServiceTopology.upsert({
          where: { key: entry.key },
          create: entry,
          update: entry,
        }),
      ),
      ...SEVERITY_POLICY_SEED.map((entry) =>
        this.prisma.platformSeverityPolicy.upsert({
          where: { key: entry.key },
          create: entry,
          update: entry,
        }),
      ),
    ]);
  }
}

function parseFrontMatter(content: string): FrontMatter | null {
  if (!content.startsWith('---\n')) return null;
  const endIndex = content.indexOf('\n---', 4);
  if (endIndex === -1) return null;
  const raw = content.slice(4, endIndex).trim();
  const out: FrontMatter = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separatorIndex = trimmed.indexOf(':');
    if (separatorIndex === -1) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    out[key] = parseFrontMatterValue(value);
  }
  return Object.keys(out).length > 0 ? out : null;
}

function parseFrontMatterValue(value: string): FrontMatterValue {
  if (value.startsWith('[') && value.endsWith(']')) {
    return value
      .slice(1, -1)
      .split(',')
      .map((entry) => entry.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);
  }
  return value.replace(/^['"]|['"]$/g, '');
}

function arrayValue(frontMatter: FrontMatter, key: string): string[] {
  const value = frontMatter[key];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.length > 0) return [value];
  return [];
}

function stringValue(frontMatter: FrontMatter, key: string): string | undefined {
  const value = frontMatter[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}

async function locateRunbookDirectory(): Promise<{
  names: string[];
  root: string;
  runbookDir: string;
}> {
  const cwd = process.cwd();
  const candidateRoots = [cwd, join(cwd, '..', '..')];
  let lastError: unknown;
  for (const root of candidateRoots) {
    const runbookDir = join(root, 'docs', 'runbooks');
    try {
      const names = await readdir(runbookDir);
      return { names, root, runbookDir };
    } catch (err: unknown) {
      lastError = err;
    }
  }
  throw lastError;
}
