/**
 * Behaviour Management seed data.
 * Called during tenant provisioning to create default categories, templates, award types.
 */
import type { PrismaClient } from '@prisma/client';

export interface BehaviourCategorySeed {
  name: string;
  name_ar: string;
  polarity: 'positive' | 'negative' | 'neutral';
  severity: number;
  point_value: number;
  color: string;
  icon: string;
  requires_follow_up: boolean;
  requires_parent_notification: boolean;
  parent_visible: boolean;
  benchmark_category: string;
  display_order: number;
  is_system: boolean;
}

export const BEHAVIOUR_CATEGORY_SEEDS: BehaviourCategorySeed[] = [
  // ─── Positive ─────────────────────────────────────────────────────────────
  { name: 'Praise', name_ar: 'ثناء', polarity: 'positive', severity: 1, point_value: 1, color: '#22c55e', icon: 'thumbs-up', requires_follow_up: false, requires_parent_notification: false, parent_visible: true, benchmark_category: 'praise', display_order: 1, is_system: true },
  { name: 'Merit', name_ar: 'جدارة', polarity: 'positive', severity: 3, point_value: 3, color: '#16a34a', icon: 'star', requires_follow_up: false, requires_parent_notification: false, parent_visible: true, benchmark_category: 'merit', display_order: 2, is_system: true },
  { name: 'Outstanding Achievement', name_ar: 'إنجاز متميز', polarity: 'positive', severity: 5, point_value: 5, color: '#059669', icon: 'award', requires_follow_up: false, requires_parent_notification: true, parent_visible: true, benchmark_category: 'major_positive', display_order: 3, is_system: true },
  { name: "Principal's Award", name_ar: 'جائزة المدير', polarity: 'positive', severity: 8, point_value: 10, color: '#0d9488', icon: 'trophy', requires_follow_up: false, requires_parent_notification: true, parent_visible: true, benchmark_category: 'major_positive', display_order: 4, is_system: true },

  // ─── Negative ─────────────────────────────────────────────────────────────
  { name: 'Verbal Warning', name_ar: 'تحذير شفهي', polarity: 'negative', severity: 2, point_value: -1, color: '#f59e0b', icon: 'alert-triangle', requires_follow_up: false, requires_parent_notification: false, parent_visible: true, benchmark_category: 'verbal_warning', display_order: 5, is_system: true },
  { name: 'Written Warning', name_ar: 'تحذير كتابي', polarity: 'negative', severity: 4, point_value: -3, color: '#f97316', icon: 'file-warning', requires_follow_up: true, requires_parent_notification: true, parent_visible: true, benchmark_category: 'written_warning', display_order: 6, is_system: true },
  { name: 'Detention', name_ar: 'احتجاز', polarity: 'negative', severity: 5, point_value: -5, color: '#ef4444', icon: 'clock', requires_follow_up: true, requires_parent_notification: true, parent_visible: true, benchmark_category: 'detention', display_order: 7, is_system: true },
  { name: 'Suspension (Internal)', name_ar: 'إيقاف داخلي', polarity: 'negative', severity: 7, point_value: -15, color: '#dc2626', icon: 'ban', requires_follow_up: true, requires_parent_notification: true, parent_visible: true, benchmark_category: 'internal_suspension', display_order: 8, is_system: true },
  { name: 'Suspension (External)', name_ar: 'إيقاف خارجي', polarity: 'negative', severity: 8, point_value: -15, color: '#b91c1c', icon: 'user-x', requires_follow_up: true, requires_parent_notification: true, parent_visible: true, benchmark_category: 'external_suspension', display_order: 9, is_system: true },
  { name: 'Expulsion', name_ar: 'فصل', polarity: 'negative', severity: 10, point_value: -50, color: '#7f1d1d', icon: 'shield-off', requires_follow_up: true, requires_parent_notification: true, parent_visible: true, benchmark_category: 'expulsion', display_order: 10, is_system: true },

  // ─── Neutral ──────────────────────────────────────────────────────────────
  { name: 'Note to File', name_ar: 'ملاحظة للملف', polarity: 'neutral', severity: 1, point_value: 0, color: '#6b7280', icon: 'file-text', requires_follow_up: false, requires_parent_notification: false, parent_visible: false, benchmark_category: 'note', display_order: 11, is_system: true },
  { name: 'Observation', name_ar: 'ملاحظة', polarity: 'neutral', severity: 1, point_value: 0, color: '#9ca3af', icon: 'eye', requires_follow_up: false, requires_parent_notification: false, parent_visible: false, benchmark_category: 'observation', display_order: 12, is_system: true },
];

