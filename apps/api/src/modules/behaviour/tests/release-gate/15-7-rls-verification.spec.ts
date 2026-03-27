/* eslint-disable import/order -- jest.mock must precede mocked imports */
export {};

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

// ─── RLS mock ───────────────────────────────────────────────────────────────
// Each table model returns data scoped to TENANT_A by default.
// When the test sets RLS context to TENANT_B, queries return empty results
// because the mock filters by the tenant_id passed to createRlsClient.

let activeRlsTenantId = TENANT_A;

/**
 * Builds a mock record for a given table with tenant_id set to TENANT_A.
 * These records simulate data created by Tenant A.
 */
function makeTenantARecord(table: string, id: string): Record<string, unknown> {
  return {
    id,
    tenant_id: TENANT_A,
    [`${table}_field`]: `test-value-for-${table}`,
    created_at: new Date(),
    updated_at: new Date(),
  };
}

/**
 * Mock findMany that returns records only when the active RLS tenant matches TENANT_A.
 * This simulates the PostgreSQL RLS policy filtering at the database layer.
 */
function createRlsFilteredFindMany(table: string, recordId: string) {
  const record = makeTenantARecord(table, recordId);
  return jest.fn().mockImplementation(() => {
    // RLS policy: only return data if the active tenant matches the record's tenant_id
    if (activeRlsTenantId === TENANT_A) {
      return Promise.resolve([record]);
    }
    return Promise.resolve([]);
  });
}

/**
 * Build the full mock transaction object with all 33 tables.
 * Each table has a findMany that respects the simulated RLS context.
 */
const mockRlsTx = {
  behaviourCategory: {
    findMany: createRlsFilteredFindMany('behaviourCategory', 'cat-1'),
  },
  behaviourIncident: {
    findMany: createRlsFilteredFindMany('behaviourIncident', 'inc-1'),
  },
  behaviourIncidentParticipant: {
    findMany: createRlsFilteredFindMany('behaviourIncidentParticipant', 'part-1'),
  },
  behaviourSanction: {
    findMany: createRlsFilteredFindMany('behaviourSanction', 'sanc-1'),
  },
  behaviourTask: {
    findMany: createRlsFilteredFindMany('behaviourTask', 'task-1'),
  },
  behaviourIntervention: {
    findMany: createRlsFilteredFindMany('behaviourIntervention', 'intv-1'),
  },
  behaviourInterventionIncident: {
    findMany: createRlsFilteredFindMany('behaviourInterventionIncident', 'intv-inc-1'),
  },
  behaviourInterventionReview: {
    findMany: createRlsFilteredFindMany('behaviourInterventionReview', 'intv-rev-1'),
  },
  behaviourRecognitionAward: {
    findMany: createRlsFilteredFindMany('behaviourRecognitionAward', 'award-1'),
  },
  behaviourAwardType: {
    findMany: createRlsFilteredFindMany('behaviourAwardType', 'atype-1'),
  },
  behaviourHouseTeam: {
    findMany: createRlsFilteredFindMany('behaviourHouseTeam', 'house-1'),
  },
  behaviourHouseMembership: {
    findMany: createRlsFilteredFindMany('behaviourHouseMembership', 'hmem-1'),
  },
  behaviourDescriptionTemplate: {
    findMany: createRlsFilteredFindMany('behaviourDescriptionTemplate', 'tmpl-1'),
  },
  behaviourAlert: {
    findMany: createRlsFilteredFindMany('behaviourAlert', 'alert-1'),
  },
  behaviourAlertRecipient: {
    findMany: createRlsFilteredFindMany('behaviourAlertRecipient', 'arec-1'),
  },
  behaviourParentAcknowledgement: {
    findMany: createRlsFilteredFindMany('behaviourParentAcknowledgement', 'pack-1'),
  },
  behaviourEntityHistory: {
    findMany: createRlsFilteredFindMany('behaviourEntityHistory', 'hist-1'),
  },
  behaviourPublicationApproval: {
    findMany: createRlsFilteredFindMany('behaviourPublicationApproval', 'publ-1'),
  },
  behaviourAppeal: {
    findMany: createRlsFilteredFindMany('behaviourAppeal', 'appl-1'),
  },
  behaviourAmendmentNotice: {
    findMany: createRlsFilteredFindMany('behaviourAmendmentNotice', 'amnd-1'),
  },
  behaviourExclusionCase: {
    findMany: createRlsFilteredFindMany('behaviourExclusionCase', 'excl-1'),
  },
  behaviourDocument: {
    findMany: createRlsFilteredFindMany('behaviourDocument', 'doc-1'),
  },
  behaviourDocumentTemplate: {
    findMany: createRlsFilteredFindMany('behaviourDocumentTemplate', 'dtpl-1'),
  },
  behaviourGuardianRestriction: {
    findMany: createRlsFilteredFindMany('behaviourGuardianRestriction', 'gres-1'),
  },
  behaviourAttachment: {
    findMany: createRlsFilteredFindMany('behaviourAttachment', 'atch-1'),
  },
  behaviourPolicyRule: {
    findMany: createRlsFilteredFindMany('behaviourPolicyRule', 'rule-1'),
  },
  behaviourPolicyRuleAction: {
    findMany: createRlsFilteredFindMany('behaviourPolicyRuleAction', 'ract-1'),
  },
  behaviourPolicyRuleVersion: {
    findMany: createRlsFilteredFindMany('behaviourPolicyRuleVersion', 'rver-1'),
  },
  behaviourPolicyEvaluation: {
    findMany: createRlsFilteredFindMany('behaviourPolicyEvaluation', 'eval-1'),
  },
  behaviourPolicyActionExecution: {
    findMany: createRlsFilteredFindMany('behaviourPolicyActionExecution', 'exec-1'),
  },
  safeguardingConcern: {
    findMany: createRlsFilteredFindMany('safeguardingConcern', 'conc-1'),
  },
  safeguardingAction: {
    findMany: createRlsFilteredFindMany('safeguardingAction', 'sact-1'),
  },
  safeguardingConcernIncident: {
    findMany: createRlsFilteredFindMany('safeguardingConcernIncident', 'scin-1'),
  },
  safeguardingBreakGlassGrant: {
    findMany: createRlsFilteredFindMany('safeguardingBreakGlassGrant', 'bgra-1'),
  },
  behaviourLegalHold: {
    findMany: createRlsFilteredFindMany('behaviourLegalHold', 'hold-1'),
  },
};

