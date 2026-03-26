import { z } from 'zod';

export const ReplayPolicyRuleSchema = z.object({
  rule_id: z.string().uuid(),
  replay_period: z.object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
  dry_run: z.boolean().default(true),
});

export type ReplayPolicyRuleDto = z.infer<typeof ReplayPolicyRuleSchema>;

export interface ReplaySampleMatch {
  incident_id: string;
  incident_number: string;
  occurred_at: string;
  student_id: string;
  student_label: string;
  year_group: string | null;
  category_name: string;
  matched_conditions: Record<string, unknown>;
  actions_that_would_fire: string[];
}

export interface ReplayResult {
  rule_id: string;
  rule_name: string;
  stage: string;
  replay_period: { from: string; to: string };
  incidents_evaluated: number;
  incidents_matched: number;
  students_affected: number;
  affected_year_groups: string[];
  actions_that_would_fire: Record<string, number>;
  estimated_sanctions_created: Record<string, number>;
  estimated_approvals_created: number;
  sample_matches: ReplaySampleMatch[];
}
