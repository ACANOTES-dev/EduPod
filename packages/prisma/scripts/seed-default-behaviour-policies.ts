/**
 * Seed default behaviour policy rules for every tenant.
 *
 * The behaviour module ships with 12 default categories but NO default policy
 * rules — meaning the policy engine never matches anything for new tenants and
 * the per-incident policy panel stays empty. This script installs a small,
 * opinionated set of defaults covering all five stages of the engine so the
 * ledger produces meaningful output out of the box.
 *
 * Idempotency: each rule carries a sentinel description starting with
 * '[default-policy]'. Existing rules matching a sentinel are left alone; missing
 * rules are created. Safe to re-run.
 *
 * Usage:
 *   npx tsx packages/prisma/scripts/seed-default-behaviour-policies.ts
 *
 * On server:
 *   cd /opt/edupod/app && set -a; source .env; set +a && \
 *     npx tsx packages/prisma/scripts/seed-default-behaviour-policies.ts
 */
/* eslint-disable no-console -- seed script uses console for progress */
import { PrismaClient, Prisma } from '@prisma/client';

const connectionString = process.env.DATABASE_MIGRATE_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_MIGRATE_URL or DATABASE_URL must be set');
const prisma = new PrismaClient({ datasources: { db: { url: connectionString } } });

const SENTINEL = '[default-policy]';

type DefaultRule = {
  name: string;
  description: string;
  stage: 'consequence' | 'approval_stage' | 'notification_stage' | 'support' | 'alerting';
  priority: number;
  match_strategy: 'first_match' | 'all_matching';
  stop_processing_stage: boolean;
  conditions: Record<string, unknown>;
  cooldown_hours: number | null;
  actions: Array<{
    action_type:
      | 'auto_escalate'
      | 'create_sanction'
      | 'require_approval'
      | 'require_parent_meeting'
      | 'require_parent_notification'
      | 'create_task'
      | 'create_intervention'
      | 'notify_roles'
      | 'notify_users'
      | 'flag_for_review'
      | 'block_without_approval';
    action_config: Record<string, unknown>;
    execution_order: number;
  }>;
};

const DEFAULT_RULES: DefaultRule[] = [
  {
    name: 'Serious incident — flag for review',
    description: `${SENTINEL} Flags any negative incident with severity 7+ (suspensions, expulsions) for urgent leadership review.`,
    stage: 'consequence',
    priority: 10,
    match_strategy: 'first_match',
    stop_processing_stage: false,
    conditions: { polarity: 'negative', severity_min: 7 },
    cooldown_hours: 0,
    actions: [
      {
        action_type: 'flag_for_review',
        action_config: { reason: 'Severity 7+ negative incident', priority: 'urgent' },
        execution_order: 0,
      },
    ],
  },
  {
    name: 'Follow-up task — written warning',
    description: `${SENTINEL} Creates a 3-day follow-up task for written warnings so mid-tier negative incidents don't slip.`,
    stage: 'consequence',
    priority: 20,
    match_strategy: 'first_match',
    stop_processing_stage: false,
    conditions: { polarity: 'negative', severity_min: 4, severity_max: 6 },
    cooldown_hours: 24,
    actions: [
      {
        action_type: 'create_task',
        action_config: {
          task_type: 'follow_up',
          title: 'Review written warning and parent response',
          due_in_school_days: 3,
          priority: 'medium',
          assigned_to_role: 'homeroom_teacher',
        },
        execution_order: 0,
      },
    ],
  },
  {
    name: 'Parent notification — positive recognition',
    description: `${SENTINEL} Sends an immediate parent notification for major positive recognitions (Outstanding Achievement, Principal's Award).`,
    stage: 'notification_stage',
    priority: 10,
    match_strategy: 'first_match',
    stop_processing_stage: false,
    conditions: { polarity: 'positive', severity_min: 5 },
    cooldown_hours: 0,
    actions: [
      {
        action_type: 'require_parent_notification',
        action_config: { channels: ['email', 'in_app'], priority: 'immediate' },
        execution_order: 0,
      },
    ],
  },
  {
    name: 'Notify leadership — suspension or expulsion',
    description: `${SENTINEL} Pages principal and pastoral lead whenever a suspension or expulsion is logged.`,
    stage: 'notification_stage',
    priority: 20,
    match_strategy: 'first_match',
    stop_processing_stage: false,
    conditions: { polarity: 'negative', severity_min: 7 },
    cooldown_hours: 0,
    actions: [
      {
        action_type: 'notify_roles',
        action_config: { roles: ['principal', 'pastoral_lead'], priority: 'urgent' },
        execution_order: 0,
      },
    ],
  },
  {
    name: 'Parent meeting — serious behaviour',
    description: `${SENTINEL} Requires a parent meeting within 5 school days for any severity 7+ negative incident.`,
    stage: 'support',
    priority: 10,
    match_strategy: 'first_match',
    stop_processing_stage: false,
    conditions: { polarity: 'negative', severity_min: 7 },
    cooldown_hours: 168,
    actions: [
      {
        action_type: 'require_parent_meeting',
        action_config: {
          due_within_school_days: 5,
          assigned_to_role: 'year_head',
          notes: 'Discuss incident, expectations, and support plan.',
        },
        execution_order: 0,
      },
    ],
  },
  {
    name: 'Mentoring intervention — repeat offender',
    description: `${SENTINEL} Creates a mentoring intervention when a student hits 3 or more negative incidents in 30 days.`,
    stage: 'support',
    priority: 20,
    match_strategy: 'first_match',
    stop_processing_stage: false,
    conditions: { polarity: 'negative', repeat_count_min: 3, repeat_window_days: 30 },
    cooldown_hours: 720,
    actions: [
      {
        action_type: 'create_intervention',
        action_config: {
          type: 'mentoring',
          title: 'Behaviour mentoring — pattern detected',
          assigned_to_role: 'pastoral_lead',
        },
        execution_order: 0,
      },
    ],
  },
  {
    name: 'Pattern alert — recurring negative behaviour',
    description: `${SENTINEL} Surfaces an at-risk alert when a student accumulates 3+ negative incidents in 30 days.`,
    stage: 'alerting',
    priority: 10,
    match_strategy: 'first_match',
    stop_processing_stage: false,
    conditions: { polarity: 'negative', repeat_count_min: 3, repeat_window_days: 30 },
    cooldown_hours: 168,
    actions: [
      {
        action_type: 'flag_for_review',
        action_config: { reason: 'Recurring negative behaviour pattern', priority: 'high' },
        execution_order: 0,
      },
    ],
  },
  {
    name: 'SEND student — extra review',
    description: `${SENTINEL} Flags negative incidents involving SEND students so the SEND coordinator is looped in early.`,
    stage: 'alerting',
    priority: 20,
    match_strategy: 'first_match',
    stop_processing_stage: false,
    conditions: { polarity: 'negative', severity_min: 4, student_has_send: true },
    cooldown_hours: 24,
    actions: [
      {
        action_type: 'notify_roles',
        action_config: { roles: ['send_coordinator', 'pastoral_lead'], priority: 'urgent' },
        execution_order: 0,
      },
    ],
  },
];

