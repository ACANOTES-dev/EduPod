import type { ConcernDetailDto, ConcernListItemDto, ConcernRow } from './concern.types';

export class ConcernProjectionService {
  toConcernListItem(concern: ConcernRow, hasCpAccess: boolean): ConcernListItemDto {
    const masking = this.applyAuthorMasking(concern, hasCpAccess);
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
      students_involved: this.toConcernInvolvedStudents(concern),
      author_name: masking.author_name,
      author_masked_for_viewer: masking.author_masked_for_viewer,
      logged_by_user_id: masking.logged_by_user_id,
    };
  }

  toConcernDetail(concern: ConcernRow, hasCpAccess: boolean): ConcernDetailDto {
    const listItem = this.toConcernListItem(concern, hasCpAccess);

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

  private applyAuthorMasking(
    concern: ConcernRow,
    hasCpAccess: boolean,
  ): {
    author_name: string | null;
    logged_by_user_id: string | null;
    author_masked_for_viewer: boolean;
  } {
    if (!concern.author_masked || hasCpAccess) {
      const authorName = concern.logged_by
        ? `${concern.logged_by.first_name} ${concern.logged_by.last_name}`
        : null;

      return {
        author_name: authorName,
        logged_by_user_id: concern.logged_by_user_id,
        author_masked_for_viewer: false,
      };
    }

    return {
      author_name: 'Author masked',
      logged_by_user_id: null,
      author_masked_for_viewer: true,
    };
  }

  private toConcernInvolvedStudents(concern: ConcernRow): ConcernListItemDto['students_involved'] {
    return (concern.involved_students ?? []).map((studentLink) => ({
      student_id: studentLink.student_id,
      student_name: studentLink.student
        ? `${studentLink.student.first_name} ${studentLink.student.last_name}`
        : 'Unknown',
      added_at: studentLink.added_at,
    }));
  }
}
