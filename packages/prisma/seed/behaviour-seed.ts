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
}
