import { PlatformAuditAction } from '@prisma/client';

import { SentryIssuesController } from './sentry-issues.controller';

describe('SentryIssuesController', () => {
  it('delegates list, detail, audit, and prompt preparation with audit logging', async () => {
    const sentryIssues = {
      audit: jest.fn().mockResolvedValue({ data: [], meta: { page: 1, pageSize: 20, total: 0 } }),
      get: jest.fn().mockResolvedValue({ id: 'issue-1' }),
      list: jest.fn().mockResolvedValue({ data: [], meta: { page: 1, pageSize: 20, total: 0 } }),
      preparePrompt: jest.fn().mockResolvedValue({ prompt_markdown: 'Prompt' }),
    } as never;
    const audit = { log: jest.fn().mockResolvedValue(undefined) } as never;
    const controller = new SentryIssuesController(sentryIssues, audit);
    const user = { email: 'admin@example.com', sub: 'user-1' };
    const request = { headers: {}, ip: '127.0.0.1' } as never;

    await expect(controller.list({ page: 1, pageSize: 20, q: 'payment' })).resolves.toMatchObject({
      meta: { total: 0 },
    });
    await expect(controller.get('11111111-1111-4111-8111-111111111111')).resolves.toEqual({
      id: 'issue-1',
    });
    await expect(
      controller.auditRows({ page: 1, pageSize: 20, signature_valid: true }),
    ).resolves.toMatchObject({ meta: { total: 0 } });
    await expect(
      controller.preparePrompt('11111111-1111-4111-8111-111111111111', user, request),
    ).resolves.toEqual({ prompt_markdown: 'Prompt' });

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: PlatformAuditAction.sentry_triage_prompt_prepared,
        target_resource_id: '11111111-1111-4111-8111-111111111111',
      }),
    );
  });
});