export interface DescriptionTemplateSeed {
  category_name: string;
  locale: string;
  text: string;
  display_order: number;
}

export const DESCRIPTION_TEMPLATE_SEEDS: DescriptionTemplateSeed[] = [
  // ─── Praise templates ────────────────────────────────────────────────────
  { category_name: 'Praise', locale: 'en', text: 'Excellent class participation', display_order: 1 },
  { category_name: 'Praise', locale: 'en', text: 'Helped a fellow student', display_order: 2 },
  { category_name: 'Praise', locale: 'en', text: 'Consistent effort and improvement', display_order: 3 },
  { category_name: 'Praise', locale: 'ar', text: 'مشاركة ممتازة في الصف', display_order: 1 },
  { category_name: 'Praise', locale: 'ar', text: 'ساعد زميلاً', display_order: 2 },
  { category_name: 'Praise', locale: 'ar', text: 'جهد مستمر وتحسّن', display_order: 3 },

  // ─── Merit templates ─────────────────────────────────────────────────────
  { category_name: 'Merit', locale: 'en', text: 'Outstanding homework submission', display_order: 1 },
  { category_name: 'Merit', locale: 'en', text: 'Positive leadership in group work', display_order: 2 },
  { category_name: 'Merit', locale: 'en', text: 'Demonstrated academic excellence', display_order: 3 },
  { category_name: 'Merit', locale: 'ar', text: 'تقديم واجب منزلي متميز', display_order: 1 },
  { category_name: 'Merit', locale: 'ar', text: 'قيادة إيجابية في العمل الجماعي', display_order: 2 },
  { category_name: 'Merit', locale: 'ar', text: 'تميز أكاديمي واضح', display_order: 3 },

  // ─── Outstanding Achievement templates ───────────────────────────────────
  { category_name: 'Outstanding Achievement', locale: 'en', text: 'Exceptional performance in assessment', display_order: 1 },
  { category_name: 'Outstanding Achievement', locale: 'en', text: 'Represented the school with distinction', display_order: 2 },
  { category_name: 'Outstanding Achievement', locale: 'ar', text: 'أداء استثنائي في التقييم', display_order: 1 },
  { category_name: 'Outstanding Achievement', locale: 'ar', text: 'مثّل المدرسة بتميّز', display_order: 2 },

  // ─── Principal's Award templates ─────────────────────────────────────────
  { category_name: "Principal's Award", locale: 'en', text: 'Exemplary conduct and academic achievement', display_order: 1 },
  { category_name: "Principal's Award", locale: 'en', text: 'Outstanding contribution to school community', display_order: 2 },
  { category_name: "Principal's Award", locale: 'ar', text: 'سلوك مثالي وتحصيل أكاديمي', display_order: 1 },
  { category_name: "Principal's Award", locale: 'ar', text: 'مساهمة متميزة في مجتمع المدرسة', display_order: 2 },

  // ─── Verbal Warning templates ────────────────────────────────────────────
  { category_name: 'Verbal Warning', locale: 'en', text: 'Disrupted class learning', display_order: 1 },
  { category_name: 'Verbal Warning', locale: 'en', text: 'Late to class without valid reason', display_order: 2 },
  { category_name: 'Verbal Warning', locale: 'en', text: 'Failed to complete homework', display_order: 3 },
  { category_name: 'Verbal Warning', locale: 'ar', text: 'تعطيل العملية التعليمية', display_order: 1 },
  { category_name: 'Verbal Warning', locale: 'ar', text: 'تأخر عن الحصة بدون سبب', display_order: 2 },
  { category_name: 'Verbal Warning', locale: 'ar', text: 'عدم إكمال الواجب المنزلي', display_order: 3 },

  // ─── Written Warning templates ───────────────────────────────────────────
  { category_name: 'Written Warning', locale: 'en', text: 'Repeated disruptive behaviour', display_order: 1 },
  { category_name: 'Written Warning', locale: 'en', text: 'Disrespectful language towards staff', display_order: 2 },
  { category_name: 'Written Warning', locale: 'en', text: 'Persistent refusal to follow instructions', display_order: 3 },
  { category_name: 'Written Warning', locale: 'ar', text: 'سلوك مزعج متكرر', display_order: 1 },
  { category_name: 'Written Warning', locale: 'ar', text: 'لغة غير محترمة تجاه الموظفين', display_order: 2 },
  { category_name: 'Written Warning', locale: 'ar', text: 'رفض مستمر لاتباع التعليمات', display_order: 3 },

  // ─── Detention templates ─────────────────────────────────────────────────
  { category_name: 'Detention', locale: 'en', text: 'Accumulated behaviour warnings', display_order: 1 },
  { category_name: 'Detention', locale: 'en', text: 'Serious disruption to learning', display_order: 2 },
  { category_name: 'Detention', locale: 'ar', text: 'تراكم تحذيرات سلوكية', display_order: 1 },
  { category_name: 'Detention', locale: 'ar', text: 'تعطيل خطير للعملية التعليمية', display_order: 2 },

  // ─── Suspension (Internal) templates ─────────────────────────────────────
  { category_name: 'Suspension (Internal)', locale: 'en', text: 'Serious behavioural incident requiring internal isolation', display_order: 1 },
  { category_name: 'Suspension (Internal)', locale: 'en', text: 'Persistent misconduct despite interventions', display_order: 2 },
  { category_name: 'Suspension (Internal)', locale: 'ar', text: 'حادثة سلوكية خطيرة تتطلب عزلاً داخلياً', display_order: 1 },
  { category_name: 'Suspension (Internal)', locale: 'ar', text: 'سوء سلوك مستمر رغم التدخلات', display_order: 2 },

  // ─── Suspension (External) templates ─────────────────────────────────────
  { category_name: 'Suspension (External)', locale: 'en', text: 'Serious breach of school code of conduct', display_order: 1 },
  { category_name: 'Suspension (External)', locale: 'en', text: 'Behaviour endangering safety of others', display_order: 2 },
  { category_name: 'Suspension (External)', locale: 'ar', text: 'انتهاك خطير لقواعد السلوك المدرسي', display_order: 1 },
  { category_name: 'Suspension (External)', locale: 'ar', text: 'سلوك يهدد سلامة الآخرين', display_order: 2 },

  // ─── Expulsion templates ─────────────────────────────────────────────────
  { category_name: 'Expulsion', locale: 'en', text: 'Extreme breach of school policy', display_order: 1 },
  { category_name: 'Expulsion', locale: 'ar', text: 'انتهاك جسيم لسياسة المدرسة', display_order: 1 },

  // ─── Note to File templates ──────────────────────────────────────────────
  { category_name: 'Note to File', locale: 'en', text: 'General observation recorded for reference', display_order: 1 },
  { category_name: 'Note to File', locale: 'en', text: 'Conversation with student documented', display_order: 2 },
  { category_name: 'Note to File', locale: 'ar', text: 'ملاحظة عامة للسجل', display_order: 1 },
  { category_name: 'Note to File', locale: 'ar', text: 'توثيق محادثة مع الطالب', display_order: 2 },

  // ─── Observation templates ───────────────────────────────────────────────
  { category_name: 'Observation', locale: 'en', text: 'Behavioural pattern noted for monitoring', display_order: 1 },
  { category_name: 'Observation', locale: 'en', text: 'Social interaction observation', display_order: 2 },
  { category_name: 'Observation', locale: 'ar', text: 'نمط سلوكي ملحوظ للمتابعة', display_order: 1 },
  { category_name: 'Observation', locale: 'ar', text: 'ملاحظة تفاعل اجتماعي', display_order: 2 },
];

