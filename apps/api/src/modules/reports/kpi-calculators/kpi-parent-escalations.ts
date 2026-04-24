import type { KpiCalculatorResult, PrismaTransaction } from './kpi-types';

/**
 * KPI #9: Parent escalations.
 *
 * Counts inbox conversations that:
 *   1. Have a participant whose `role_at_join` is `parent`,
 *   2. Have at least one staff-role participant with an unread count > 0,
 *   3. Have a `last_message_at` older than 48 hours.
 *
 * The staff-role participant check uses the tenant's admin/office/teacher
 * tier (anything that isn't `parent` or `student`). This is a "state" KPI
 * — no meaningful delta, so we return `null` there and ship with a
 * length-1 sparkline until the snapshot job lands in a later cycle.
 */
const STAFF_MESSAGING_ROLES = [
  'owner',
  'principal',
  'vice_principal',
  'office',
  'finance',
  'nurse',
  'teacher',
] as const;

export async function calculateParentEscalations(
  tx: PrismaTransaction,
  tenantId: string,
): Promise<KpiCalculatorResult> {
  const now = new Date();
  const fortyEightHoursAgo = new Date(now);
  fortyEightHoursAgo.setHours(fortyEightHoursAgo.getHours() - 48);

  const count = await tx.conversation.count({
    where: {
      tenant_id: tenantId,
      last_message_at: {
        lt: fortyEightHoursAgo,
      },
      participants: {
        some: {
          role_at_join: 'parent',
        },
      },
      AND: {
        participants: {
          some: {
            role_at_join: { in: [...STAFF_MESSAGING_ROLES] },
            unread_count: { gt: 0 },
          },
        },
      },
    },
  });

  return {
    value: count,
    value_raw: count,
    delta: null,
    sparkline: [count],
    severity: count > 5 ? 'warning' : null,
  };
}
