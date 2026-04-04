import { Injectable } from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';

import type {
  AssignSafeguardingConcernDto,
  GardaReferralDto,
  InitiateSealDto,
  ListSafeguardingActionsQuery,
  ListSafeguardingConcernsQuery,
  MyReportsQuery,
  RecordSafeguardingActionDto,
  ReportSafeguardingConcernDto,
  SafeguardingStatusTransitionDto,
  TuslaReferralDto,
  UpdateSafeguardingConcernDto,
} from '@school/shared/behaviour';

import { PrismaService } from '../prisma/prisma.service';
import { RbacReadFacade } from '../rbac/rbac-read.facade';

import { SafeguardingConcernsService } from './safeguarding-concerns.service';
import { SafeguardingReferralsService } from './safeguarding-referrals.service';
import { SafeguardingReportingService } from './safeguarding-reporting.service';
import { SafeguardingSealService } from './safeguarding-seal.service';

/**
 * Thin facade that delegates to focused sub-services.
 * Keeps the public API identical so the controller needs no changes.
 */
@Injectable()
export class SafeguardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbacReadFacade: RbacReadFacade,
    private readonly concernsService: SafeguardingConcernsService,
    private readonly referralsService: SafeguardingReferralsService,
    private readonly sealService: SafeguardingSealService,
    private readonly reportingService: SafeguardingReportingService,
  ) {}

  // ─── Concern CRUD (delegates to SafeguardingConcernsService) ────────────

  async reportConcern(tenantId: string, userId: string, dto: ReportSafeguardingConcernDto) {
    return this.concernsService.reportConcern(tenantId, userId, dto);
  }

  async getMyReports(tenantId: string, userId: string, query: MyReportsQuery) {
    return this.concernsService.getMyReports(tenantId, userId, query);
  }

  async listConcerns(
    tenantId: string,
    userId: string,
    membershipId: string,
    query: ListSafeguardingConcernsQuery,
  ) {
    return this.concernsService.listConcerns(
      tenantId,
      userId,
      membershipId,
      query,
      (uId, tId, mId, cId) => this.checkEffectivePermission(uId, tId, mId, cId),
    );
  }

  async getConcernDetail(
    tenantId: string,
    userId: string,
    membershipId: string,
    concernId: string,
  ) {
    return this.concernsService.getConcernDetail(
      tenantId,
      userId,
      membershipId,
      concernId,
      (uId, tId, mId, cId) => this.checkEffectivePermission(uId, tId, mId, cId),
    );
  }

  async updateConcern(
    tenantId: string,
    userId: string,
    concernId: string,
    dto: UpdateSafeguardingConcernDto,
  ) {
    return this.concernsService.updateConcern(tenantId, userId, concernId, dto);
  }

  async transitionStatus(
    tenantId: string,
    userId: string,
    concernId: string,
    dto: SafeguardingStatusTransitionDto,
  ) {
    return this.concernsService.transitionStatus(tenantId, userId, concernId, dto);
  }

  async assignConcern(
    tenantId: string,
    userId: string,
    concernId: string,
    dto: AssignSafeguardingConcernDto,
  ) {
    return this.concernsService.assignConcern(tenantId, userId, concernId, dto);
  }

  // ─── Actions (delegates to SafeguardingConcernsService) ─────────────────

  async recordAction(
    tenantId: string,
    userId: string,
    concernId: string,
    dto: RecordSafeguardingActionDto,
  ) {
    return this.concernsService.recordAction(tenantId, userId, concernId, dto);
  }

  async getActions(
    tenantId: string,
    userId: string,
    membershipId: string,
    concernId: string,
    query: ListSafeguardingActionsQuery,
  ) {
    return this.concernsService.getActions(
      tenantId,
      userId,
      membershipId,
      concernId,
      query,
      (uId, tId, mId, cId) => this.checkEffectivePermission(uId, tId, mId, cId),
    );
  }

  // ─── Referrals (delegates to SafeguardingReferralsService) ──────────────

  async recordTuslaReferral(
    tenantId: string,
    userId: string,
    concernId: string,
    dto: TuslaReferralDto,
  ) {
    return this.referralsService.recordTuslaReferral(tenantId, userId, concernId, dto);
  }

  async recordGardaReferral(
    tenantId: string,
    userId: string,
    concernId: string,
    dto: GardaReferralDto,
  ) {
    return this.referralsService.recordGardaReferral(tenantId, userId, concernId, dto);
  }

  // ─── Seal (delegates to SafeguardingSealService) ────────────────────────

  async initiateSeal(tenantId: string, userId: string, concernId: string, dto: InitiateSealDto) {
    return this.sealService.initiateSeal(tenantId, userId, concernId, dto);
  }

  async approveSeal(tenantId: string, userId: string, concernId: string) {
    return this.sealService.approveSeal(tenantId, userId, concernId);
  }

  // ─── Reporting (delegates to SafeguardingReportingService) ──────────────

  async getDashboard(tenantId: string) {
    return this.reportingService.getDashboard(tenantId);
  }

  async generateCaseFile(tenantId: string, concernId: string, redacted: boolean): Promise<Buffer> {
    return this.reportingService.generateCaseFile(tenantId, concernId, redacted);
  }

  // ─── Permission Check with Break-Glass ──────────────────────────────────

  async checkEffectivePermission(
    userId: string,
    tenantId: string,
    membershipId: string,
    concernId?: string,
  ): Promise<{ allowed: boolean; context: 'normal' | 'break_glass'; grantId?: string }> {
    // Check normal permission
    const membership = await this.rbacReadFacade.findMembershipByIdAndUser(
      tenantId,
      membershipId,
      userId,
    );

    if (membership) {
      const permissions = new Set<string>();
      for (const mr of membership.membership_roles) {
        for (const rp of mr.role.role_permissions) {
          permissions.add(rp.permission.permission_key);
        }
      }
      if (permissions.has('safeguarding.view')) {
        return { allowed: true, context: 'normal' };
      }
    }

    // Check break-glass grant
    const grantWhere: Prisma.SafeguardingBreakGlassGrantWhereInput = {
      tenant_id: tenantId,
      granted_to_id: userId,
      revoked_at: null,
      expires_at: { gt: new Date() },
    };

    if (concernId) {
      grantWhere.OR = [
        { scope: 'all_concerns' as $Enums.BreakGlassScope },
        {
          scope: 'specific_concerns' as $Enums.BreakGlassScope,
          scoped_concern_ids: { has: concernId },
        },
      ];
    } else {
      // For list operations, any active grant gives access
    }

    const grant = await this.prisma.safeguardingBreakGlassGrant.findFirst({
      where: grantWhere,
    });

    if (grant) {
      return { allowed: true, context: 'break_glass', grantId: grant.id };
    }

    return { allowed: false, context: 'normal' };
  }
}