export interface AwardTypeSeed {
  name: string;
  name_ar: string;
  description: string;
  points_threshold: number;
  repeat_mode: string;
  tier_group: string;
  tier_level: number;
  supersedes_lower_tiers: boolean;
  icon: string;
  color: string;
  display_order: number;
}

export const AWARD_TYPE_SEEDS: AwardTypeSeed[] = [
  { name: 'Bronze Award', name_ar: 'جائزة برونزية', description: 'Awarded for reaching 50 positive points', points_threshold: 50, repeat_mode: 'once_per_year', tier_group: 'achievement_tier', tier_level: 1, supersedes_lower_tiers: false, icon: 'medal', color: '#cd7f32', display_order: 1 },
  { name: 'Silver Award', name_ar: 'جائزة فضية', description: 'Awarded for reaching 100 positive points', points_threshold: 100, repeat_mode: 'once_per_year', tier_group: 'achievement_tier', tier_level: 2, supersedes_lower_tiers: true, icon: 'medal', color: '#c0c0c0', display_order: 2 },
  { name: 'Gold Award', name_ar: 'جائزة ذهبية', description: 'Awarded for reaching 200 positive points', points_threshold: 200, repeat_mode: 'once_per_year', tier_group: 'achievement_tier', tier_level: 3, supersedes_lower_tiers: true, icon: 'medal', color: '#ffd700', display_order: 3 },
  { name: "Principal's Award", name_ar: 'جائزة المدير', description: 'Awarded for reaching 500 positive points', points_threshold: 500, repeat_mode: 'once_per_year', tier_group: 'achievement_tier', tier_level: 4, supersedes_lower_tiers: true, icon: 'trophy', color: '#8b5cf6', display_order: 4 },
];

