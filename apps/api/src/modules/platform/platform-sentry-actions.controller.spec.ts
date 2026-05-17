import { NotFoundException } from '@nestjs/common';
import { PlatformAuditAction } from '@prisma/client';

import { PlatformSentryActionsController } from './platform-sentry-actions.controller';

describe('PlatformSentryActionsController', () => {
  it('starts an explain conversation without sending a model message', async () => {
    const prisma = {
      platformSentryIssue: { findUnique: jest.fn().mockResolvedValue({ id: 'issue-1' }) },
    } as never;
    const copilot = { startConversation: jest.fn().mockResolvedValue({ id: 'conversation-1' }) };
    const controller = new PlatformSentryActionsController(
      prisma,
      copilot as never,
      { forSentryIssue: jest.fn() } as never,
      { log: jest.fn() } as never,
    );

    await expect(controller.explain('issue-1', { sub: 'user-1' })).resolves.toEqual({
      id: 'conversation-1',
    });
    expect(copilot.startConversation).toHaveBeenCalledWith({
      context: { id: 'issue-1', kind: 'sentry_issue' },
      type: 'diagnostic',
      user_id: 'user-1',
    });
  });

  it('generates a static handoff prompt and writes platform audit', async () => {
    const prisma = {
      platformAgentHandoffPrompt: {
        create: jest.fn().mockResolvedValue({ id: 'handoff-1', prompt_markdown: 'Prompt' }),
      },
      platformSentryIssue: {
        findUnique: jest.fn().mockResolvedValue({
          environment: 'production',
          id: 'issue-1',
          level: 'error',
          release: 'web@1',
          sentry_issue_id: 'SENTRY-1',
          state: 'unresolved',
          title: 'Admin failed',
        }),
      },
    } as never;
    const evidence = {
      forSentryIssue: jest.fn().mockResolvedValue({
        items: [
          {
            id: 'issue-1',
            kind: 'sentry_issue',
            summary: 'Admin failed',
            title: 'Sentry issue',
          },
        ],
      }),
    };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const controller = new PlatformSentryActionsController(
      prisma,
      { startConversation: jest.fn() } as never,
      evidence as never,
      audit as never,
    );

    await expect(
      controller.generateHandoff('issue-1', { email: 'admin@example.com', sub: 'user-1' }, {
        headers: {},
        ip: '127.0.0.1',
      } as never),
    ).resolves.toEqual({ id: 'handoff-1', prompt_markdown: 'Prompt' });
    expect(prisma.platformAgentHandoffPrompt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        created_by_user_id: 'user-1',
        suspected_repo_areas: expect.any(Array),
      }),
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: PlatformAuditAction.sentry_agent_handoff_generated,
        target_resource_type: 'platform_sentry_issue',
      }),
    );
  });

  it('throws when the mirrored issue is missing', async () => {
    const prisma = {
      platformSentryIssue: { findUnique: jest.fn().mockResolvedValue(null) },
    } as never;
    const controller = new PlatformSentryActionsController(
      prisma,
      { startConversation: jest.fn() } as never,
      { forSentryIssue: jest.fn() } as never,
      { log: jest.fn() } as never,
    );

    await expect(controller.explain('missing', { sub: 'user-1' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