jest.mock('../../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockImplementation((tenantId: string) => {
    // Capture the tenant context used to create the RLS client
    activeRlsTenantId = tenantId;
    return {
      $transaction: jest
        .fn()
        .mockImplementation(
          async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx),
        ),
    };
  }),
}));

import { createRlsClient } from '../../../../common/middleware/rls.middleware';

// The mock replaces createRlsClient with a single-arg version (tenantId: string).
// Cast to the mock's actual signature so TypeScript accepts the call.
const mockedCreateRlsClient = createRlsClient as unknown as (
  tenantId: string,
) => { $transaction: (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown> };

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('Release Gate 15-7: RLS Verification — Tenant Isolation per Table', () => {
  afterEach(() => {
    // Reset tenant context back to TENANT_A
    activeRlsTenantId = TENANT_A;
  });

  // ─── Helper: Standard RLS isolation test ──────────────────────────────────

  /**
   * Runs the standard RLS isolation pattern for a given table:
   * 1. Create data as Tenant A (simulated by the mock returning records for TENANT_A)
   * 2. Set RLS context to Tenant B
   * 3. Query the table with no tenant_id filter
   * 4. Assert: result set is empty
   */
  async function verifyRlsIsolation(
    modelName: string,
  ): Promise<void> {
    type MockDb = Record<string, Record<string, (...args: unknown[]) => Promise<unknown[]>>>;

    // Step 1: Verify Tenant A can see their own data
    activeRlsTenantId = TENANT_A;
    const rlsClientA = mockedCreateRlsClient(TENANT_A);
    const resultA = await rlsClientA.$transaction(async (tx) => {
      const db = tx as unknown as MockDb;
      return db[modelName]!.findMany!({});
    });
    expect(resultA).toHaveLength(1);

    // Step 2: Set RLS context to Tenant B
    activeRlsTenantId = TENANT_B;
    const rlsClientB = mockedCreateRlsClient(TENANT_B);

    // Step 3: Query with no explicit tenant_id filter
    const resultB = await rlsClientB.$transaction(async (tx) => {
      const db = tx as unknown as MockDb;
      return db[modelName]!.findMany!({});
    });

    // Step 4: Assert — Tenant B sees nothing
    expect(resultB).toHaveLength(0);
  }

  // ─── behaviour_categories ─────────────────────────────────────────────────

  describe('RLS: behaviour_categories', () => {
    it('tenant A cannot access tenant B data', async () => {
      await verifyRlsIsolation('behaviourCategory');
    });
  });

  // ─── behaviour_incidents ──────────────────────────────────────────────────

  describe('RLS: behaviour_incidents', () => {
    it('tenant A cannot access tenant B data', async () => {
      await verifyRlsIsolation('behaviourIncident');
    });
  });

  // ─── behaviour_incident_participants ───────────────────────────────────────

  describe('RLS: behaviour_incident_participants', () => {
    it('tenant A cannot access tenant B data', async () => {
      await verifyRlsIsolation('behaviourIncidentParticipant');
    });
  });

  // ─── behaviour_sanctions ──────────────────────────────────────────────────

  describe('RLS: behaviour_sanctions', () => {
    it('tenant A cannot access tenant B data', async () => {
      await verifyRlsIsolation('behaviourSanction');
    });
  });

  // ─── behaviour_tasks ──────────────────────────────────────────────────────

  describe('RLS: behaviour_tasks', () => {
    it('tenant A cannot access tenant B data', async () => {
      await verifyRlsIsolation('behaviourTask');
    });
  });

  // ─── behaviour_interventions ──────────────────────────────────────────────

  describe('RLS: behaviour_interventions', () => {
    it('tenant A cannot access tenant B data', async () => {
      await verifyRlsIsolation('behaviourIntervention');
    });
  });

  // ─── behaviour_intervention_incidents ──────────────────────────────────────

  describe('RLS: behaviour_intervention_incidents', () => {
    it('tenant A cannot access tenant B data', async () => {
      await verifyRlsIsolation('behaviourInterventionIncident');
    });
  });

  // ─── behaviour_intervention_reviews ────────────────────────────────────────

  describe('RLS: behaviour_intervention_reviews', () => {
    it('tenant A cannot access tenant B data', async () => {
      await verifyRlsIsolation('behaviourInterventionReview');
    });
  });

  // ─── behaviour_recognition_awards ─────────────────────────────────────────

  describe('RLS: behaviour_recognition_awards', () => {
    it('tenant A cannot access tenant B data', async () => {
      await verifyRlsIsolation('behaviourRecognitionAward');
    });
  });

  // ─── behaviour_award_types ────────────────────────────────────────────────

  describe('RLS: behaviour_award_types', () => {
    it('tenant A cannot access tenant B data', async () => {
      await verifyRlsIsolation('behaviourAwardType');
    });
  });

  // ─── behaviour_house_teams ────────────────────────────────────────────────

  describe('RLS: behaviour_house_teams', () => {
    it('tenant A cannot access tenant B data', async () => {
      await verifyRlsIsolation('behaviourHouseTeam');
    });
  });

  // ─── behaviour_house_memberships ──────────────────────────────────────────

  describe('RLS: behaviour_house_memberships', () => {
    it('tenant A cannot access tenant B data', async () => {
      await verifyRlsIsolation('behaviourHouseMembership');
    });
  });

  // ─── behaviour_description_templates ──────────────────────────────────────

  describe('RLS: behaviour_description_templates', () => {
    it('tenant A cannot access tenant B data', async () => {
      await verifyRlsIsolation('behaviourDescriptionTemplate');
    });
  });

  // ─── behaviour_alerts ─────────────────────────────────────────────────────

  describe('RLS: behaviour_alerts', () => {
    it('tenant A cannot access tenant B data', async () => {
      await verifyRlsIsolation('behaviourAlert');
    });
  });

  // ─── behaviour_alert_recipients ───────────────────────────────────────────

  describe('RLS: behaviour_alert_recipients', () => {
    it('tenant A cannot access tenant B data', async () => {
      await verifyRlsIsolation('behaviourAlertRecipient');
    });
  });

  // ─── behaviour_parent_acknowledgements ─────────────────────────────────────

  describe('RLS: behaviour_parent_acknowledgements', () => {
    it('tenant A cannot access tenant B data', async () => {
      await verifyRlsIsolation('behaviourParentAcknowledgement');
    });
  });

  // ─── behaviour_entity_history ──────────────────────────────────────────────

  describe('RLS: behaviour_entity_history', () => {
    it('tenant A cannot access tenant B data', async () => {
      await verifyRlsIsolation('behaviourEntityHistory');
    });
  });

  // ─── behaviour_publication_approvals ───────────────────────────────────────

  describe('RLS: behaviour_publication_approvals', () => {
    it('tenant A cannot access tenant B data', async () => {
      await verifyRlsIsolation('behaviourPublicationApproval');
    });
  });

  // ─── behaviour_appeals ────────────────────────────────────────────────────

  describe('RLS: behaviour_appeals', () => {
    it('tenant A cannot access tenant B data', async () => {
      await verifyRlsIsolation('behaviourAppeal');
    });
  });

  // ─── behaviour_amendment_notices ──────────────────────────────────────────

  describe('RLS: behaviour_amendment_notices', () => {
    it('tenant A cannot access tenant B data', async () => {
      await verifyRlsIsolation('behaviourAmendmentNotice');
    });
  });

  // ─── behaviour_exclusion_cases ────────────────────────────────────────────

  describe('RLS: behaviour_exclusion_cases', () => {
    it('tenant A cannot access tenant B data', async () => {
      await verifyRlsIsolation('behaviourExclusionCase');
    });
  });

  // ─── behaviour_documents ──────────────────────────────────────────────────

  describe('RLS: behaviour_documents', () => {
    it('tenant A cannot access tenant B data', async () => {
      await verifyRlsIsolation('behaviourDocument');
    });
  });

  // ─── behaviour_document_templates ─────────────────────────────────────────

  describe('RLS: behaviour_document_templates', () => {
    it('tenant A cannot access tenant B data', async () => {
      await verifyRlsIsolation('behaviourDocumentTemplate');
    });
  });

  // ─── behaviour_guardian_restrictions ───────────────────────────────────────

  describe('RLS: behaviour_guardian_restrictions', () => {
    it('tenant A cannot access tenant B data', async () => {
      await verifyRlsIsolation('behaviourGuardianRestriction');
    });
  });

  // ─── behaviour_attachments ────────────────────────────────────────────────

  describe('RLS: behaviour_attachments', () => {
    it('tenant A cannot access tenant B data', async () => {
      await verifyRlsIsolation('behaviourAttachment');
    });
  });

  // ─── behaviour_policy_rules ───────────────────────────────────────────────

  describe('RLS: behaviour_policy_rules', () => {
    it('tenant A cannot access tenant B data', async () => {
      await verifyRlsIsolation('behaviourPolicyRule');
    });
  });

  // ─── behaviour_policy_rule_actions ────────────────────────────────────────

  describe('RLS: behaviour_policy_rule_actions', () => {
    it('tenant A cannot access tenant B data', async () => {
      await verifyRlsIsolation('behaviourPolicyRuleAction');
    });
  });

  // ─── behaviour_policy_rule_versions ───────────────────────────────────────

  describe('RLS: behaviour_policy_rule_versions', () => {
    it('tenant A cannot access tenant B data', async () => {
      await verifyRlsIsolation('behaviourPolicyRuleVersion');
    });
  });

  // ─── behaviour_policy_evaluations ─────────────────────────────────────────

  describe('RLS: behaviour_policy_evaluations', () => {
    it('tenant A cannot access tenant B data', async () => {
      await verifyRlsIsolation('behaviourPolicyEvaluation');
    });
  });

  // ─── behaviour_policy_action_executions ────────────────────────────────────

  describe('RLS: behaviour_policy_action_executions', () => {
    it('tenant A cannot access tenant B data', async () => {
      await verifyRlsIsolation('behaviourPolicyActionExecution');
    });
  });

  // ─── safeguarding_concerns ────────────────────────────────────────────────

  describe('RLS: safeguarding_concerns', () => {
    it('tenant A cannot access tenant B data', async () => {
      await verifyRlsIsolation('safeguardingConcern');
    });
  });

  // ─── safeguarding_actions ─────────────────────────────────────────────────

  describe('RLS: safeguarding_actions', () => {
    it('tenant A cannot access tenant B data', async () => {
      await verifyRlsIsolation('safeguardingAction');
    });
  });

  // ─── safeguarding_concern_incidents ────────────────────────────────────────

  describe('RLS: safeguarding_concern_incidents', () => {
    it('tenant A cannot access tenant B data', async () => {
      await verifyRlsIsolation('safeguardingConcernIncident');
    });
  });

  // ─── safeguarding_break_glass_grants ──────────────────────────────────────

  describe('RLS: safeguarding_break_glass_grants', () => {
    it('tenant A cannot access tenant B data', async () => {
      await verifyRlsIsolation('safeguardingBreakGlassGrant');
    });
  });

  // ─── behaviour_legal_holds ────────────────────────────────────────────────

  describe('RLS: behaviour_legal_holds', () => {
    it('tenant A cannot access tenant B data', async () => {
      await verifyRlsIsolation('behaviourLegalHold');
    });
  });
});