/**
 * Seed behaviour categories, description templates, and award types for a tenant.
 * Called during tenant provisioning.
 */
export async function seedBehaviourData(
  prisma: PrismaClient,
  tenantId: string,
): Promise<void> {
  // 1. Create categories
  const categoryMap = new Map<string, string>();
  for (const cat of BEHAVIOUR_CATEGORY_SEEDS) {
    const created = await prisma.behaviourCategory.create({
      data: {
        tenant_id: tenantId,
        name: cat.name,
        name_ar: cat.name_ar,
        polarity: cat.polarity as never,
        severity: cat.severity,
        point_value: cat.point_value,
        color: cat.color,
        icon: cat.icon,
        requires_follow_up: cat.requires_follow_up,
        requires_parent_notification: cat.requires_parent_notification,
        parent_visible: cat.parent_visible,
        benchmark_category: cat.benchmark_category as never,
        display_order: cat.display_order,
        is_active: true,
        is_system: cat.is_system,
      },
    });
    categoryMap.set(cat.name, created.id);
  }

  // 2. Create description templates
  for (const tmpl of DESCRIPTION_TEMPLATE_SEEDS) {
    const categoryId = categoryMap.get(tmpl.category_name);
    if (!categoryId) continue;
    await prisma.behaviourDescriptionTemplate.create({
      data: {
        tenant_id: tenantId,
        category_id: categoryId,
        locale: tmpl.locale,
        text: tmpl.text,
        display_order: tmpl.display_order,
        is_active: true,
        is_system: true,
      },
    });
  }

  // 3. Create award types
  for (const award of AWARD_TYPE_SEEDS) {
    await prisma.behaviourAwardType.create({
      data: {
        tenant_id: tenantId,
        name: award.name,
        name_ar: award.name_ar,
        description: award.description,
        points_threshold: award.points_threshold,
        repeat_mode: award.repeat_mode,
        tier_group: award.tier_group,
        tier_level: award.tier_level,
        supersedes_lower_tiers: award.supersedes_lower_tiers,
        icon: award.icon,
        color: award.color,
        display_order: award.display_order,
        is_active: true,
      },
    });
  }

  // 4. Register sequences (BH, SN, IV, CP, AP, EX)
  // Note: TenantSequence has no prefix column — the prefix is derived
  // from sequence_type at the application layer.
  const sequenceTypes = [
    'behaviour_incident',
    'behaviour_sanction',
    'behaviour_intervention',
    'safeguarding_concern',
    'behaviour_appeal',
    'behaviour_exclusion',
  ];

  for (const sequenceType of sequenceTypes) {
    await prisma.tenantSequence.upsert({
      where: {
        tenant_id_sequence_type: {
          tenant_id: tenantId,
          sequence_type: sequenceType,
        },
      },
      create: {
        tenant_id: tenantId,
        sequence_type: sequenceType,
        current_value: 0,
      },
      update: {},
    });
  }

  // 5. Seed default policy rules
  await seedDefaultPolicyRules(prisma, tenantId, categoryMap);
}

