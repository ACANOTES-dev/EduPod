/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { NotFoundException } from '@nestjs/common';

jest.mock('../../../common/middleware/rls.middleware', () => {
  const actual = jest.requireActual('../../../common/middleware/rls.middleware');
  return {
    ...actual,
    createRlsClient: jest.fn(),
  };
});

import { createRlsClient } from '../../../common/middleware/rls.middleware';

import {
  TenantMessagingPolicyRepository,
  buildMatrixKey,
} from '../policy/tenant-messaging-policy.repository';

import { InboxSettingsService } from './inbox-settings.service';

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

interface MockTx {
  tenantSettingsInbox: { update: jest.Mock };
  tenantMessagingPolicy: { upsert: jest.Mock };
}

function mockRlsTransaction(tx: MockTx): jest.Mock {
  const txFn = jest.fn(async (fn: (tx: MockTx) => Promise<unknown>) => fn(tx));
  (createRlsClient as jest.Mock).mockReturnValue({ $transaction: txFn });
  return txFn;
}

function buildSettingsRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'settings-1',
    tenant_id: TENANT_A,
    messaging_enabled: true,
    students_can_initiate: false,
    parents_can_initiate: false,
    parent_to_parent_messaging: false,
    student_to_student_messaging: false,
    student_to_parent_messaging: false,
    require_admin_approval_for_parent_to_teacher: false,
    edit_window_minutes: 10,
    retention_days: null,
    fallback_admin_enabled: true,
    fallback_admin_after_hours: 24,
    fallback_admin_channels: ['email'],
    fallback_teacher_enabled: true,
    fallback_teacher_after_hours: 3,
    fallback_teacher_channels: ['email'],
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('InboxSettingsService — writes (impl 13)', () => {
  let service: InboxSettingsService;
  let prisma: {
    tenantSettingsInbox: { findUnique: jest.Mock };
  };
  let repo: {
    getMatrix: jest.Mock;
    resetToDefaults: jest.Mock;
    invalidate: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      tenantSettingsInbox: {
        findUnique: jest.fn().mockResolvedValue(buildSettingsRow()),
      },
    };
    repo = {
      getMatrix: jest.fn().mockResolvedValue(
        new Map([
          [buildMatrixKey('teacher', 'parent'), true],
          [buildMatrixKey('parent', 'teacher'), true],
        ]),
      ),
      resetToDefaults: jest.fn().mockResolvedValue(undefined),
      invalidate: jest.fn(),
    };
    service = new InboxSettingsService(
      prisma as never,
      repo as unknown as TenantMessagingPolicyRepository,
    );
  });

  describe('updateInboxSettings', () => {
    it('updates the row via RLS transaction and returns the result', async () => {
      const updatedRow = buildSettingsRow({ edit_window_minutes: 15 });
      const tx: MockTx = {
        tenantSettingsInbox: { update: jest.fn().mockResolvedValue(updatedRow) },
        tenantMessagingPolicy: { upsert: jest.fn() },
      };
      mockRlsTransaction(tx);

      const result = await service.updateInboxSettings(TENANT_A, { edit_window_minutes: 15 });

      expect(createRlsClient).toHaveBeenCalledWith(prisma, { tenant_id: TENANT_A });
      expect(tx.tenantSettingsInbox.update).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_A },
        data: { edit_window_minutes: 15 },
      });
      expect(result).toEqual(updatedRow);
    });

    it('throws NOT_FOUND when the settings row does not exist', async () => {
      prisma.tenantSettingsInbox.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.updateInboxSettings(TENANT_A, { messaging_enabled: false }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(createRlsClient).not.toHaveBeenCalled();
    });
  });

  describe('updatePolicyMatrix', () => {
    it('upserts each cell and invalidates the tenant cache', async () => {
      const tx: MockTx = {
        tenantSettingsInbox: { update: jest.fn() },
        tenantMessagingPolicy: { upsert: jest.fn().mockResolvedValue({}) },
      };
      mockRlsTransaction(tx);

      const result = await service.updatePolicyMatrix(TENANT_A, {
        cells: [
          { sender_role: 'teacher', recipient_role: 'parent', allowed: true },
          { sender_role: 'parent', recipient_role: 'teacher', allowed: false },
        ],
      });

      expect(tx.tenantMessagingPolicy.upsert).toHaveBeenCalledTimes(2);
      expect(repo.invalidate).toHaveBeenCalledWith(TENANT_A);
      expect(Object.keys(result)).toHaveLength(9);
      expect(result.teacher.parent).toBe(true);
    });
  });

  describe('resetPolicyMatrix', () => {
    it('delegates to the repository and returns a fresh matrix', async () => {
      const result = await service.resetPolicyMatrix(TENANT_A);
      expect(repo.resetToDefaults).toHaveBeenCalledWith(TENANT_A);
      expect(repo.getMatrix).toHaveBeenCalledWith(TENANT_A);
      expect(Object.keys(result)).toHaveLength(9);
    });
  });
});
