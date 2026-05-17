import { Injectable } from '@nestjs/common';
import { SentryIssueState } from '@prisma/client';

import { ErrorRedactorService } from '../../platform-error-log/error-redactor.service';

import type { NormalizedSentryIssue, SentryWebhookKind } from './sentry-types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SUPPORTED_KINDS = new Set<string>([
  'event_alert',
  'issue_alert',
  'issue_resolved',
  'metric_alert',
]);

@Injectable()
export class SentryPayloadNormalizerService {
  constructor(private readonly redactor: ErrorRedactorService) {}

  async normalize(
    payload: Record<string, unknown>,
    resourceHeader?: string,
  ): Promise<NormalizedSentryIssue> {
    const kind = normalizeKind(resourceHeader, payload);
    const data = record(payload.data) ?? {};
    const issue = record(data.issue) ?? record(payload.issue) ?? record(payload.group) ?? {};
    const event = record(data.event) ?? record(payload.event) ?? {};
    const tags = await this.redactTags({ ...tagsFrom(issue), ...tagsFrom(event) });
    const issueId =
      stringOf(issue.id) ??
      stringOf(issue.issue_id) ??
      stringOf(issue.shortId) ??
      stringOf(event.groupID) ??
      stringOf(event.event_id) ??
      stringOf(payload.id) ??
      'unknown';
    const title =
      stringOf(issue.title) ??
      stringOf(issue.message) ??
      stringOf(event.title) ??
      stringOf(event.message) ??
      'Sentry issue';
    const firstSeen =
      dateOf(issue.firstSeen) ?? dateOf(issue.first_seen) ?? dateOf(event.datetime) ?? new Date();
    const lastSeen =
      dateOf(issue.lastSeen) ?? dateOf(issue.last_seen) ?? dateOf(event.datetime) ?? new Date();
    const fingerprint = compactStrings(
      arrayOfStrings(event.fingerprint),
      arrayOfStrings(issue.fingerprint),
      [tags.fingerprint, issueId],
    ).slice(0, 10);
    const rawTenant = tags.tenant_id;
    const tenantId = rawTenant && UUID_RE.test(rawTenant) ? rawTenant : undefined;
    const stackSummary = await this.redactOptional(
      stackSummaryFrom(event) ?? stringOf(issue.culprit),
    );
    const breadcrumbSummary = await this.breadcrumbs(event);

    return {
      affected_url: await this.redactOptional(
        tags.url ?? requestUrl(event) ?? stringOf(issue.permalink),
      ),
      affected_user_count: numberOf(issue.userCount) ?? numberOf(issue.user_count) ?? 0,
      breadcrumb_summary: breadcrumbSummary.length ? breadcrumbSummary : undefined,
      component: tags.component ?? tags.module ?? stringOf(issue.logger),
      correlation_ids: compactStrings([tags.correlation_id, tags.request_id, tags.trace_id]),
      culprit: await this.redactOptional(stringOf(issue.culprit)),
      environment: tags.environment ?? stringOf(event.environment),
      event_id: stringOf(event.event_id) ?? stringOf(event.id),
      fingerprint,
      first_seen_at: firstSeen,
      kind,
      last_seen_at: lastSeen,
      level: stringOf(issue.level) ?? stringOf(event.level) ?? tags.level,
      organization: organizationFrom(payload),
      permalink: stringOf(issue.permalink) ?? stringOf(event.web_url) ?? '',
      project: projectFrom(payload, issue, event),
      release: tags.release ?? stringOf(event.release) ?? releaseFromIssue(issue),
      sentry_issue_id: issueId,
      stack_summary: stackSummary,
      state: stateFrom(kind, issue),
      tags,
      tenant_id: tenantId,
      title: (await this.redact(title)).slice(0, 500),
      total_event_count: numberOf(issue.count) ?? numberOf(event.count) ?? 1,
    };
  }

  private async breadcrumbs(
    event: Record<string, unknown>,
  ): Promise<Array<{ category?: string; message: string; timestamp?: string }>> {
    const breadcrumbs = record(event.breadcrumbs);
    const values = arrayOfRecords(breadcrumbs?.values).slice(-10);
    const result: Array<{ category?: string; message: string; timestamp?: string }> = [];
    for (const value of values) {
      const message = stringOf(value.message) ?? stringOf(value.data) ?? stringOf(value.type);
      if (!message) continue;
      result.push({
        category: stringOf(value.category),
        message: (await this.redact(message)).slice(0, 240),
        timestamp: stringOf(value.timestamp),
      });
    }
    return result;
  }

