import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, type TenantOnboardingStep } from '@prisma/client';

import type { UpdateOnboardingStepDto } from '@school/shared';

import { PrismaService } from '../prisma/prisma.service';
import { RbacReadFacade } from '../rbac/rbac-read.facade';
import { TenantReadFacade } from '../tenants/tenant-read.facade';

import { RedisPubSubService } from './redis-pubsub.service';

export const DEFAULT_ONBOARDING_STEPS = [
  {
    phase: 'infrastructure',
    step_key: 'domain_configured',
    label: 'Custom domain added',
    description: 'A custom domain has been configured for this tenant.',
    is_auto: true,
    blocked_by: [],
    sort_order: 1,
  },
  {
    phase: 'infrastructure',
    step_key: 'ssl_verified',
    label: 'SSL certificate active',
    description: 'SSL certificate has been provisioned and is active for the custom domain.',
    is_auto: true,
    blocked_by: ['domain_configured'],
    sort_order: 2,
  },
  {
    phase: 'infrastructure',
    step_key: 'modules_configured',
    label: 'Module toggle rows complete',
    description:
      'All 20 gateable modules from the Module Gating canonical registry have explicit toggle rows for this tenant. Auto-completes via TenantModuleService.assertCompleteness() - provided by Module Gating impl 05. The Module Gating impl 02 backfill migration ensures this is true for every existing tenant on rollout.',
    is_auto: true,
    blocked_by: [],
    sort_order: 3,
  },
  {
    phase: 'infrastructure',
    step_key: 'billing_status_set',
    label: 'Billing status confirmed',
    description: 'The billing status for this tenant has been reviewed and set.',
    is_auto: false,
    blocked_by: [],
    sort_order: 4,
  },
  {
    phase: 'data',
    step_key: 'owner_account_created',
    label: 'School owner account created',
    description: 'A user account with the school_owner role has been created for this tenant.',
    is_auto: true,
    blocked_by: [],
    sort_order: 5,
  },
  {
    phase: 'data',
    step_key: 'owner_welcomed',
    label: 'Welcome email sent to owner',
    description: 'A welcome email has been sent to the school owner.',
    is_auto: false,
    blocked_by: ['owner_account_created'],
    sort_order: 6,
  },
  {
    phase: 'data',
    step_key: 'staff_imported',
    label: 'Staff data imported',
    description: 'Staff records have been imported into the system.',
    is_auto: false,
    blocked_by: ['owner_account_created'],
    sort_order: 7,
  },
  {
    phase: 'data',
    step_key: 'students_imported',
    label: 'Student data imported',
    description: 'Student records have been imported into the system.',
    is_auto: false,
    blocked_by: ['owner_account_created'],
    sort_order: 8,
  },
  {
    phase: 'data',
    step_key: 'parents_imported',
    label: 'Parent data imported',
    description: 'Parent records have been imported and linked to students.',
    is_auto: false,
    blocked_by: ['students_imported'],
    sort_order: 9,
  },
  {
    phase: 'configuration',
    step_key: 'academic_year_set',
    label: 'Academic year configured',
    description: 'The academic year, terms, and periods have been set up.',
    is_auto: false,
    blocked_by: ['owner_account_created'],
    sort_order: 10,
  },
  {
    phase: 'configuration',
    step_key: 'classes_set_up',
    label: 'Classes and year groups created',
    description: 'Year groups, classes, and sections have been created.',
    is_auto: false,
    blocked_by: ['academic_year_set'],
    sort_order: 11,
  },
  {
    phase: 'configuration',
    step_key: 'settings_reviewed',
    label: 'Tenant settings reviewed',
    description:
      'The tenant settings (attendance, gradebook, finance, etc.) have been reviewed and configured.',
    is_auto: false,
    blocked_by: ['modules_configured'],
    sort_order: 12,
  },
  {
    phase: 'configuration',
    step_key: 'roles_reviewed',
    label: 'Roles and permissions reviewed',
    description: 'The role definitions and permission assignments have been reviewed.',
    is_auto: false,
    blocked_by: ['owner_account_created'],
    sort_order: 13,
  },
  {
    phase: 'go_live',
    step_key: 'owner_trained',
    label: 'Owner walkthrough completed',
    description: 'The school owner has completed an onboarding walkthrough of the platform.',
    is_auto: false,
    blocked_by: ['owner_welcomed'],
    sort_order: 14,
  },
  {
    phase: 'go_live',
    step_key: 'go_live_confirmed',
    label: 'Tenant marked as live',
    description: 'The tenant has been reviewed and confirmed as ready for live use.',
    is_auto: false,
    blocked_by: [
      'domain_configured',
      'ssl_verified',
      'modules_configured',
      'billing_status_set',
      'owner_account_created',
      'owner_welcomed',
      'staff_imported',
      'students_imported',
      'parents_imported',
      'academic_year_set',
      'classes_set_up',
      'settings_reviewed',
      'roles_reviewed',
      'owner_trained',
    ],
    sort_order: 15,
  },
] as const satisfies ReadonlyArray<{
  phase: 'infrastructure' | 'data' | 'configuration' | 'go_live';
  step_key: string;
  label: string;
  description: string;
  is_auto: boolean;
  blocked_by: readonly string[];
  sort_order: number;
}>;

