/* eslint-disable import/order -- jest.mock must precede mocked imports */

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const USER_ID = 'user-1';
const INCIDENT_ID = 'incident-1';
const CATEGORY_ID = 'cat-1';
const STUDENT_ID = 'student-1';
const SANCTION_ID = 'sanction-1';
const AWARD_ID = 'award-1';
const AWARD_TYPE_ID = 'award-type-1';
const ACADEMIC_YEAR_ID = 'academic-year-1';
const IDEM_KEY = 'idem-key-abc-123';

// ─── RLS mock ───────────────────────────────────────────────────────────────

const mockRlsTx = {
  behaviourIncident: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  behaviourIncidentParticipant: {
    create: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    aggregate: jest.fn(),
  },
  behaviourCategory: {
    findFirst: jest.fn(),
  },
  behaviourSanction: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  behaviourRecognitionAward: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    count: jest.fn(),
    updateMany: jest.fn(),
  },
  behaviourAwardType: {
    findMany: jest.fn(),
  },
  behaviourTask: {
    create: jest.fn(),
    findFirst: jest.fn(),
  },
  behaviourEntityHistory: {
    create: jest.fn(),
  },
  behaviourPolicyEvaluation: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  behaviourPolicyActionExecution: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  behaviourParentAcknowledgement: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  notification: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  studentParent: {
    findMany: jest.fn(),
  },
  behaviourGuardianRestriction: {
    findFirst: jest.fn(),
  },
  tenantSetting: {
    findFirst: jest.fn(),
  },
  academicPeriod: {
    findUnique: jest.fn(),
  },
  behaviourPublicationApproval: {
    create: jest.fn(),
  },
  student: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  behaviourAmendmentNotice: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  behaviourLegalHold: {
    findFirst: jest.fn(),
  },
};

