import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';

import type { JwtPayload } from '@school/shared';

import type { AuthenticatedRequest } from '../../../common/types/request.types';
import { ChildProtectionReadFacade } from '../../child-protection/child-protection-read.facade';
import { PrismaService } from '../../prisma/prisma.service';
import { RbacReadFacade } from '../../rbac/rbac-read.facade';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Masked placeholder for author identity fields. */
interface MaskedAuthor {
  id: null;
  name: string;
  email: null;
}

/** The neutral object used when author information is redacted. */
const MASKED_AUTHOR: MaskedAuthor = Object.freeze({
  id: null,
  name: 'Author masked',
  email: null,
});

/**
 * Author-related field keys that the interceptor inspects and potentially masks.
 * When a response object contains any of these keys, the masking rules apply.
 */
const AUTHOR_ID_FIELDS = new Set([
  'logged_by_user_id',
  'amended_by_user_id',
  'reported_by_user_id',
  'created_by_user_id',
  'shared_by_user_id',
]);

/**
 * Author name fields that hold displayable author identifiers.
 * These are set to the masked placeholder text when masking is active.
 */
const AUTHOR_NAME_FIELDS = new Set([
  'author_name',
  'reported_by_name',
  'created_by_name',
  'amended_by_name',
]);

/**
 * Nested author object fields (e.g., `logged_by: { first_name, last_name }`).
 * These are replaced with null when masking is active.
 */
const AUTHOR_OBJECT_FIELDS = new Set(['logged_by', 'reported_by', 'created_by', 'amended_by']);

/** Viewer context resolved from the request for masking decisions. */
interface ViewerContext {
  /** Whether the viewer has an active CP access grant (DLP user). */
  isDlp: boolean;
  /** Whether the viewer is a parent (has parent.* permissions only). */
  isParent: boolean;
}

// ─── Interceptor ────────────────────────────────────────────────────────────

/**
 * Response interceptor that applies author masking rules to pastoral concern
 * and case response DTOs.
 *
 * **Masking Rules (from master spec):**
 *
 * | Viewer              | author_masked = false | author_masked = true |
 * |---------------------|----------------------|---------------------|
 * | Tier 1/2 staff      | Sees author          | "Author masked"     |
 * | DLP (Tier 3 / CP)   | Sees author          | Sees author          |
 * | Parent              | Never sees author    | Never sees author    |
 *
 * Applied to ConcernsController and CasesController via `@UseInterceptors()`.
 * The orchestrator handles the module wiring.
 */