// ─── Default Policy Rules ──────────────────────────────────────────────────

interface PolicyRuleSeedAction {
  action_type: string;
  action_config: Record<string, unknown>;
  execution_order: number;
}

interface PolicyRuleSeed {
  name: string;
  description: string;
  stage: string;
  priority: number;
  match_strategy: string;
  stop_processing_stage: boolean;
  conditionsFn: (catMap: Map<string, string>) => Record<string, unknown>;
  actionsFn: (catMap: Map<string, string>) => PolicyRuleSeedAction[];
}

const DEFAULT_POLICY_RULES: PolicyRuleSeed[] = [
  {
    name: '3 verbal warnings in 30 days → written warning',
    description:
      'Automatically escalates to a written warning when a student receives 3 or more verbal warnings within a 30-day rolling window.',
    stage: 'consequence',
    priority: 100,
    match_strategy: 'first_match',
    stop_processing_stage: false,
    conditionsFn: (catMap) => ({
      polarity: 'negative',
      repeat_count_min: 3,
      repeat_window_days: 30,
      repeat_category_ids: [catMap.get('Verbal Warning')].filter(Boolean),
    }),
    actionsFn: (catMap) => [
      {
        action_type: 'auto_escalate',
        action_config: {
          target_category_id: catMap.get('Written Warning') ?? '',
          reason: 'Auto-escalated: 3 verbal warnings in 30 days',
        },
        execution_order: 0,
      },
      {
        action_type: 'notify_roles',
        action_config: {
          roles: ['year_head'],
          message_template:
            'Student has received a third verbal warning in 30 days and has been escalated to a written warning.',
          priority: 'normal',
        },
        execution_order: 1,
      },
    ],
  },
  {
    name: 'Suspension for SEND students requires deputy approval',
    description:
      'Any suspension-level incident involving a student with SEND requires deputy principal approval before proceeding.',
    stage: 'approval',
    priority: 100,
    match_strategy: 'first_match',
    stop_processing_stage: false,
    conditionsFn: () => ({
      severity_min: 7,
      student_has_send: true,
      polarity: 'negative',
    }),
    actionsFn: () => [
      {
        action_type: 'require_approval',
        action_config: {
          approver_role: 'deputy_principal',
          reason: 'SEND student suspension requires deputy approval',
        },
        execution_order: 0,
      },
      {
        action_type: 'create_task',
        action_config: {
          task_type: 'follow_up',
          title:
            'SENCO review required — SEND student suspension pending approval',
          assigned_to_role: 'senco',
          due_in_school_days: 2,
          priority: 'high',
        },
        execution_order: 1,
      },
    ],
  },
  {
    name: 'Expulsion requires principal approval',
    description:
      'All expulsion-level incidents must be approved by the principal before any consequence is applied.',
    stage: 'approval',
    priority: 50,
    match_strategy: 'first_match',
    stop_processing_stage: true,
    conditionsFn: (catMap) => ({
      category_ids: [catMap.get('Expulsion')].filter(Boolean),
    }),
    actionsFn: () => [
      {
        action_type: 'require_approval',
        action_config: {
          approver_role: 'principal',
          reason: 'Expulsion requires principal approval',
        },
        execution_order: 0,
      },
    ],
  },
  {
    name: 'Negative incident above severity threshold → notify parent',
    description:
      'Sends a parent notification for all negative incidents with severity 3 or above.',
    stage: 'notification',
    priority: 100,
    match_strategy: 'all_matching',
    stop_processing_stage: false,
    conditionsFn: () => ({
      polarity: 'negative',
      severity_min: 3,
    }),
    actionsFn: () => [
      {
        action_type: 'require_parent_notification',
        action_config: { priority: 'immediate' },
        execution_order: 0,
      },
    ],
  },
  {
    name: 'High-severity negative incident → flag for management review',
    description:
      'Flags any high-severity negative incident for management review and notifies the year head.',
    stage: 'alerting',
    priority: 100,
    match_strategy: 'all_matching',
    stop_processing_stage: false,
    conditionsFn: () => ({
      polarity: 'negative',
      severity_min: 7,
    }),
    actionsFn: () => [
      {
        action_type: 'flag_for_review',
        action_config: {
          reason: 'High-severity incident flagged for management review',
          priority: 'high',
        },
        execution_order: 0,
      },
      {
        action_type: 'notify_roles',
        action_config: {
          roles: ['year_head', 'deputy_principal'],
          message_template:
            'A high-severity incident has been logged and requires review.',
          priority: 'urgent',
        },
        execution_order: 1,
      },
    ],
  },
];