export type OnboardingStepWithCompleter = TenantOnboardingStep & {
  completer: { id: string; first_name: string; last_name: string } | null;
};

export interface OnboardingSummary {
  total: number;
  completed: number;
  in_progress: number;
  pending: number;
  skipped: number;
  blocked: number;
  percent_complete: number;
}

export interface OnboardingTrackerResponse {
  steps: OnboardingStepWithCompleter[];
  phases: Record<string, OnboardingStepWithCompleter[]>;
  summary: OnboardingSummary;
}

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisPubSub: RedisPubSubService,
    private readonly rbacReadFacade: RbacReadFacade,
    private readonly tenantReadFacade: TenantReadFacade,
  ) {}

  async seedDefaultSteps(tenantId: string): Promise<void> {
    await this.prisma.tenantOnboardingStep.createMany({
      data: DEFAULT_ONBOARDING_STEPS.map((step) => ({
        tenant_id: tenantId,
        phase: step.phase,
        step_key: step.step_key,
        label: step.label,
        description: step.description,
        is_auto: step.is_auto,
        blocked_by: [...step.blocked_by],
        sort_order: step.sort_order,
        status: 'pending',
      })),
      skipDuplicates: true,
    });
  }

  async getForTenant(tenantId: string): Promise<OnboardingTrackerResponse> {
    await this.ensureTenantExists(tenantId);
    await this.autoCompleteOwnerAccountOnRead(tenantId);

    const steps = await this.fetchSteps(tenantId);
    return {
      steps,
      phases: this.groupByPhase(steps),
      summary: this.buildSummary(steps),
    };
  }

  async updateStep(
    tenantId: string,
    stepId: string,
    dto: UpdateOnboardingStepDto,
    actorUserId: string,
  ): Promise<TenantOnboardingStep> {
    const step = await this.prisma.tenantOnboardingStep.findFirst({
      where: { id: stepId, tenant_id: tenantId },
    });
    if (!step) {
      throw new NotFoundException({
        code: 'ONBOARDING_STEP_NOT_FOUND',
        message: `Onboarding step "${stepId}" not found for this tenant`,
      });
    }

    if (dto.status === 'completed') {
      await this.assertBlockersCompleted(tenantId, step);
    }

    const updated = await this.prisma.tenantOnboardingStep.update({
      where: { id: stepId },
      data: {
        status: dto.status,
        completed_at: dto.status === 'completed' ? new Date() : null,
        completed_by: dto.status === 'completed' ? actorUserId : null,
        ...(dto.metadata !== undefined && {
          metadata: dto.metadata as Prisma.InputJsonObject,
        }),
      },
    });

    await this.publishOnboardingUpdate({
      type: 'step_updated',
      tenant_id: tenantId,
      step_id: stepId,
      step_key: step.step_key,
      new_status: dto.status,
    });

    if (dto.status === 'completed') {
      this.logger.debug(
        `Step "${step.step_key}" completed for tenant ${tenantId}; dependent steps unblocked`,
      );
    }

    return updated;
  }

  async resetForTenant(tenantId: string): Promise<void> {
    await this.ensureTenantExists(tenantId);
    await this.prisma.tenantOnboardingStep.updateMany({
      where: { tenant_id: tenantId },
      data: {
        status: 'pending',
        completed_at: null,
        completed_by: null,
        metadata: Prisma.JsonNull,
      },
    });

    await this.publishOnboardingUpdate({
      type: 'tracker_reset',
      tenant_id: tenantId,
    });
  }

  async autoCompleteStep(
    tenantId: string,
    stepKey: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const step = await this.prisma.tenantOnboardingStep.findFirst({
      where: {
        tenant_id: tenantId,
        step_key: stepKey,
        status: { not: 'completed' },
      },
    });
    if (!step) return;

    if (!(await this.areBlockersCompleted(tenantId, step.blocked_by))) return;

    await this.prisma.tenantOnboardingStep.update({
      where: { id: step.id },
      data: {
        status: 'completed',
        completed_at: new Date(),
        ...(metadata !== undefined && { metadata: metadata as Prisma.InputJsonObject }),
      },
    });

    await this.publishOnboardingUpdate({
      type: 'step_auto_completed',
      tenant_id: tenantId,
      step_id: step.id,
      step_key: stepKey,
      new_status: 'completed',
    });

    this.logger.log(`Auto-completed onboarding step "${stepKey}" for tenant ${tenantId}`);
  }

  private async ensureTenantExists(tenantId: string): Promise<void> {
    await this.tenantReadFacade.existsOrThrow(tenantId);
  }

  private async fetchSteps(tenantId: string): Promise<OnboardingStepWithCompleter[]> {
    return this.prisma.tenantOnboardingStep.findMany({
      where: { tenant_id: tenantId },
      orderBy: { sort_order: 'asc' },
      include: {
        completer: {
          select: { id: true, first_name: true, last_name: true },
        },
      },
    });
  }

  private async autoCompleteOwnerAccountOnRead(tenantId: string): Promise<void> {
    const ownerStep = await this.prisma.tenantOnboardingStep.findFirst({
      where: {
        tenant_id: tenantId,
        step_key: 'owner_account_created',
        status: { not: 'completed' },
      },
      select: { id: true },
    });
    if (!ownerStep) return;

    const [principalUserIds, ownerUserIds] = await Promise.all([
      this.rbacReadFacade.findActiveUserIdsByRoleKey(tenantId, 'school_principal'),
      this.rbacReadFacade.findActiveUserIdsByRoleKey(tenantId, 'school_owner'),
    ]);
    if (principalUserIds.length > 0 || ownerUserIds.length > 0) {
      await this.autoCompleteStep(tenantId, 'owner_account_created');
    }
  }

  private buildSummary(steps: TenantOnboardingStep[]): OnboardingSummary {
    const completedKeys = new Set(
      steps.filter((step) => step.status === 'completed').map((step) => step.step_key),
    );
    const blockedSteps = steps.filter(
      (step) =>
        step.status !== 'completed' &&
        step.status !== 'skipped' &&
        step.blocked_by.some((blocker) => !completedKeys.has(blocker)),
    );
    const blockedIds = new Set(blockedSteps.map((step) => step.id));
    const completed = completedKeys.size;
    const total = steps.length;

    return {
      total,
      completed,
      in_progress: steps.filter((step) => step.status === 'in_progress' && !blockedIds.has(step.id))
        .length,
      pending: steps.filter((step) => step.status === 'pending' && !blockedIds.has(step.id)).length,
      skipped: steps.filter((step) => step.status === 'skipped').length,
      blocked: blockedSteps.length,
      percent_complete: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  }

  private groupByPhase(
    steps: OnboardingStepWithCompleter[],
  ): Record<string, OnboardingStepWithCompleter[]> {
    return steps.reduce<Record<string, OnboardingStepWithCompleter[]>>((acc, step) => {
      acc[step.phase] = [...(acc[step.phase] ?? []), step];
      return acc;
    }, {});
  }

  private async assertBlockersCompleted(
    tenantId: string,
    step: TenantOnboardingStep,
  ): Promise<void> {
    const blockersCompleted = await this.areBlockersCompleted(tenantId, step.blocked_by);
    if (blockersCompleted) return;

    const blockers = await this.prisma.tenantOnboardingStep.findMany({
      where: {
        tenant_id: tenantId,
        step_key: { in: step.blocked_by },
        status: { not: 'completed' },
      },
      select: { step_key: true },
      orderBy: { sort_order: 'asc' },
    });
    throw new BadRequestException({
      code: 'ONBOARDING_STEP_BLOCKED',
      message: `Cannot complete this step. Blocked by: ${blockers
        .map((blocker) => blocker.step_key)
        .join(', ')}`,
    });
  }

  private async areBlockersCompleted(tenantId: string, blockerKeys: string[]): Promise<boolean> {
    if (blockerKeys.length === 0) return true;
    const incompleteBlockers = await this.prisma.tenantOnboardingStep.count({
      where: {
        tenant_id: tenantId,
        step_key: { in: blockerKeys },
        status: { not: 'completed' },
      },
    });
    return incompleteBlockers === 0;
  }

  private async publishOnboardingUpdate(payload: Record<string, unknown>): Promise<void> {
    await this.redisPubSub.publish('platform:onboarding', payload);
  }
}
