import type { PrismaClient, Prisma } from '@prisma/client';

/**
 * Inbox defaults seeding (Wave 1 / Impl 01 of new-inbox rebuild).
 *
 * Idempotent. Callable from both:
 *   - packages/prisma/seed.ts (global `pnpm db:seed` for dev / fresh prod)
 *   - apps/api TenantsService.createTenant flow (new tenant bootstrap)
 *
 * Seeds three things per tenant:
 *   1. tenant_settings_inbox  — one row with default kill-switches + fallback.
 *   2. tenant_messaging_policy — the 81-row role-pair matrix with defaults.
 *   3. safeguarding_keywords  — starter keyword list across 5 categories.
 *
 * Re-running on a tenant that already has rows is a no-op (upsert on the
 * respective unique constraints).
 */

export const MESSAGING_ROLES = [
  'owner',
  'principal',
  'vice_principal',
  'office',
  'finance',
  'nurse',
  'teacher',
  'parent',
  'student',
] as const;

export type MessagingRoleValue = (typeof MESSAGING_ROLES)[number];

type MatrixRow = Record<MessagingRoleValue, boolean>;

// ─── Default role-pair matrix (PLAN.md §4) ──────────────────────────────────
// Read as: row = sender, column = recipient. "Can row send to column?"
// Diagonal cells (self-to-self) are `true` for staff tiers and `false` for
// parent/student — the policy service enforces that "direct self" is not
// valid regardless. Parents / students have every cell OFF by default so
// they are inbox-only out of the box.
export const DEFAULT_MESSAGING_POLICY_MATRIX: Record<MessagingRoleValue, MatrixRow> = {
  owner: {
    owner: true,
    principal: true,
    vice_principal: true,
    office: true,
    finance: true,
    nurse: true,
    teacher: true,
    parent: true,
    student: true,
  },
  principal: {
    owner: true,
    principal: true,
    vice_principal: true,
    office: true,
    finance: true,
    nurse: true,
    teacher: true,
    parent: true,
    student: true,
  },
  vice_principal: {
    owner: true,
    principal: true,
    vice_principal: true,
    office: true,
    finance: true,
    nurse: true,
    teacher: true,
    parent: true,
    student: true,
  },
  office: {
    owner: true,
    principal: true,
    vice_principal: true,
    office: true,
    finance: true,
    nurse: true,
    teacher: true,
    parent: true,
    student: false,
  },
  finance: {
    owner: true,
    principal: true,
    vice_principal: true,
    office: true,
    finance: true,
    nurse: false,
    teacher: true,
    parent: true,
    student: false,
  },
  nurse: {
    owner: true,
    principal: true,
    vice_principal: true,
    office: true,
    finance: false,
    nurse: true,
    teacher: true,
    parent: true,
    student: false,
  },
  teacher: {
    owner: true,
    principal: true,
    vice_principal: true,
    office: true,
    finance: true,
    nurse: true,
    teacher: true,
    parent: true,
    student: true,
  },
  parent: {
    owner: false,
    principal: false,
    vice_principal: false,
    office: false,
    finance: false,
    nurse: false,
    teacher: false,
    parent: false,
    student: false,
  },
  student: {
    owner: false,
    principal: false,
    vice_principal: false,
    office: false,
    finance: false,
    nurse: false,
    teacher: false,
    parent: false,
    student: false,
  },
};

// ─── Starter safeguarding keyword list ──────────────────────────────────────
// Neutral, generic terms that any school safeguarding team would recognise.
// Split across five categories so the dashboard can filter by type.
// Tenants edit / add / deactivate via Settings → Communications → Safeguarding.

export type SeverityValue = 'low' | 'medium' | 'high';

