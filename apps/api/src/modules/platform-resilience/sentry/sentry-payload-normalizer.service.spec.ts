import type { ErrorRedactorService } from '../../platform-error-log/error-redactor.service';

import { SentryPayloadNormalizerService } from './sentry-payload-normalizer.service';

describe('SentryPayloadNormalizerService', () => {
  it('keeps only normalized and redacted Sentry fields', async () => {
    const redactor: ErrorRedactorService = {
      redact: jest.fn(async (value: string) => ({
        redacted: value.replace(/ram@example\.com/g, '[EMAIL]'),
        rules_applied: ['email'],
      })),
    } as ErrorRedactorService;
    const service = new SentryPayloadNormalizerService(redactor);

    const result = await service.normalize(
      {
        action: 'created',
        data: {
          event: {
            event_id: 'event-1',
            exception: {
              values: [
                {
                  stacktrace: {
                    frames: [
                      { filename: 'apps/api/src/main.ts', function: 'bootstrap', lineno: 23 },
                    ],
                  },
                },
              ],
            },
            tags: { correlation_id: 'corr-1', environment: 'production', release: 'abc1234' },
          },
          issue: {
            count: 5,
            firstSeen: '2026-05-17T10:00:00.000Z',
            id: '123',
            lastSeen: '2026-05-17T11:00:00.000Z',
            level: 'error',
            permalink: 'https://sentry.example/issues/123',
            title: 'Boom for ram@example.com',
            userCount: 2,
          },
        },
        organization: { slug: 'edupod' },
      },
      'issue_alert',
    );

    expect(result.sentry_issue_id).toBe('123');
    expect(result.title).toBe('Boom for [EMAIL]');
    expect(result.release).toBe('abc1234');
    expect(result.correlation_ids).toEqual(['corr-1']);
    expect(result.stack_summary).toContain('apps/api/src/main.ts:bootstrap:23');
    expect(JSON.stringify(result)).not.toContain('ram@example.com');
  });

  it.each([
    ['issue_alert', 'unresolved'],
    ['event_alert', 'unresolved'],
    ['metric_alert', 'unresolved'],
    ['issue_resolved', 'resolved'],
  ])('normalizes %s payload kind', async (kind, expectedState) => {
    const redactor: ErrorRedactorService = {
      redact: jest.fn(async (value: string) => ({ redacted: value, rules_applied: [] })),
    } as ErrorRedactorService;
    const service = new SentryPayloadNormalizerService(redactor);

    const result = await service.normalize(
      {
        data: {
          event: { event_id: 'event-1', tags: { environment: 'production' } },
          issue: { id: 'ISSUE-1', title: 'Boom' },
        },
        organization: { slug: 'edupod' },
      },
      kind,
    );

    expect(result.kind).toBe(kind);
    expect(result.state).toBe(expectedState);
    expect(result.sentry_issue_id).toBe('ISSUE-1');
  });

  it('normalizes Sentry fallback shapes, array tags, and breadcrumbs', async () => {
    const redactor: ErrorRedactorService = {
      redact: jest.fn(async (value: string) => ({ redacted: value, rules_applied: [] })),
    } as ErrorRedactorService;
    const service = new SentryPayloadNormalizerService(redactor);

    const result = await service.normalize({
      action: 'event_alert',
      event: {
        breadcrumbs: {
          values: [
            { category: 'ui.click', message: 'clicked retry', timestamp: '2026-05-17T10:05:00Z' },
          ],
        },
        count: '4',
        environment: 'production',
        fingerprint: ['fallback-fingerprint'],
        groupID: 'GROUP-1',
        id: 'event-fallback',
        request: { url: 'https://dua.edupod.app/en/admin/sentry' },
        title: 'Fallback event',
        web_url: 'https://sentry.example/events/event-fallback',
      },
      group: {
        firstRelease: { version: 'web@fallback' },
        logger: 'platform',
        project: { id: 42 },
        status: 'ignored',
        tags: [
          ['tenant_id', '11111111-1111-4111-8111-111111111111'],
          { key: 'component', value: 'platform-dashboard' },
        ],
      },
      project: { name: 'fallback-project' },
    });

    expect(result.affected_url).toBe('https://dua.edupod.app/en/admin/sentry');
    expect(result.breadcrumb_summary).toEqual([
      {
        category: 'ui.click',
        message: 'clicked retry',
        timestamp: '2026-05-17T10:05:00Z',
      },
    ]);
    expect(result.component).toBe('platform-dashboard');
    expect(result.project).toBe('42');
    expect(result.release).toBe('web@fallback');
    expect(result.state).toBe('ignored');
    expect(result.tenant_id).toBe('11111111-1111-4111-8111-111111111111');
    expect(result.total_event_count).toBe(4);
  });
});
