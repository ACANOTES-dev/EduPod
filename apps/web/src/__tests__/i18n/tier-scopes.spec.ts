import { readFileSync } from 'fs';
import { resolve } from 'path';

import { TIER_2_NAMESPACES } from '../../../i18n/tier-scopes';

type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

function loadEn(): Record<string, Json> {
  const path = resolve(__dirname, '../../..', 'messages', 'en.json');
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, Json>;
}

describe('Tier 2 namespace allowlist', () => {
  const en = loadEn();
  const topLevelKeys = new Set(Object.keys(en));

  it('every namespace in the allowlist exists as a top-level key in en.json', () => {
    const orphans = TIER_2_NAMESPACES.filter((ns) => !topLevelKeys.has(ns));
    expect(orphans).toEqual([]);
  });

  it('allowlist has no duplicate entries', () => {
    expect(new Set(TIER_2_NAMESPACES).size).toBe(TIER_2_NAMESPACES.length);
  });

  it('allowlist excludes obvious staff/admin/regulatory/payroll namespaces', () => {
    const forbiddenPrefixes = [
      // Hubs / settings / admin pages
      'admin',
      'platform',
      // Staff / HR
      'staff',
      'leave',
      'payroll',
      // Regulatory / compliance / audit
      'regulatory',
      'compliance',
      'auditLog',
      'dsarReview',
      'retention',
      // Safeguarding (staff-only by policy)
      'safeguarding',
      'childProtectionHub',
      // Behaviour management (parent appeals/recognition are separate
      // namespaces — parentAppeal/parentRecognition — included above)
      'behaviourAdmin',
      'behaviourSettings',
      'behaviourPolicyReplay',
      'behaviourHub',
      // Finance ops dashboards (parent-visible `finance` is included above)
      'financeBudgeting',
      'financeSuperHub',
      // Hubs (admin-only consolidated landing pages)
      'admissionsHub',
      'admissionsOverrides',
      'admissionsQueues',
      'admissionsSettings',
      'behaviourHub',
      'earlyWarningsHub',
      'engagementHub',
      'leaveHub',
      'learningHub',
      'operationsHub',
      'payrollHub',
      'peopleHub',
      'safeguardingHub',
      'wellbeingHub',
      'wellbeingNotificationsSettings',
      'wellbeingStaff',
      // AI internals
      'aiAuditSettings',
      'aiFlagsAdmin',
      // Pedagogy admin
      'academicYears',
      'academics',
      'classAssignments',
      'classes',
      'subjects',
      'yearGroups',
      'curriculum',
      // Operational admin
      'imports',
      'import',
      'pastoralImport',
      'responsePlans',
      'pastoral',
      'promotion',
      'documentGen',
      'failedCallbacks',
      'messagingPolicyPage',
      'reportsSettings',
      'scheduling',
      // RBAC / user management
      'roles',
      'users',
      'invitations',
      // Workflow state labels (admin-only display)
      'pending',
      'approvals',
      'approved',
      'cancelled',
      'rejected',
      'noApprovalRequests',
      'checkinFlagged',
      // Misc admin tooling
      'diary',
      'reports',
      'settings',
      'teacherAssessments',
    ];
    const leak = TIER_2_NAMESPACES.filter((ns) =>
      forbiddenPrefixes.some((f) => ns === f || ns.startsWith(f)),
    );
    expect(leak).toEqual([]);
  });
});
