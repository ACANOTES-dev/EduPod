import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { MOCK_FACADE_PROVIDERS, StaffProfileReadFacade } from '../../common/tests/mock-facades';
import { PrismaService } from '../prisma/prisma.service';

import { StaffPreferencesService } from './staff-preferences.service';

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  }),
}));

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const STAFF_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const ACADEMIC_YEAR_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const PREF_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

describe('StaffPreferencesService', () => {
  let service: StaffPreferencesService;
  let mockStaffProfileFacade: { findByUserId: jest.Mock };
  let mockPrisma: {
    staffSchedulingPreference: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    staffProfile: { findFirst: jest.Mock };
  };

  beforeEach(async () => {
    mockPrisma = {
      staffSchedulingPreference: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: PREF_ID }),
        update: jest.fn().mockResolvedValue({ id: PREF_ID }),
        delete: jest.fn().mockResolvedValue({ id: PREF_ID }),
      },
      staffProfile: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        StaffPreferencesService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: StaffProfileReadFacade,
          useValue: (mockStaffProfileFacade = { findByUserId: jest.fn().mockResolvedValue(null) }),
        },
      ],
    }).compile();

    service = module.get<StaffPreferencesService>(StaffPreferencesService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── findAll ────────────────────────────────────────────────────────────────

  it('should return preferences for a tenant and academic year', async () => {
    const entries = [{ id: PREF_ID, preference_type: 'time_preference' }];
    mockPrisma.staffSchedulingPreference.findMany.mockResolvedValue(entries);

    const result = await service.findAll(TENANT_ID, ACADEMIC_YEAR_ID);

    expect(result.data).toEqual(entries);
    expect(mockPrisma.staffSchedulingPreference.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenant_id: TENANT_ID, academic_year_id: ACADEMIC_YEAR_ID },
      }),
    );
  });

  it('should filter by staff_profile_id when provided', async () => {
    await service.findAll(TENANT_ID, ACADEMIC_YEAR_ID, STAFF_ID);

    expect(mockPrisma.staffSchedulingPreference.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenant_id: TENANT_ID,
          academic_year_id: ACADEMIC_YEAR_ID,
          staff_profile_id: STAFF_ID,
        },
      }),
    );
  });

  // ─── findOwnPreferences ────────────────────────────────────────────────────

  it('should throw NotFoundException when user has no staff profile', async () => {
    mockPrisma.staffProfile.findFirst.mockResolvedValue(null);

    await expect(service.findOwnPreferences(TENANT_ID, USER_ID, ACADEMIC_YEAR_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should return own preferences when staff profile exists', async () => {
    mockStaffProfileFacade.findByUserId.mockResolvedValue({ id: STAFF_ID });
    mockPrisma.staffSchedulingPreference.findMany.mockResolvedValue([{ id: PREF_ID }]);

    const result = await service.findOwnPreferences(TENANT_ID, USER_ID, ACADEMIC_YEAR_ID);

    expect(result.data).toHaveLength(1);
    expect(mockPrisma.staffSchedulingPreference.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenant_id: TENANT_ID,
          academic_year_id: ACADEMIC_YEAR_ID,
          staff_profile_id: STAFF_ID,
        },
      }),
    );
  });

  // ─── create ─────────────────────────────────────────────────────────────────

  it('should throw ForbiddenException when user lacks both permissions', async () => {
    const dto = {
      staff_profile_id: STAFF_ID,
      academic_year_id: ACADEMIC_YEAR_ID,
      preference_payload: {
        type: 'subject' as const,
        subject_ids: ['sub-1'],
        mode: 'prefer' as const,
      },
      priority: 'medium' as const,
    };

    await expect(service.create(TENANT_ID, USER_ID, dto, [])).rejects.toThrow(ForbiddenException);
  });

  it('should create a preference when user has manage_preferences permission', async () => {
    const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
      createRlsClient: jest.Mock;
    };
    const mockTx = {
      staffSchedulingPreference: {
        create: jest.fn().mockResolvedValue({ id: PREF_ID }),
      },
    };
    createRlsClient.mockReturnValue({
      $transaction: jest
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    });

    const dto = {
      staff_profile_id: STAFF_ID,
      academic_year_id: ACADEMIC_YEAR_ID,
      preference_payload: {
        type: 'subject' as const,
        subject_ids: ['sub-1'],
        mode: 'prefer' as const,
      },
      priority: 'medium' as const,
    };

    const result = await service.create(TENANT_ID, USER_ID, dto, ['schedule.manage_preferences']);

    expect(result).toEqual({ id: PREF_ID });
    expect(mockTx.staffSchedulingPreference.create).toHaveBeenCalled();
  });

  // ─── update ─────────────────────────────────────────────────────────────────

  it('should throw NotFoundException when updating a non-existent preference', async () => {
    mockPrisma.staffSchedulingPreference.findFirst.mockResolvedValue(null);

    await expect(
      service.update(TENANT_ID, USER_ID, PREF_ID, {}, ['schedule.manage_preferences']),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw ForbiddenException when own-only user tries to update another staff preference', async () => {
    mockPrisma.staffSchedulingPreference.findFirst.mockResolvedValue({
      id: PREF_ID,
      staff_profile_id: 'other-staff-id',
    });
    mockStaffProfileFacade.findByUserId.mockResolvedValue({ id: STAFF_ID });

    await expect(
      service.update(TENANT_ID, USER_ID, PREF_ID, {}, ['schedule.manage_own_preferences']),
    ).rejects.toThrow(ForbiddenException);
  });

  // ─── delete ─────────────────────────────────────────────────────────────────

  it('should throw NotFoundException when deleting a non-existent preference', async () => {
    mockPrisma.staffSchedulingPreference.findFirst.mockResolvedValue(null);

    await expect(
      service.delete(TENANT_ID, USER_ID, PREF_ID, ['schedule.manage_preferences']),
    ).rejects.toThrow(NotFoundException);
  });

  it('should delete a preference when user has manage_preferences permission', async () => {
    mockPrisma.staffSchedulingPreference.findFirst.mockResolvedValue({
      id: PREF_ID,
      staff_profile_id: STAFF_ID,
    });

    const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
      createRlsClient: jest.Mock;
    };
    const mockTx = {
      staffSchedulingPreference: {
        delete: jest.fn().mockResolvedValue({ id: PREF_ID }),
      },
    };
    createRlsClient.mockReturnValue({
      $transaction: jest
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    });

    const result = await service.delete(TENANT_ID, USER_ID, PREF_ID, [
      'schedule.manage_preferences',
    ]);

    expect(result).toEqual({ id: PREF_ID });
  });

  it('should throw ForbiddenException when deleting with no permissions', async () => {
    mockPrisma.staffSchedulingPreference.findFirst.mockResolvedValue({
      id: PREF_ID,
      staff_profile_id: STAFF_ID,
    });

    await expect(service.delete(TENANT_ID, USER_ID, PREF_ID, [])).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('should throw ForbiddenException when own-only user tries to delete another staff preference', async () => {
    mockPrisma.staffSchedulingPreference.findFirst.mockResolvedValue({
      id: PREF_ID,
      staff_profile_id: 'other-staff-id',
    });
    mockStaffProfileFacade.findByUserId.mockResolvedValue({ id: STAFF_ID });

    await expect(
      service.delete(TENANT_ID, USER_ID, PREF_ID, ['schedule.manage_own_preferences']),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should allow own-only user to delete their own preference', async () => {
    mockPrisma.staffSchedulingPreference.findFirst.mockResolvedValue({
      id: PREF_ID,
      staff_profile_id: STAFF_ID,
    });
    mockStaffProfileFacade.findByUserId.mockResolvedValue({ id: STAFF_ID });

    const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
      createRlsClient: jest.Mock;
    };
    const mockTx = {
      staffSchedulingPreference: {
        delete: jest.fn().mockResolvedValue({ id: PREF_ID }),
      },
    };
    createRlsClient.mockReturnValue({
      $transaction: jest
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    });

    const result = await service.delete(TENANT_ID, USER_ID, PREF_ID, [
      'schedule.manage_own_preferences',
    ]);

    expect(result).toEqual({ id: PREF_ID });
  });

  // ─── create — self-service branch ──────────────────────────────────────────

  it('should allow own-only user to create their own preference', async () => {
    mockStaffProfileFacade.findByUserId.mockResolvedValue({ id: STAFF_ID });

    const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
      createRlsClient: jest.Mock;
    };
    const mockTx = {
      staffSchedulingPreference: {
        create: jest.fn().mockResolvedValue({ id: PREF_ID }),
      },
    };
    createRlsClient.mockReturnValue({
      $transaction: jest
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    });

    const dto = {
      staff_profile_id: STAFF_ID,
      academic_year_id: ACADEMIC_YEAR_ID,
      preference_payload: {
        type: 'subject' as const,
        subject_ids: ['sub-1'],
        mode: 'prefer' as const,
      },
    };

    const result = await service.create(TENANT_ID, USER_ID, dto, [
      'schedule.manage_own_preferences',
    ]);

    expect(result).toEqual({ id: PREF_ID });
  });

  it('should throw ForbiddenException when own-only user tries to create for another staff member', async () => {
    mockStaffProfileFacade.findByUserId.mockResolvedValue({ id: STAFF_ID });

    const dto = {
      staff_profile_id: 'other-staff-id',
      academic_year_id: ACADEMIC_YEAR_ID,
      preference_payload: {
        type: 'subject' as const,
        subject_ids: ['sub-1'],
        mode: 'prefer' as const,
      },
    };

    await expect(
      service.create(TENANT_ID, USER_ID, dto, ['schedule.manage_own_preferences']),
    ).rejects.toThrow(ForbiddenException);
  });

  it('edge: should throw ForbiddenException when own-only user has no staff profile', async () => {
    mockStaffProfileFacade.findByUserId.mockResolvedValue(null);

    const dto = {
      staff_profile_id: STAFF_ID,
      academic_year_id: ACADEMIC_YEAR_ID,
      preference_payload: {
        type: 'subject' as const,
        subject_ids: ['sub-1'],
        mode: 'prefer' as const,
      },
    };

    await expect(
      service.create(TENANT_ID, USER_ID, dto, ['schedule.manage_own_preferences']),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should use default priority when not provided in create', async () => {
    const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
      createRlsClient: jest.Mock;
    };
    const mockTx = {
      staffSchedulingPreference: {
        create: jest.fn().mockResolvedValue({ id: PREF_ID, priority: 'medium' }),
      },
    };
    createRlsClient.mockReturnValue({
      $transaction: jest
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    });

    const dto = {
      staff_profile_id: STAFF_ID,
      academic_year_id: ACADEMIC_YEAR_ID,
      preference_payload: {
        type: 'subject' as const,
        subject_ids: ['sub-1'],
        mode: 'prefer' as const,
      },
      // no priority — should default to 'medium'
    };

    await service.create(TENANT_ID, USER_ID, dto, ['schedule.manage_preferences']);

    expect(mockTx.staffSchedulingPreference.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ priority: 'medium' }),
      }),
    );
  });

  // ─── update — self-service success branch ──────────────────────────────────

  it('should allow own-only user to update their own preference', async () => {
    mockPrisma.staffSchedulingPreference.findFirst.mockResolvedValue({
      id: PREF_ID,
      staff_profile_id: STAFF_ID,
    });
    mockStaffProfileFacade.findByUserId.mockResolvedValue({ id: STAFF_ID });

    const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
      createRlsClient: jest.Mock;
    };
    const mockTx = {
      staffSchedulingPreference: {
        update: jest.fn().mockResolvedValue({ id: PREF_ID, priority: 'high' }),
      },
    };
    createRlsClient.mockReturnValue({
      $transaction: jest
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    });

    const result = await service.update(TENANT_ID, USER_ID, PREF_ID, { priority: 'high' }, [
      'schedule.manage_own_preferences',
    ]);

    expect(result).toEqual({ id: PREF_ID, priority: 'high' });
  });

  it('should throw ForbiddenException when updating with no permissions', async () => {
    mockPrisma.staffSchedulingPreference.findFirst.mockResolvedValue({
      id: PREF_ID,
      staff_profile_id: STAFF_ID,
    });

    await expect(
      service.update(TENANT_ID, USER_ID, PREF_ID, { priority: 'high' }, []),
    ).rejects.toThrow(ForbiddenException);
  });

  // ─── update — preference_payload field branch ──────────────────────────────

  it('should update preference_type when preference_payload is provided', async () => {
    mockPrisma.staffSchedulingPreference.findFirst.mockResolvedValue({
      id: PREF_ID,
      staff_profile_id: STAFF_ID,
    });

    const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
      createRlsClient: jest.Mock;
    };
    const mockTx = {
      staffSchedulingPreference: {
        update: jest.fn().mockResolvedValue({ id: PREF_ID }),
      },
    };
    createRlsClient.mockReturnValue({
      $transaction: jest
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    });

    await service.update(
      TENANT_ID,
      USER_ID,
      PREF_ID,
      {
        preference_payload: { type: 'day_off' as const, weekday: 5, mode: 'avoid' as const },
      },
      ['schedule.manage_preferences'],
    );

    expect(mockTx.staffSchedulingPreference.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          preference_type: 'day_off',
          preference_payload: expect.objectContaining({ type: 'day_off' }),
        }),
      }),
    );
  });

  it('should update only priority when preference_payload is not provided', async () => {
    mockPrisma.staffSchedulingPreference.findFirst.mockResolvedValue({
      id: PREF_ID,
      staff_profile_id: STAFF_ID,
    });

    const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
      createRlsClient: jest.Mock;
    };
    const mockTx = {
      staffSchedulingPreference: {
        update: jest.fn().mockResolvedValue({ id: PREF_ID, priority: 'low' }),
      },
    };
    createRlsClient.mockReturnValue({
      $transaction: jest
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    });

    await service.update(TENANT_ID, USER_ID, PREF_ID, { priority: 'low' }, [
      'schedule.manage_preferences',
    ]);

    expect(mockTx.staffSchedulingPreference.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { priority: 'low' },
      }),
    );
  });
});