@Injectable()
export class AuthorMaskingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuthorMaskingInterceptor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rbacReadFacade: RbacReadFacade,
    private readonly childProtectionReadFacade: ChildProtectionReadFacade,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user: JwtPayload = request.currentUser;
    const tenantId = request.tenantContext?.tenant_id ?? user.tenant_id;

    // If no tenant context, pass through (platform-level requests)
    if (!tenantId) {
      return next.handle();
    }

    // Resolve viewer context asynchronously, then apply masking to response
    return new Observable<unknown>((subscriber) => {
      this.resolveViewerContext(tenantId, user)
        .then((viewerContext) => {
          next
            .handle()
            .pipe(map((response) => this.applyMasking(response, viewerContext)))
            .subscribe({
              next: (value) => subscriber.next(value),
              error: (err: unknown) => subscriber.error(err),
              complete: () => subscriber.complete(),
            });
        })
        .catch((err: unknown) => {
          // On failure to resolve context, let the response through unmasked
          // is NOT safe — default to maximum masking for safety
          this.logger.error(
            'Failed to resolve viewer context for author masking, defaulting to masked',
            err instanceof Error ? err.stack : String(err),
          );
          const fallbackContext: ViewerContext = { isDlp: false, isParent: false };
          next
            .handle()
            .pipe(map((response) => this.applyMasking(response, fallbackContext)))
            .subscribe({
              next: (value) => subscriber.next(value),
              error: (subErr: unknown) => subscriber.error(subErr),
              complete: () => subscriber.complete(),
            });
        });
    });
  }

  // ─── Viewer Context Resolution ──────────────────────────────────────────

  /**
   * Resolves the viewer's masking context by checking:
   * 1. Whether they have an active CP access grant (DLP status)
   * 2. Whether they are a parent user (has parent.* permissions)
   */
  private async resolveViewerContext(tenantId: string, user: JwtPayload): Promise<ViewerContext> {
    const [isDlp, isParent] = await Promise.all([
      this.checkCpAccess(tenantId, user.sub),
      this.checkIsParent(user.membership_id, tenantId),
    ]);

    return { isDlp, isParent };
  }

  /**
   * Checks whether the user has an active (non-revoked) CP access grant.
   * DLP users always see real author information regardless of masking flag.
   */
  private async checkCpAccess(tenantId: string, userId: string): Promise<boolean> {
    const grant = (await this.childProtectionReadFacade.hasActiveCpAccess(tenantId, userId))
      ? { id: 'active' }
      : null;

    return !!grant;
  }

  /**
   * Checks whether the user is a parent by inspecting their permissions.
   * Parents have parent.* permissions and lack staff-level pastoral permissions.
   * If membership_id is null (platform user), they are not a parent.
   */
  private async checkIsParent(membershipId: string | null, tenantId?: string): Promise<boolean> {
    if (!membershipId || !tenantId) return false;

    const membership = await this.rbacReadFacade.findMembershipWithPermissions(
      tenantId,
      membershipId,
    );
    if (!membership) return false;

    const permissionKeys = membership.membership_roles.flatMap((mr) =>
      mr.role.role_permissions.map((rp) => rp.permission.permission_key),
    );

    // A user is considered a parent if they have at least one parent.* permission
    // and no staff-level pastoral permissions
    const hasParentPermission = permissionKeys.some((key) => key.startsWith('parent.'));
    const hasStaffPastoralPermission = permissionKeys.some(
      (key) => key.startsWith('pastoral.') && !key.startsWith('pastoral.parent_'),
    );

    return hasParentPermission && !hasStaffPastoralPermission;
  }

  // ─── Response Transformation ────────────────────────────────────────────

  /**
   * Applies author masking to the response based on viewer context.
   * Handles single objects, arrays, and paginated responses ({ data: [], meta: {} }).
   */
  private applyMasking(response: unknown, viewer: ViewerContext): unknown {
    // DLP users always see real author — no transformation needed
    if (viewer.isDlp) {
      return response;
    }

    return this.transformValue(response, viewer);
  }

  /**
   * Recursively traverses a value, applying masking to objects that contain
   * author-related fields. Creates new objects/arrays — never mutates originals.
   */
  private transformValue(value: unknown, viewer: ViewerContext): unknown {
    if (value === null || value === undefined) {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.transformValue(item, viewer));
    }

    if (typeof value === 'object' && !(value instanceof Date)) {
      return this.transformObject(value as Record<string, unknown>, viewer);
    }

    return value;
  }

  /**
   * Transforms a single object, applying masking rules to author fields.
   * Only creates a new object if masking is needed; otherwise returns a
   * shallow copy with recursively transformed nested values.
   */
  private transformObject(
    obj: Record<string, unknown>,
    viewer: ViewerContext,
  ): Record<string, unknown> {
    const shouldMaskThisObject = this.shouldMask(obj, viewer);
    const result: Record<string, unknown> = {};

    for (const [key, val] of Object.entries(obj)) {
      if (shouldMaskThisObject && AUTHOR_ID_FIELDS.has(key)) {
        result[key] = null;
      } else if (shouldMaskThisObject && AUTHOR_NAME_FIELDS.has(key)) {
        result[key] = MASKED_AUTHOR.name;
      } else if (shouldMaskThisObject && AUTHOR_OBJECT_FIELDS.has(key)) {
        result[key] = null;
      } else if (shouldMaskThisObject && key === 'author_masked_for_viewer') {
        result[key] = true;
      } else {
        // Recursively transform nested values (e.g., versions array,
        // nested concern objects within a case)
        result[key] = this.transformValue(val, viewer);
      }
    }

    return result;
  }

  /**
   * Determines whether an object's author fields should be masked.
   *
   * Rules:
   * 1. Parents NEVER see author information — always mask
   * 2. Non-DLP staff see author only when `author_masked = false`
   * 3. DLP users always see real author (handled upstream — this method
   *    is never called for DLP viewers)
   *
   * Only applies to objects that appear to be concern/case/version records
   * (i.e., objects that have at least one author-related field).
   */
  private shouldMask(obj: Record<string, unknown>, viewer: ViewerContext): boolean {
    // Check if this object has any author-related fields
    const hasAuthorFields = this.hasAuthorFields(obj);
    if (!hasAuthorFields) {
      return false;
    }

    // Rule 1: Parents NEVER see author information
    if (viewer.isParent) {
      return true;
    }

    // Rule 2: Non-DLP staff — mask when author_masked = true on the record
    if ('author_masked' in obj && obj.author_masked === true) {
      return true;
    }

    // Rule 2 continued: Non-DLP staff — if author_masked_for_viewer is already
    // set to true by the service layer, respect it
    if ('author_masked_for_viewer' in obj && obj.author_masked_for_viewer === true) {
      return true;
    }

    return false;
  }

  /**
   * Returns true if the object contains at least one author-related field,
   * indicating it is a record type that may need masking.
   */
  private hasAuthorFields(obj: Record<string, unknown>): boolean {
    for (const key of Object.keys(obj)) {
      if (
        AUTHOR_ID_FIELDS.has(key) ||
        AUTHOR_NAME_FIELDS.has(key) ||
        AUTHOR_OBJECT_FIELDS.has(key)
      ) {
        return true;
      }
    }
    return false;
  }
}
