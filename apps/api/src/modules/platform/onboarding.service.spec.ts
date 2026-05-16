import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PlatformAuditService } from '../platform-audit/platform-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantReadFacade } from '../tenants/tenant-read.facade';

import {
  DEFAULT_ONBOARDING_STEPS,
  OnboardingService,
  type OnboardingStepWithCompleter,
} from './onboarding.service';
import { RedisPubSubService } from './redis-pubsub.service';

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn(),
}));

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const STEP_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const mockCreateRlsClient = createRlsClient as jest.Mock;

function buildStep(
  overrides: Partial<OnboardingStepWithCompleter> = {},
): OnboardingStepWithCompleter {
  return {
    id: STEP_ID,
    tenant_id: TENANT_ID,
    phase: 'data',
    step_key: 'students_imported',
    label: 'Student data imported',
    description: 'Student records have been imported into the system.',
    status: 'pending',
    is_auto: false,
    blocked_by: [],
    completed_at: null,
    completed_by: null,
    metadata: null,
    sort_order: 8,
    created_at: new Date('2026-05-16T10:00:00.000Z'),
    updated_at: new Date('2026-05-16T10:00:00.000Z'),
    completer: null,
    ...overrides,
  };
}

function buildMockPrisma() {
  return {
    tenant: {
      findUnique: jest.fn(),
    },
    tenantOnboardingStep: {
      count: jest.fn(),
      createMany: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    membershipRole: {
      findFirst: jest.fn(),
    },
  };
}

describe('OnboardingService', () => {
  let service: OnboardingService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockRedisPubSub: { publish: jest.Mock };
  let mockTenantReadFacade: { existsOrThrow: jest.Mock };
  let mockPlatformAuditService: { log: jest.Mock };

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRedisPubSub = { publish: jest.fn().mockResolvedValue(undefined) };
    mockTenantReadFacade = {
      existsOrThrow: jest.fn().mockResolvedValue(undefined),
    };
    mockPlatformAuditService = { log: jest.fn().mockResolvedValue(undefined) };
    mockCreateRlsClient.mockReturnValue({
      $transaction: jest.fn((callback: (tx: typeof mockPrisma) => unknown) => callback(mockPrisma)),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnboardingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisPubSubService, useValue: mockRedisPubSub },
        { provide: TenantReadFacade, useValue: mockTenantReadFacade },
        { provide: PlatformAuditService, useValue: mockPlatformAuditService },
      ],
    }).compile();

    service = module.get<OnboardingService>(OnboardingService);
  });

  afterEach(() => jest.clearAllMocks());

  it('seeds the 15 default onboarding steps', async () => {
    mockPrisma.tenantOnboardingStep.createMany.mockResolvedValueOnce({ count: 15 });

    await service.seedDefaultSteps(TENANT_ID);

    expect(mockPrisma.tenantOnboardingStep.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          tenant_id: TENANT_ID,
          step_key: 'domain_configured',
          status: 'pending',
        }),
      ]),
      skipDuplicates: true,
    });
    const call = mockPrisma.tenantOnboardingStep.createMany.mock.calls[0]?.[0];
    expect((call as { data: unknown[] } | undefined)?.data).toHaveLength(
      DEFAULT_ONBOARDING_STEPS.length,
    );
  });

  it('returns steps with a completion summary and phase grouping', async () => {
    mockPrisma.tenantOnboardingStep.findFirst.mockResolvedValueOnce(null);
    mockPrisma.tenantOnboardingStep.findMany.mockResolvedValueOnce([
      buildStep({ step_key: 'a', status: 'completed', phase: 'infrastructure' }),
      buildStep({ id: 'step-b', step_key: 'b', status: 'completed', phase: 'data' }),
      buildStep({ id: 'step-c', step_key: 'c', status: 'pending', phase: 'data' }),
    ]);

    const result = await service.getForTenant(TENANT_ID);

    expect(result.summary).toMatchObject({
      total: 3,
      completed: 2,
      pending: 1,
      percent_complete: 67,
    });
    expect(result.phases.infrastructure).toHaveLength(1);
    expect(result.phases.data).toHaveLength(2);
  });

  it('rejects completing a step while blockers are incomplete', async () => {
    mockPrisma.tenantOnboardingStep.findFirst.mockResolvedValueOnce(
      buildStep({
        step_key: 'parents_imported',
        blocked_by: ['students_imported'],
      }),
    );
    mockPrisma.tenantOnboardingStep.count.mockResolvedValueOnce(1);
    mockPrisma.tenantOnboardingStep.findMany.mockResolvedValueOnce([
      { step_key: 'students_imported' },
    ]);

    await expect(
      service.updateStep(TENANT_ID, STEP_ID, { status: 'completed' }, USER_ID),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows completing a step when blockers are complete', async () => {
    const step = buildStep({
      step_key: 'parents_imported',
      blocked_by: ['students_imported'],
    });
    mockPrisma.tenantOnboardingStep.findFirst.mockResolvedValueOnce(step);
    mockPrisma.tenantOnboardingStep.count.mockResolvedValueOnce(0);
    mockPrisma.tenantOnboardingStep.update.mockResolvedValueOnce({
      ...step,
      status: 'completed',
      completed_by: USER_ID,
    });

    await expect(
      service.updateStep(TENANT_ID, STEP_ID, { status: 'completed' }, USER_ID),
    ).resolves.toMatchObject({ status: 'completed' });

    expect(mockRedisPubSub.publish).toHaveBeenCalledWith(
      'platform:onboarding',
      expect.objectContaining({
        type: 'step_updated',
        tenant_id: TENANT_ID,
        step_id: STEP_ID,
        new_status: 'completed',
      }),
    );
  });

  it('auto-completes an incomplete step', async () => {
    const step = buildStep({ step_key: 'domain_configured', is_auto: true });
    mockPrisma.tenantOnboardingStep.findFirst.mockResolvedValueOnce(step);
    mockPrisma.tenantOnboardingStep.update.mockResolvedValueOnce({
      ...step,
      status: 'completed',
    });

    await service.autoCompleteStep(TENANT_ID, 'domain_configured', { domain: 'school.test' });

    expect(mockPrisma.tenantOnboardingStep.update).toHaveBeenCalledWith({
      where: { id: STEP_ID },
      data: expect.objectContaining({
        status: 'completed',
        metadata: { domain: 'school.test' },
      }),
    });
    expect(mockRedisPubSub.publish).toHaveBeenCalledWith(
      'platform:onboarding',
      expect.objectContaining({
        type: 'step_auto_completed',
        step_key: 'domain_configured',
      }),
    );
  });

  it('does nothing when auto-completing an already completed or missing step', async () => {
    mockPrisma.tenantOnboardingStep.findFirst.mockResolvedValueOnce(null);

    await service.autoCompleteStep(TENANT_ID, 'domain_configured');

    expect(mockPrisma.tenantOnboardingStep.update).not.toHaveBeenCalled();
    expect(mockRedisPubSub.publish).not.toHaveBeenCalled();
  });

  it('resets all steps for a tenant', async () => {
    mockPrisma.tenantOnboardingStep.updateMany.mockResolvedValueOnce({ count: 15 });

    await service.resetForTenant(TENANT_ID);

    expect(mockPrisma.tenantOnboardingStep.updateMany).toHaveBeenCalledWith({
      where: { tenant_id: TENANT_ID },
      data: expect.objectContaining({
        status: 'pending',
        completed_at: null,
        completed_by: null,
      }),
    });
    expect(mockRedisPubSub.publish).toHaveBeenCalledWith(
      'platform:onboarding',
      expect.objectContaining({ type: 'tracker_reset', tenant_id: TENANT_ID }),
    );
  });

  it('auto-completes owner account on read when an owner membership exists', async () => {
    mockPrisma.tenantOnboardingStep.findFirst
      .mockResolvedValueOnce({ id: STEP_ID })
      .mockResolvedValueOnce(buildStep({ step_key: 'owner_account_created', is_auto: true }));
    mockPrisma.membershipRole.findFirst.mockResolvedValueOnce({ membership_id: 'membership-1' });
    mockPrisma.tenantOnboardingStep.update.mockResolvedValueOnce(
      buildStep({ step_key: 'owner_account_created', status: 'completed' }),
    );
    mockPrisma.tenantOnboardingStep.findMany.mockResolvedValueOnce([
      buildStep({ step_key: 'owner_account_created', status: 'completed' }),
    ]);

    await service.getForTenant(TENANT_ID);

    expect(mockCreateRlsClient).toHaveBeenCalledWith(mockPrisma, { tenant_id: TENANT_ID });
    expect(mockPrisma.membershipRole.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenant_id: TENANT_ID,
          role: { role_key: { in: ['school_principal', 'school_owner'] } },
        }),
      }),
    );
    expect(mockPrisma.tenantOnboardingStep.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'completed' }),
      }),
    );
  });
});
