// ─── Types & Constants for Behaviour Policies ────────────────────────────────

export interface PolicyAction {
  id?: string;
  action_type: string;
  action_config: Record<string, unknown>;
  execution_order: number;
}

export interface PolicyRule {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  stage: string;
  priority: number;
  match_strategy: string;
  stop_processing_stage: boolean;
  conditions: Record<string, unknown>;
  current_version: number;
  actions: PolicyAction[];
}

export interface Category {
  id: string;
  name: string;
  polarity: string;
}

export interface YearGroup {
  id: string;
  name: string;
}

export interface ReplayResult {
  rule_name: string;
  stage: string;
  replay_period: { from: string; to: string };
  incidents_evaluated: number;
  incidents_matched: number;
  students_affected: number;
  affected_year_groups: string[];
  actions_that_would_fire: Record<string, number>;
  sample_matches: Array<{
    incident_number: string;
    occurred_at: string;
    student_label: string;
    year_group: string | null;
    category_name: string;
  }>;
}

export interface DryRunStageResult {
  stage: string;
  rules_evaluated: number;
  matched_rules: Array<{
    rule_id: string;
    rule_name: string;
    actions_that_would_fire: Array<{ action_type: string }>;
  }>;
}

export interface DryRunResult {
  stage_results: DryRunStageResult[];
}

export interface EditorFormState {
  name: string;
  description: string;
  stage: string;
  priority: number;
  match_strategy: string;
  stop_processing_stage: boolean;
  is_active: boolean;
  conditions: Record<string, unknown>;
  actions: PolicyAction[];
  change_reason: string;
}

export interface DryRunFormState {
  category_id: string;
  polarity: string;
  severity: number;
  context_type: string;
  student_year_group_id: string;
  student_has_send: boolean;
  student_has_active_intervention: boolean;
  participant_role: string;
  repeat_count: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const STAGES = [
  {
    key: 'consequence',
    label: 'Consequence',
    desc: 'Escalation and sanction creation. Default: first match.',
  },
  { key: 'approval', label: 'Approval', desc: 'Approval gating. Default: first match.' },
  {
    key: 'notification',
    label: 'Notification',
    desc: 'Parent and role notifications. Default: all matching.',
  },
  {
    key: 'support',
    label: 'Support',
    desc: 'Interventions, SENCO tasks, pastoral alerts. Default: all matching.',
  },
  {
    key: 'alerting',
    label: 'Alerting',
    desc: 'Flags for review and analytics. Default: all matching.',
  },
] as const;

export const ACTION_TYPES = [
  { value: 'auto_escalate', label: 'Auto-Escalate' },
  { value: 'create_sanction', label: 'Create Sanction' },
  { value: 'require_approval', label: 'Require Approval' },
  { value: 'require_parent_meeting', label: 'Require Parent Meeting' },
  { value: 'require_parent_notification', label: 'Require Parent Notification' },
  { value: 'create_task', label: 'Create Task' },
  { value: 'create_intervention', label: 'Create Intervention' },
  { value: 'notify_roles', label: 'Notify Roles' },
  { value: 'notify_users', label: 'Notify Users' },
  { value: 'flag_for_review', label: 'Flag for Review' },
  { value: 'block_without_approval', label: 'Block Without Approval' },
];

export const CONTEXT_TYPES = [
  'class',
  'break',
  'before_school',
  'after_school',
  'lunch',
  'transport',
  'extra_curricular',
  'off_site',
  'online',
  'other',
];

export const PARTICIPANT_ROLES = [
  'subject',
  'witness',
  'bystander',
  'reporter',
  'victim',
  'instigator',
  'mediator',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function conditionSummary(conds: Record<string, unknown>): string {
  const parts: string[] = [];
  if (conds.polarity) parts.push(`${conds.polarity}`);
  if (conds.severity_min || conds.severity_max) {
    parts.push(`sev ${conds.severity_min ?? 1}\u2013${conds.severity_max ?? 10}`);
  }
  if (conds.repeat_count_min) {
    parts.push(`\u2265${conds.repeat_count_min}\u00D7 in ${conds.repeat_window_days ?? '?'}d`);
  }
  if ((conds.category_ids as string[] | undefined)?.length) {
    parts.push(`${(conds.category_ids as string[]).length} categories`);
  }
  if (conds.student_has_send) parts.push('SEND');
  return parts.length > 0 ? parts.join(' \u00B7 ') : 'All incidents (wildcard)';
}

export function actionSummary(actions: PolicyAction[]): string {
  return actions
    .map((a) => ACTION_TYPES.find((t) => t.value === a.action_type)?.label ?? a.action_type)
    .join(', ');
}

export function createEmptyForm(stage: string): EditorFormState {
  return {
    name: '',
    description: '',
    stage,
    priority: 100,
    match_strategy: 'first_match',
    stop_processing_stage: false,
    is_active: true,
    conditions: {},
    actions: [],
    change_reason: '',
  };
}

export function createDryRunForm(): DryRunFormState {
  return {
    category_id: '',
    polarity: 'negative',
    severity: 5,
    context_type: 'class',
    student_year_group_id: '',
    student_has_send: false,
    student_has_active_intervention: false,
    participant_role: 'subject',
    repeat_count: 0,
  };
}
