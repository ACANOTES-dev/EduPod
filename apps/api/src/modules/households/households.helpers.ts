// ─── Completion issues ────────────────────────────────────────────────────────

/**
 * Derives the list of completion issue keys for a household.
 * A household needs completion when it lacks an emergency contact or a billing parent.
 */
export function buildCompletionIssues(
  needsCompletion: boolean,
  emergencyContactCount: number,
  primaryBillingParentId: string | null,
): string[] {
  if (!needsCompletion) return [];

  const issues: string[] = [];
  if (emergencyContactCount < 1) issues.push('missing_emergency_contact');
  if (primaryBillingParentId === null) issues.push('missing_billing_parent');
  return issues;
}

// ─── Preview projection ───────────────────────────────────────────────────────

/** Input shape from the Prisma select used in the preview endpoint. */
interface HouseholdPreviewRow {
  id: string;
  household_name: string;
  status: string;
  billing_parent: { first_name: string; last_name: string } | null;
  _count: { students: number; household_parents: number; emergency_contacts: number };
}

/**
 * Projects a raw household row (with billing_parent and _count) into the
 * standardised preview shape consumed by hover cards and tooltips.
 */
export function buildHouseholdPreviewResult(household: HouseholdPreviewRow) {
  const billingParentName = household.billing_parent
    ? `${household.billing_parent.first_name} ${household.billing_parent.last_name}`
    : 'No billing parent';

  return {
    id: household.id,
    entity_type: 'household',
    primary_label: household.household_name,
    secondary_label: billingParentName,
    status: household.status,
    facts: [
      { label: 'Students', value: String(household._count.students) },
      { label: 'Parents', value: String(household._count.household_parents) },
      {
        label: 'Emergency contacts',
        value: `${household._count.emergency_contacts}/3`,
      },
    ],
  };
}