export const STARTER_SAFEGUARDING_KEYWORDS: {
  keyword: string;
  severity: SeverityValue;
  category: string;
}[] = [
  // Bullying
  { keyword: 'bully', severity: 'medium', category: 'bullying' },
  { keyword: 'bullying', severity: 'medium', category: 'bullying' },
  { keyword: 'harass', severity: 'medium', category: 'bullying' },
  { keyword: 'harassment', severity: 'medium', category: 'bullying' },
  { keyword: 'intimidate', severity: 'medium', category: 'bullying' },
  { keyword: 'threaten', severity: 'high', category: 'bullying' },
  { keyword: 'kill yourself', severity: 'high', category: 'bullying' },

  // Self-harm / mental health distress
  { keyword: 'suicide', severity: 'high', category: 'self_harm' },
  { keyword: 'kill myself', severity: 'high', category: 'self_harm' },
  { keyword: 'self harm', severity: 'high', category: 'self_harm' },
  { keyword: 'self-harm', severity: 'high', category: 'self_harm' },
  { keyword: 'cut myself', severity: 'high', category: 'self_harm' },
  { keyword: 'want to die', severity: 'high', category: 'self_harm' },
  { keyword: 'end it all', severity: 'medium', category: 'self_harm' },

  // Abuse
  { keyword: 'abuse', severity: 'high', category: 'abuse' },
  { keyword: 'abused', severity: 'high', category: 'abuse' },
  { keyword: 'hit me', severity: 'high', category: 'abuse' },
  { keyword: 'beat me', severity: 'high', category: 'abuse' },
  { keyword: 'hurt me', severity: 'medium', category: 'abuse' },
  { keyword: 'scared at home', severity: 'medium', category: 'abuse' },
  { keyword: 'afraid to go home', severity: 'high', category: 'abuse' },

  // Inappropriate contact / grooming signals
  { keyword: 'meet me alone', severity: 'high', category: 'inappropriate_contact' },
  { keyword: "don't tell anyone", severity: 'medium', category: 'inappropriate_contact' },
  { keyword: 'our secret', severity: 'medium', category: 'inappropriate_contact' },
  { keyword: 'send me a picture', severity: 'high', category: 'inappropriate_contact' },
  { keyword: 'dont tell your parents', severity: 'high', category: 'inappropriate_contact' },
  { keyword: 'between us', severity: 'low', category: 'inappropriate_contact' },

  // Weapons / imminent harm
  { keyword: 'knife', severity: 'high', category: 'weapons' },
  { keyword: 'gun', severity: 'high', category: 'weapons' },
  { keyword: 'weapon', severity: 'high', category: 'weapons' },
  { keyword: 'shoot up', severity: 'high', category: 'weapons' },
];

/**
 * Upsert inbox defaults for a single tenant. Safe to re-run.
 */
export async function seedInboxDefaultsForTenant(
  prisma: PrismaClient,
  tenantId: string,
): Promise<void> {
  // 1. tenant_settings_inbox — unique on tenant_id
  await prisma.tenantSettingsInbox.upsert({
    where: { tenant_id: tenantId },
    update: {},
    create: { tenant_id: tenantId },
  });

  // 2. tenant_messaging_policy — 81 rows per tenant
  const policyRows: Prisma.TenantMessagingPolicyCreateManyInput[] = [];
  for (const senderRole of MESSAGING_ROLES) {
    for (const recipientRole of MESSAGING_ROLES) {
      policyRows.push({
        tenant_id: tenantId,
        sender_role: senderRole,
        recipient_role: recipientRole,
        allowed: DEFAULT_MESSAGING_POLICY_MATRIX[senderRole][recipientRole],
      });
    }
  }
  await prisma.tenantMessagingPolicy.createMany({
    data: policyRows,
    skipDuplicates: true,
  });

  // 3. safeguarding_keywords — starter list
  const keywordRows: Prisma.SafeguardingKeywordCreateManyInput[] =
    STARTER_SAFEGUARDING_KEYWORDS.map((kw) => ({
      tenant_id: tenantId,
      keyword: kw.keyword,
      severity: kw.severity,
      category: kw.category,
      active: true,
    }));
  await prisma.safeguardingKeyword.createMany({
    data: keywordRows,
    skipDuplicates: true,
  });
}

/**
 * Seed inbox defaults for every existing tenant. Used by `pnpm db:seed`.
 */
export async function seedInboxDefaultsForAllTenants(prisma: PrismaClient): Promise<void> {
  const tenants = await prisma.tenant.findMany({ select: { id: true } });
  for (const tenant of tenants) {
    await seedInboxDefaultsForTenant(prisma, tenant.id);
  }
}