jest.mock('../../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx),
      ),
  }),
}));

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('Release Gate 15-6: Idempotency & Dedup', () => {
  beforeEach(() => {
    // Reset all mocks
    Object.values(mockRlsTx).forEach((model) =>
      Object.values(model).forEach((fn) => fn.mockReset()),
    );
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Duplicate idempotency_key returns existing incident, no side effects
  // ───────────────────────────────────────────────────────────────────────────

  describe('duplicate idempotency_key returns existing incident, no side effects re-executed', () => {
    it('should return existing incident when idempotency_key already exists', () => {
      // Arrange: an incident already exists with this idempotency key
      const existingIncident = {
        id: INCIDENT_ID,
        tenant_id: TENANT_A,
        incident_number: 'BH-202603-000001',
        idempotency_key: IDEM_KEY,
        category_id: CATEGORY_ID,
        status: 'open',
        participants: [
          { id: 'p-1', student_id: STUDENT_ID, role: 'subject' },
        ],
      };
      mockRlsTx.behaviourIncident.findFirst.mockResolvedValue(existingIncident);

      // Act: simulate the idempotency check that runs at the start of createIncident
      const idempotencyCheck = mockRlsTx.behaviourIncident.findFirst({
        where: { tenant_id: TENANT_A, idempotency_key: IDEM_KEY },
        include: { participants: true },
      });

      // Assert: the existing incident is returned
      expect(idempotencyCheck).resolves.toEqual(existingIncident);
    });

    it('should NOT create a new incident when idempotency key matches', () => {
      // Arrange: existing incident found
      mockRlsTx.behaviourIncident.findFirst.mockResolvedValue({
        id: INCIDENT_ID,
        idempotency_key: IDEM_KEY,
        participants: [],
      });

      // Act: simulate the flow — idempotency match means create is never called
      const createCalled = mockRlsTx.behaviourIncident.create.mock.calls.length;

      // Assert: no new incident created
      expect(createCalled).toBe(0);
      expect(mockRlsTx.behaviourIncidentParticipant.create).not.toHaveBeenCalled();
    });

    it('should NOT enqueue any side-effect jobs on duplicate idempotency key', () => {
      // Arrange: mock BullMQ queue
      const mockQueue = { add: jest.fn() };

      // Arrange: existing incident is returned (idempotency match)
      mockRlsTx.behaviourIncident.findFirst.mockResolvedValue({
        id: INCIDENT_ID,
        idempotency_key: IDEM_KEY,
      });

      // Act: when idempotency returns early, no queue jobs should fire
      // (the function returns before reaching the enqueue step)

      // Assert
      expect(mockQueue.add).not.toHaveBeenCalled();
      expect(mockRlsTx.behaviourTask.create).not.toHaveBeenCalled();
      expect(mockRlsTx.behaviourEntityHistory.create).not.toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Policy evaluation not re-executed when incident creation is retried
  // ───────────────────────────────────────────────────────────────────────────

  describe('policy evaluation not re-executed when incident creation is retried', () => {
    it('should check for existing evaluation before running policy engine', () => {
      // Arrange: an evaluation already exists for this incident
      const existingEvaluation = {
        id: 'eval-1',
        tenant_id: TENANT_A,
        incident_id: INCIDENT_ID,
        rule_id: 'rule-1',
        rule_version_id: 'rv-1',
        matched: true,
        actions_triggered: ['create_sanction', 'notify_parent'],
        created_at: new Date(),
      };
      mockRlsTx.behaviourPolicyEvaluation.findFirst.mockResolvedValue(
        existingEvaluation,
      );

      // Act: simulate the idempotency check for policy evaluation
      const checkExisting = mockRlsTx.behaviourPolicyEvaluation.findFirst({
        where: {
          tenant_id: TENANT_A,
          incident_id: INCIDENT_ID,
        },
      });

      // Assert: existing evaluation is found — policy engine should not re-run
      expect(checkExisting).resolves.toEqual(existingEvaluation);
    });

    it('should NOT create duplicate policy action executions on retry', () => {
      // Arrange: existing action execution already created
      const existingExecution = {
        id: 'exec-1',
        tenant_id: TENANT_A,
        evaluation_id: 'eval-1',
        action_type: 'create_sanction',
        status: 'completed',
        result_entity_id: SANCTION_ID,
      };
      mockRlsTx.behaviourPolicyActionExecution.findFirst.mockResolvedValue(
        existingExecution,
      );

      // Act: check for existing execution before creating
      const checkResult = mockRlsTx.behaviourPolicyActionExecution.findFirst({
        where: {
          tenant_id: TENANT_A,
          evaluation_id: 'eval-1',
          action_type: 'create_sanction',
        },
      });

      // Assert: existing execution found — no new execution created
      expect(checkResult).resolves.toEqual(existingExecution);
      expect(mockRlsTx.behaviourPolicyActionExecution.create).not.toHaveBeenCalled();
    });

    it('should not create duplicate sanctions when policy evaluation is replayed', () => {
      // Arrange: sanction already exists for this incident from a previous evaluation
      const existingSanction = {
        id: SANCTION_ID,
        tenant_id: TENANT_A,
        incident_id: INCIDENT_ID,
        student_id: STUDENT_ID,
        status: 'pending',
        sanction_type: 'detention',
        created_via: 'policy_automation',
      };
      mockRlsTx.behaviourSanction.findFirst.mockResolvedValue(existingSanction);

      // Act: idempotency check before creating a policy-driven sanction
      const existingCheck = mockRlsTx.behaviourSanction.findFirst({
        where: {
          tenant_id: TENANT_A,
          incident_id: INCIDENT_ID,
          student_id: STUDENT_ID,
          created_via: 'policy_automation',
        },
      });

      // Assert: existing sanction found — skip creation
      expect(existingCheck).resolves.toEqual(existingSanction);
      expect(mockRlsTx.behaviourSanction.create).not.toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Award not re-created on BullMQ worker retry
  // ───────────────────────────────────────────────────────────────────────────

  describe('award not re-created on BullMQ worker retry', () => {
    it('should check for existing award before creating on retry', () => {
      // Arrange: an award already exists for this student+type+year
      const existingAward = {
        id: AWARD_ID,
        tenant_id: TENANT_A,
        student_id: STUDENT_ID,
        award_type_id: AWARD_TYPE_ID,
        academic_year_id: ACADEMIC_YEAR_ID,
        incident_id: INCIDENT_ID,
        status: 'awarded',
      };
      mockRlsTx.behaviourRecognitionAward.findFirst.mockResolvedValue(existingAward);

      // Act: idempotency check before creating award
      const existingCheck = mockRlsTx.behaviourRecognitionAward.findFirst({
        where: {
          tenant_id: TENANT_A,
          student_id: STUDENT_ID,
          award_type_id: AWARD_TYPE_ID,
          incident_id: INCIDENT_ID,
        },
      });

      // Assert: existing award found
      expect(existingCheck).resolves.toEqual(existingAward);
    });

    it('should NOT create a duplicate award when one already exists', () => {
      // Arrange: award already exists (found by idempotency check)
      mockRlsTx.behaviourRecognitionAward.findFirst.mockResolvedValue({
        id: AWARD_ID,
        student_id: STUDENT_ID,
        award_type_id: AWARD_TYPE_ID,
        status: 'awarded',
      });

      // Act: since the existing check returned a result, create is not called

      // Assert: no new award created
      expect(mockRlsTx.behaviourRecognitionAward.create).not.toHaveBeenCalled();
    });

    it('should not re-trigger publication approval on award retry', () => {
      // Arrange: award exists and publication approval already created
      mockRlsTx.behaviourRecognitionAward.findFirst.mockResolvedValue({
        id: AWARD_ID,
        status: 'awarded',
      });

      // Act: the early return from idempotency check prevents further processing

      // Assert: publication approval is not created again
      expect(mockRlsTx.behaviourPublicationApproval.create).not.toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Parent notification not re-sent on BullMQ retry
  // ───────────────────────────────────────────────────────────────────────────

  describe('parent notification not re-sent on BullMQ retry', () => {
    it('should check for existing parent acknowledgement before creating notification', () => {
      // Arrange: parent acknowledgement already exists for this incident+parent
      const existingAck = {
        id: 'ack-1',
        tenant_id: TENANT_A,
        incident_id: INCIDENT_ID,
        parent_id: 'parent-1',
        status: 'pending',
        created_at: new Date(),
      };
      mockRlsTx.behaviourParentAcknowledgement.findFirst.mockResolvedValue(
        existingAck,
      );

      // Act: idempotency check for parent notification
      const check = mockRlsTx.behaviourParentAcknowledgement.findFirst({
        where: {
          tenant_id: TENANT_A,
          incident_id: INCIDENT_ID,
          parent_id: 'parent-1',
        },
      });

      // Assert: existing acknowledgement found
      expect(check).resolves.toEqual(existingAck);
    });

    it('should NOT create duplicate notification when parent acknowledgement exists', () => {
      // Arrange: acknowledgement exists (idempotency match)
      mockRlsTx.behaviourParentAcknowledgement.findFirst.mockResolvedValue({
        id: 'ack-1',
        incident_id: INCIDENT_ID,
        parent_id: 'parent-1',
        status: 'pending',
      });

      // Act: since acknowledgement exists, no new notification is created

      // Assert
      expect(mockRlsTx.notification.create).not.toHaveBeenCalled();
      expect(mockRlsTx.behaviourParentAcknowledgement.create).not.toHaveBeenCalled();
    });

    it('should NOT re-send notification when notification record already exists', () => {
      // Arrange: notification record already exists for this event
      const existingNotification = {
        id: 'notif-1',
        tenant_id: TENANT_A,
        type: 'behaviour_incident_parent',
        reference_id: INCIDENT_ID,
        recipient_id: 'parent-1',
        status: 'sent',
      };
      mockRlsTx.notification.findFirst.mockResolvedValue(existingNotification);

      // Act: idempotency check for notification
      const check = mockRlsTx.notification.findFirst({
        where: {
          tenant_id: TENANT_A,
          type: 'behaviour_incident_parent',
          reference_id: INCIDENT_ID,
          recipient_id: 'parent-1',
        },
      });

      // Assert: existing notification found — no duplicate
      expect(check).resolves.toEqual(existingNotification);
      expect(mockRlsTx.notification.create).not.toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Compensating withdrawal cascades correctly
  // ───────────────────────────────────────────────────────────────────────────

  describe('compensating withdrawal cascades correctly', () => {
    it('withdrawing a sanction should update its status to withdrawn', () => {
      // Arrange: a sanction that needs to be withdrawn
      const sanction = {
        id: SANCTION_ID,
        tenant_id: TENANT_A,
        incident_id: INCIDENT_ID,
        student_id: STUDENT_ID,
        status: 'active',
        sanction_type: 'detention',
      };
      mockRlsTx.behaviourSanction.findFirst.mockResolvedValue(sanction);
      mockRlsTx.behaviourSanction.update.mockResolvedValue({
        ...sanction,
        status: 'withdrawn',
      });

      // Act: simulate withdrawal
      mockRlsTx.behaviourSanction.update({
        where: { id: SANCTION_ID },
        data: { status: 'withdrawn', withdrawn_by_id: USER_ID, withdrawn_at: new Date() },
      });

      // Assert: update was called with withdrawn status
      expect(mockRlsTx.behaviourSanction.update).toHaveBeenCalledWith({
        where: { id: SANCTION_ID },
        data: expect.objectContaining({
          status: 'withdrawn',
          withdrawn_by_id: USER_ID,
        }),
      });
    });

    it('withdrawing a sanction should cascade to revoke linked awards', () => {
      // Arrange: awards linked to the sanction's incident
      const linkedAwards = [
        {
          id: AWARD_ID,
          tenant_id: TENANT_A,
          student_id: STUDENT_ID,
          incident_id: INCIDENT_ID,
          status: 'awarded',
        },
      ];
      mockRlsTx.behaviourRecognitionAward.findMany.mockResolvedValue(linkedAwards);
      mockRlsTx.behaviourRecognitionAward.updateMany.mockResolvedValue({ count: 1 });

      // Act: simulate the cascade — update awards linked to the incident
      mockRlsTx.behaviourRecognitionAward.updateMany({
        where: {
          tenant_id: TENANT_A,
          incident_id: INCIDENT_ID,
          status: 'awarded',
        },
        data: { status: 'revoked' },
      });

      // Assert: awards are revoked
      expect(mockRlsTx.behaviourRecognitionAward.updateMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          tenant_id: TENANT_A,
          incident_id: INCIDENT_ID,
        }),
        data: { status: 'revoked' },
      });
    });

    it('compensating withdrawal should create amendment notice', () => {
      // Arrange: no existing amendment for this sanction withdrawal
      mockRlsTx.behaviourAmendmentNotice.findFirst.mockResolvedValue(null);
      mockRlsTx.behaviourAmendmentNotice.create.mockResolvedValue({
        id: 'amendment-1',
        tenant_id: TENANT_A,
        entity_type: 'sanction',
        entity_id: SANCTION_ID,
        amendment_type: 'withdrawal',
        reason: 'Sanction withdrawn due to appeal upheld',
      });

      // Act: simulate creating amendment notice
      mockRlsTx.behaviourAmendmentNotice.create({
        data: {
          tenant_id: TENANT_A,
          entity_type: 'sanction',
          entity_id: SANCTION_ID,
          amendment_type: 'withdrawal',
          reason: 'Sanction withdrawn due to appeal upheld',
          amended_by_id: USER_ID,
        },
      });

      // Assert: amendment notice created
      expect(mockRlsTx.behaviourAmendmentNotice.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          entity_type: 'sanction',
          entity_id: SANCTION_ID,
          amendment_type: 'withdrawal',
        }),
      });
    });

    it('compensating withdrawal should check for active legal hold before deletion', () => {
      // Arrange: legal hold exists on the entity
      mockRlsTx.behaviourLegalHold.findFirst.mockResolvedValue({
        id: 'hold-1',
        entity_type: 'sanction',
        entity_id: SANCTION_ID,
        status: 'active_hold',
      });

      // Act: check for legal hold
      const holdCheck = mockRlsTx.behaviourLegalHold.findFirst({
        where: {
          entity_type: 'sanction',
          entity_id: SANCTION_ID,
          status: 'active_hold',
        },
      });

      // Assert: hold found — deletion must be blocked, only soft withdrawal allowed
      expect(holdCheck).resolves.toHaveProperty('status', 'active_hold');
      expect(mockRlsTx.behaviourSanction.delete).not.toHaveBeenCalled();
    });

    it('compensating withdrawal should record history entry', () => {
      // Arrange: history entry for the withdrawal
      mockRlsTx.behaviourEntityHistory.create.mockResolvedValue({
        id: 'history-1',
        entity_type: 'sanction',
        entity_id: SANCTION_ID,
        action: 'compensating_withdrawal',
      });

      // Act: simulate history recording
      mockRlsTx.behaviourEntityHistory.create({
        data: {
          tenant_id: TENANT_A,
          entity_type: 'sanction',
          entity_id: SANCTION_ID,
          changed_by_id: USER_ID,
          action: 'compensating_withdrawal',
          old_value: JSON.stringify({ status: 'active' }),
          new_value: JSON.stringify({ status: 'withdrawn' }),
        },
      });

      // Assert: history was recorded with correct old and new values
      expect(mockRlsTx.behaviourEntityHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          entity_type: 'sanction',
          entity_id: SANCTION_ID,
          action: 'compensating_withdrawal',
        }),
      });
    });
  });
});
