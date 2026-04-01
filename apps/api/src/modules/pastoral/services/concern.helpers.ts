import { Prisma } from '@prisma/client';

import type { ListConcernsQuery } from '@school/shared';

import type { ConcernDetailDto, ConcernListItemDto, ConcernRow } from './concern.service';

// ─── Author masking ───────────────────────────────────────────────────────────

/**
 * Applies author masking to a concern row.
 * If author_masked is true and the viewer does NOT have DLP (CP access),
 * the author information is redacted.
 */
export function applyAuthorMasking(
  concern: ConcernRow,
  hasCpAccess: boolean,
): {
  author_name: string | null;
  logged_by_user_id: string | null;
  author_masked_for_viewer: boolean;
} {
  if (!concern.author_masked) {
    const authorName = concern.logged_by
      ? `${concern.logged_by.first_name} ${concern.logged_by.last_name}`
      : null;
    return {
      author_name: authorName,
      logged_by_user_id: concern.logged_by_user_id,
      author_masked_for_viewer: false,
    };
  }

  // DLP users see everything
  if (hasCpAccess) {
    const authorName = concern.logged_by
      ? `${concern.logged_by.first_name} ${concern.logged_by.last_name}`
      : null;
    return {
      author_name: authorName,
      logged_by_user_id: concern.logged_by_user_id,
      author_masked_for_viewer: false,
    };
  }

  // Non-DLP viewers see masked author
  return {
    author_name: 'Author masked',
    logged_by_user_id: null,
    author_masked_for_viewer: true,
  };
}

// ─── Mapping: Row → DTO ───────────────────────────────────────────────────────

/**
 * Maps the involved_students join rows on a concern to the DTO shape.
 */
export function mapConcernInvolvedStudents(
  concern: ConcernRow,
): ConcernListItemDto['students_involved'] {
  return (concern.involved_students ?? []).map((studentLink) => ({
    student_id: studentLink.student_id,
    student_name: studentLink.student
      ? `${studentLink.student.first_name} ${studentLink.student.last_name}`
      : 'Unknown',
    added_at: studentLink.added_at,
  }));
}

/**
 * Maps a raw concern row to a list item DTO with author masking applied.
 */
export function mapConcernRowToListItem(
  concern: ConcernRow,
  hasCpAccess: boolean,
): ConcernListItemDto {
  const masking = applyAuthorMasking(concern, hasCpAccess);
  const studentName = concern.student
    ? `${concern.student.first_name} ${concern.student.last_name}`
    : 'Unknown';

  return {
    id: concern.id,
    student_id: concern.student_id,
    student_name: studentName,
    category: concern.category,
    severity: concern.severity,
    tier: concern.tier,
    occurred_at: concern.occurred_at,
    created_at: concern.created_at,
    follow_up_needed: concern.follow_up_needed,
    case_id: concern.case_id,
    students_involved: mapConcernInvolvedStudents(concern),
    author_name: masking.author_name,
    author_masked_for_viewer: masking.author_masked_for_viewer,
    logged_by_user_id: masking.logged_by_user_id,
  };
}

/**
 * Maps a raw concern row (with versions) to a detail DTO with author masking.
 */
export function mapConcernRowToDetail(concern: ConcernRow, hasCpAccess: boolean): ConcernDetailDto {
  const listItem = mapConcernRowToListItem(concern, hasCpAccess);

  return {
    ...listItem,
    witnesses: concern.witnesses,
    actions_taken: concern.actions_taken,
    follow_up_suggestion: concern.follow_up_suggestion,
    location: concern.location,
    behaviour_incident_id: concern.behaviour_incident_id,
    parent_shareable: concern.parent_shareable,
    parent_share_level: concern.parent_share_level,
    acknowledged_at: concern.acknowledged_at,
    acknowledged_by_user_id: concern.acknowledged_by_user_id,
    versions: concern.versions ?? [],
  };
}

// ─── Query builders ───────────────────────────────────────────────────────────

/**
 * Builds the Prisma where clause for concern list queries.
 * Returns `null` when the requested tier exceeds the caller's access level,
 * signalling the caller should short-circuit and return an empty page.
 */
export function buildConcernWhereClause(
  tenantId: string,
  query: ListConcernsQuery,
  callerMaxTier: number,
): Prisma.PastoralConcernWhereInput | null {
  const where: Prisma.PastoralConcernWhereInput = { tenant_id: tenantId };

  // Tier filtering: if caller cannot see tier 2, filter to tier 1 only
  // Tier 3 is already handled by RLS (only visible to DLP users)
  if (callerMaxTier < 2) {
    where.tier = 1;
  } else if (callerMaxTier < 3) {
    where.tier = { in: [1, 2] };
  }

  // If user-requested tier filter, apply it within allowed range
  if (query.tier !== undefined) {
    if (query.tier <= callerMaxTier) {
      where.tier = query.tier;
    } else {
      // Requested tier exceeds access — caller must return empty
      return null;
    }
  }

  if (query.student_id) {
    where.OR = [
      { student_id: query.student_id },
      {
        involved_students: {
          some: {
            tenant_id: tenantId,
            student_id: query.student_id,
          },
        },
      },
    ];
  }

  if (query.category) where.category = query.category;
  if (query.severity) where.severity = query.severity;
  if (query.case_id) where.case_id = query.case_id;

  // Date range filtering
  if (query.from || query.to) {
    where.created_at = {};
    if (query.from) where.created_at.gte = new Date(query.from);
    if (query.to) where.created_at.lte = new Date(query.to);
  }

  return where;
}

/**
 * Builds the Prisma orderBy clause for concern list queries.
 */
export function buildConcernOrderBy(
  query: ListConcernsQuery,
): Prisma.PastoralConcernOrderByWithRelationInput {
  const orderBy: Prisma.PastoralConcernOrderByWithRelationInput = {};
  if (query.sort === 'occurred_at') orderBy.occurred_at = query.order;
  else if (query.sort === 'severity') orderBy.severity = query.order;
  else orderBy.created_at = query.order;
  return orderBy;
}