async function seedForTenant(tenantId: string, tenantName: string) {
  const existingSentinelRules = await prisma.behaviourPolicyRule.findMany({
    where: { tenant_id: tenantId, description: { startsWith: SENTINEL } },
    select: { name: true },
  });
  const existingNames = new Set(existingSentinelRules.map((r) => r.name));

  let created = 0;
  for (const rule of DEFAULT_RULES) {
    if (existingNames.has(rule.name)) continue;

    const systemUserId = await getSystemUserId(tenantId);

    await prisma.$transaction(async (tx) => {
      const row = await tx.behaviourPolicyRule.create({
        data: {
          tenant_id: tenantId,
          name: rule.name,
          description: rule.description,
          is_active: true,
          stage: rule.stage,
          priority: rule.priority,
          match_strategy: rule.match_strategy,
          stop_processing_stage: rule.stop_processing_stage,
          conditions: rule.conditions as unknown as Prisma.InputJsonValue,
          cooldown_hours: rule.cooldown_hours,
          current_version: 1,
        },
      });

      if (rule.actions.length > 0) {
        await tx.behaviourPolicyRuleAction.createMany({
          data: rule.actions.map((a) => ({
            tenant_id: tenantId,
            rule_id: row.id,
            action_type: a.action_type,
            action_config: a.action_config as Prisma.InputJsonValue,
            execution_order: a.execution_order,
          })),
        });
      }

      await tx.behaviourPolicyRuleVersion.create({
        data: {
          tenant_id: tenantId,
          rule_id: row.id,
          version: 1,
          name: rule.name,
          conditions: rule.conditions as unknown as Prisma.InputJsonValue,
          actions: rule.actions.map((a) => ({
            action_type: a.action_type,
            action_config: a.action_config,
            execution_order: a.execution_order,
          })) as unknown as Prisma.InputJsonValue,
          stage: rule.stage,
          match_strategy: rule.match_strategy,
          priority: rule.priority,
          changed_by_id: systemUserId,
          change_reason: 'Default policy seed',
        },
      });
    });
    created++;
  }

  console.log(
    `  ${tenantName} (${tenantId}): ${created} rule(s) created, ${existingNames.size} already present`,
  );
}

async function getSystemUserId(tenantId: string): Promise<string> {
  // Pick any owner/admin to stand in as the policy author — these are append-only
  // version rows and the user FK just needs to resolve.
  const owner = await prisma.tenantMembership.findFirst({
    where: { tenant_id: tenantId, membership_status: 'active' },
    orderBy: { created_at: 'asc' },
    select: { user_id: true },
  });
  if (!owner) {
    throw new Error(`No active membership found for tenant ${tenantId}`);
  }
  return owner.user_id;
}

async function main() {
  console.log('Seeding default behaviour policy rules …');
  const tenants = await prisma.tenant.findMany({
    where: { status: 'active' },
    select: { id: true, name: true },
    orderBy: { created_at: 'asc' },
  });
  console.log(`Found ${tenants.length} active tenant(s).`);

  for (const t of tenants) {
    try {
      await seedForTenant(t.id, t.name);
    } catch (err) {
      console.error(`  FAILED for ${t.name} (${t.id}):`, err);
    }
  }
  console.log('Done.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
