import { z } from 'zod';

// ─── Parent Behaviour Query Schemas ──────────────────────────────────────────

export const parentBehaviourIncidentsQuerySchema = z.object({
  student_id: z.string().uuid(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type ParentBehaviourIncidentsQuery = z.infer<typeof parentBehaviourIncidentsQuerySchema>;

export const parentBehaviourStudentQuerySchema = z.object({
  student_id: z.string().uuid(),
});

export type ParentBehaviourStudentQuery = z.infer<typeof parentBehaviourStudentQuerySchema>;

// ─── Response Types ──────────────────────────────────────────────────────────

export interface ParentChildSummary {
  student_id: string;
  student_name: string;
  positive_count_7d: number;
  negative_count_7d: number;
  points_total: number;
  pending_acknowledgements: number;
}

export interface ParentIncidentView {
  id: string;
  incident_number: string;
  category_name: string;
  category_name_ar: string | null;
  polarity: string;
  severity: number;
  incident_description: string;
  occurred_at: string;
  reported_by_name: string | null;
  pending_acknowledgement_id: string | null;
}

export interface ParentSanctionView {
  id: string;
  sanction_number: string;
  type: string;
  scheduled_date: string | null;
  suspension_start_date: string | null;
  suspension_end_date: string | null;
  status: string;
}

export interface ParentPointsAwards {
  points_total: number;
  points_change_7d: number;
  awards: Array<{
    award_type_name: string;
    awarded_at: string;
    tier_level: number;
  }>;
}

export interface ParentRecognitionItem {
  student_first_name: string;
  student_last_initial: string;
  award_type_name: string;
  award_icon: string | null;
  awarded_at: string;
}
