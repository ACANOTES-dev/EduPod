import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';

import { BehaviourReadFacade } from '../../modules/behaviour/behaviour-read.facade';
import { ParentReadFacade } from '../../modules/parents/parent-read.facade';

// ─── Constants ────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Matches every parent-facing endpoint under `/v1/parent/`, `/v1/parent-portal/`
 * and similar variants. Optional `api/` prefix because the NestJS global
 * prefix is applied at startup.
 */
const PARENT_PATH_RE = /^\/(?:api\/)?v1\/parent[/-]/i;

// ─── Type augmentation ───────────────────────────────────────────────────────

interface RequestWithContext extends Request {
  currentUser?: { sub: string; tenant_id?: string | null };
  tenantContext?: { tenant_id: string } | null;
}

// ─── Interceptor ─────────────────────────────────────────────────────────────

/**
 * WB-C-02 — Guardian-restriction enforcement.
 *
 * Fires on every `/v1/parent*` endpoint. When the authenticated user is a
 * parent with one or more active `behaviour_guardian_restrictions` rows,
 * and the request targets a specific student via route param or query,
 * the interceptor short-circuits with `403 GUARDIAN_RESTRICTED` if the
 * student is restricted.
 *
 * List endpoints (no specific student in the path) are allowed through —
 * the per-row authorisation in each parent service trims the result set
 * to linked students only, and a restriction is enforced when the parent
 * drills into a specific child.
 *
 * Admins / staff hitting parent endpoints (rare) are not parents, so
 * `resolveIdByUserId` returns null and the interceptor is a no-op.
 *
 * Both injected facades come from the global `ReadFacadesModule`, so
 * this interceptor's host module does NOT need to import either
 * BehaviourDisciplineModule or ParentsModule — eliminating the
 * cross-module-load cycle that earlier hosting attempts triggered.
 */
@Injectable()
export class GuardianRestrictionInterceptor implements NestInterceptor {
  private readonly logger = new Logger(GuardianRestrictionInterceptor.name);

  constructor(
    private readonly parentReadFacade: ParentReadFacade,
    private readonly behaviourReadFacade: BehaviourReadFacade,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const req = context.switchToHttp().getRequest<RequestWithContext>();

    if (!PARENT_PATH_RE.test(req.path) && !PARENT_PATH_RE.test(req.originalUrl ?? '')) {
      return next.handle();
    }

    const tenantId = req.currentUser?.tenant_id ?? req.tenantContext?.tenant_id ?? null;
    const userId = req.currentUser?.sub ?? null;

    if (!tenantId || !userId) {
      return next.handle();
    }

    const parentId = await this.parentReadFacade.resolveIdByUserId(tenantId, userId);
    if (!parentId) {
      return next.handle();
    }

    const restrictions = await this.behaviourReadFacade.findActiveRestrictionsForParent(
      tenantId,
      parentId,
    );
    if (restrictions.length === 0) {
      return next.handle();
    }

    const targetStudentId = this.extractStudentId(req);
    if (!targetStudentId) {
      return next.handle();
    }

    const blocking = restrictions.find((r) => r.student_id === targetStudentId);
    if (!blocking) {
      return next.handle();
    }

    this.logger.warn(
      `[GuardianRestriction] blocked parent_id=${parentId} student_id=${targetStudentId} type=${blocking.restriction_type} path=${req.originalUrl}`,
    );

    throw new ForbiddenException({
      code: 'GUARDIAN_RESTRICTED',
      message:
        'Access to this student is restricted by a guardian-restriction order. Contact the school office.',
      details: { restriction_type: blocking.restriction_type },
    });
  }

  // ─── Student-id extraction ──────────────────────────────────────────────

  private extractStudentId(req: RequestWithContext): string | null {
    const params = (req.params ?? {}) as Record<string, string | undefined>;
    if (params.student_id && UUID_RE.test(params.student_id)) return params.student_id;
    if (params.studentId && UUID_RE.test(params.studentId)) return params.studentId;

    const query = (req.query ?? {}) as Record<string, string | string[] | undefined>;
    const qs = query.student_id;
    if (typeof qs === 'string' && UUID_RE.test(qs)) return qs;

    return null;
  }
}