  private async redactTags(tags: Record<string, string>): Promise<Record<string, string>> {
    const entries = await Promise.all(
      Object.entries(tags).map(async ([key, value]) => [
        key.slice(0, 80),
        (await this.redact(value)).slice(0, 500),
      ]),
    );
    return Object.fromEntries(entries);
  }

  private async redactOptional(value?: string): Promise<string | undefined> {
    if (!value) return undefined;
    return (await this.redact(value)).slice(0, 4000);
  }

  private async redact(value: string): Promise<string> {
    return (await this.redactor.redact(value)).redacted;
  }
}

function normalizeKind(
  resourceHeader: string | undefined,
  payload: Record<string, unknown>,
): SentryWebhookKind {
  const resource = resourceHeader?.trim();
  if (resource && SUPPORTED_KINDS.has(resource)) return resource as SentryWebhookKind;
  const action = stringOf(payload.action);
  if (action === 'resolved') return 'issue_resolved';
  if (action === 'event_alert') return 'event_alert';
  if (action === 'metric_alert') return 'metric_alert';
  return 'issue_alert';
}

function stateFrom(kind: SentryWebhookKind, issue: Record<string, unknown>): SentryIssueState {
  if (kind === 'issue_resolved') return SentryIssueState.resolved;
  const status = stringOf(issue.status);
  if (status === 'resolved') return SentryIssueState.resolved;
  if (status === 'ignored') return SentryIssueState.ignored;
  return SentryIssueState.unresolved;
}

function tagsFrom(value: Record<string, unknown>): Record<string, string> {
  const raw = value.tags;
  if (Array.isArray(raw)) {
    return Object.fromEntries(
      raw
        .map((entry) => {
          if (Array.isArray(entry) && entry.length >= 2)
            return [String(entry[0]), String(entry[1])];
          const object = record(entry);
          if (!object) return undefined;
          const key = stringOf(object.key) ?? stringOf(object.name);
          const tagValue = stringOf(object.value);
          return key && tagValue ? [key, tagValue] : undefined;
        })
        .filter((entry): entry is [string, string] => Boolean(entry)),
    );
  }
  const object = record(raw);
  if (!object) return {};
  return Object.fromEntries(
    Object.entries(object)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
      .map(([key, value]) => [key, value]),
  );
}

function stackSummaryFrom(event: Record<string, unknown>): string | undefined {
  const exception = record(event.exception);
  const values = arrayOfRecords(exception?.values);
  const frames = values
    .flatMap((value) => arrayOfRecords(record(value.stacktrace)?.frames))
    .slice(-8);
  const summary = frames
    .map((frame) =>
      [stringOf(frame.filename), stringOf(frame.function), stringOf(frame.lineno)]
        .filter(Boolean)
        .join(':'),
    )
    .filter(Boolean)
    .join('\n');
  return summary || undefined;
}

function requestUrl(event: Record<string, unknown>): string | undefined {
  return stringOf(record(event.request)?.url);
}

function organizationFrom(payload: Record<string, unknown>): string {
  const organization = record(payload.organization) ?? record(record(payload.data)?.organization);
  return stringOf(organization?.slug) ?? stringOf(organization?.id) ?? 'unknown';
}

function projectFrom(
  payload: Record<string, unknown>,
  issue: Record<string, unknown>,
  event: Record<string, unknown>,
): string {
  const project = record(issue.project) ?? record(event.project) ?? record(payload.project);
  return stringOf(project?.slug) ?? stringOf(project?.name) ?? stringOf(project?.id) ?? 'unknown';
}

function releaseFromIssue(issue: Record<string, unknown>): string | undefined {
  return stringOf(record(issue.firstRelease)?.version);
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringOf(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number') return String(value);
  return undefined;
}

function numberOf(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function dateOf(value: unknown): Date | undefined {
  const raw = stringOf(value);
  if (!raw) return undefined;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function arrayOfRecords(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> => Boolean(record(entry)))
    : [];
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function compactStrings(...groups: Array<Array<string | undefined>>): string[] {
  return [...new Set(groups.flat().filter((entry): entry is string => Boolean(entry)))];
}
