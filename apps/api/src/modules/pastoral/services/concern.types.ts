import type { Prisma } from '@prisma/client';

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
}

export interface ConcernCategory {
  key: string;
  label: string;
  auto_tier?: number;
  active: boolean;
}

export interface ValidatedCategory {
  auto_tier?: number;
}

export interface ConcernInvolvedStudentRow {
  student_id: string;
  added_at: Date;
  student?: { id: string; first_name: string; last_name: string } | null;
}

export interface ConcernRow {
  id: string;
  tenant_id: string;
  student_id: string;
  logged_by_user_id: string;
  author_masked: boolean;
  category: string;
  severity: string;
  tier: number;
  occurred_at: Date;
  location: string | null;
  witnesses: Prisma.JsonValue;
  actions_taken: string | null;
  follow_up_needed: boolean;
  follow_up_suggestion: string | null;
  case_id: string | null;
  behaviour_incident_id: string | null;
  parent_shareable: boolean;
  parent_share_level: string | null;
  shared_by_user_id: string | null;
  shared_at: Date | null;
  legal_hold: boolean;
  imported: boolean;
  acknowledged_at: Date | null;
  acknowledged_by_user_id: string | null;
  created_at: Date;
  updated_at: Date;
  logged_by?: { first_name: string; last_name: string } | null;
  student?: { id: string; first_name: string; last_name: string } | null;
  involved_students?: ConcernInvolvedStudentRow[];
  versions?: Array<{
    id: string;
    concern_id: string;
    version_number: number;
    narrative: string;
    amended_by_user_id: string;
    amendment_reason: string | null;
    created_at: Date;
  }>;
}

export interface ConcernListItemDto {
  id: string;
  student_id: string;
  student_name: string;
  category: string;
  severity: string;
  tier: number;
  occurred_at: Date;
  created_at: Date;
  follow_up_needed: boolean;
  case_id: string | null;
  students_involved: Array<{
    student_id: string;
    student_name: string;
    added_at: Date;
  }>;
  author_name: string | null;
  author_masked_for_viewer: boolean;
  logged_by_user_id: string | null;
}

export interface ConcernDetailDto extends ConcernListItemDto {
  witnesses: Prisma.JsonValue;
  actions_taken: string | null;
  follow_up_suggestion: string | null;
  location: string | null;
  behaviour_incident_id: string | null;
  parent_shareable: boolean;
  parent_share_level: string | null;
  acknowledged_at: Date | null;
  acknowledged_by_user_id: string | null;
  versions: Array<{
    id: string;
    concern_id: string;
    version_number: number;
    narrative: string;
    amended_by_user_id: string;
    amendment_reason: string | null;
    created_at: Date;
  }>;
}