const STAGE_TO_PRISMA_SEED: Record<string, string> = {
  consequence: 'consequence',
  approval: 'approval_stage',
  notification: 'notification_stage',
  support: 'support',
  alerting: 'alerting',
};

async function seedDefaultPolicyRules(
  prisma: PrismaClient,
  tenantId: string,
  categoryMap: Map<string, string>,
) {
  // Check if rules already exist for this tenant
  const existingCount = await prisma.behaviourPolicyRule.count({
    where: { tenant_id: tenantId },
  });
  if (existingCount > 0) return;

  // Get a system user for changed_by_id (first user in the tenant)
  const systemUser = await prisma.tenantMembership.findFirst({
    where: { tenant_id: tenantId },
    select: { user_id: true },
  });
  const changedById = systemUser?.user_id ?? '00000000-0000-0000-0000-000000000000';

  for (const ruleSeed of DEFAULT_POLICY_RULES) {
    const conditions = ruleSeed.conditionsFn(categoryMap);
    const actions = ruleSeed.actionsFn(categoryMap);

    const rule = await prisma.behaviourPolicyRule.create({
      data: {
        tenant_id: tenantId,
        name: ruleSeed.name,
        description: ruleSeed.description,
        is_active: true,
        stage: (STAGE_TO_PRISMA_SEED[ruleSeed.stage] ??
          ruleSeed.stage) as never,
        priority: ruleSeed.priority,
        match_strategy: ruleSeed.match_strategy as never,
        stop_processing_stage: ruleSeed.stop_processing_stage,
        conditions: conditions as never,
        current_version: 1,
      },
    });

    // Create actions
    if (actions.length > 0) {
      for (const action of actions) {
        await prisma.behaviourPolicyRuleAction.create({
          data: {
            tenant_id: tenantId,
            rule_id: rule.id,
            action_type: action.action_type as never,
            action_config: action.action_config as never,
            execution_order: action.execution_order,
          },
        });
      }
    }

    // Snapshot version 1
    await prisma.behaviourPolicyRuleVersion.create({
      data: {
        tenant_id: tenantId,
        rule_id: rule.id,
        version: 1,
        name: ruleSeed.name,
        conditions: conditions as never,
        actions: actions.map((a) => ({
          action_type: a.action_type,
          action_config: a.action_config,
          execution_order: a.execution_order,
        })) as never,
        stage: (STAGE_TO_PRISMA_SEED[ruleSeed.stage] ??
          ruleSeed.stage) as never,
        match_strategy: ruleSeed.match_strategy as never,
        priority: ruleSeed.priority,
        changed_by_id: changedById,
        change_reason: 'Default policy rule — seeded on tenant creation',
      },
    });
  }
}
