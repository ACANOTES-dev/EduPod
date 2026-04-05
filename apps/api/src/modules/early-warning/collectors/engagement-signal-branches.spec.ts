import { Test } from '@nestjs/testing';

import { AcademicReadFacade } from '../../academics/academic-read.facade';
import { AuthReadFacade } from '../../auth/auth-read.facade';
import { BehaviourReadFacade } from '../../behaviour/behaviour-read.facade';
import { CommunicationsReadFacade } from '../../communications/communications-read.facade';
import { ParentInquiriesReadFacade } from '../../parent-inquiries/parent-inquiries-read.facade';
import { ParentReadFacade } from '../../parents/parent-read.facade';

import { EngagementSignalCollector } from './engagement-signal.collector';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STUDENT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const YEAR_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const USER_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const PARENT_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

const MS_PER_DAY = 86_400_000;

describe('EngagementSignalCollector — branches', () => {
  let collector: EngagementSignalCollector;
  let mockParentFacade: { findParentUserIdsForStudent: jest.Mock };
  let mockCommsFacade: { findInAppNotificationsForUsers: jest.Mock };
  let mockAuthFacade: { findUsersWithLoginInfo: jest.Mock };
  let mockAcademicFacade: { findYearById: jest.Mock };
  let mockInquiriesFacade: { findByParentIds: jest.Mock };
  let mockBehaviourFacade: { findParentAcknowledgements: jest.Mock };

  beforeEach(async () => {
    mockParentFacade = {
      findParentUserIdsForStudent: jest.fn().mockResolvedValue([]),
    };
    mockCommsFacade = {
      findInAppNotificationsForUsers: jest.fn().mockResolvedValue([]),
    };
    mockAuthFacade = {
      findUsersWithLoginInfo: jest.fn().mockResolvedValue([]),
    };
    mockAcademicFacade = {
      findYearById: jest.fn().mockResolvedValue({
        id: YEAR_ID,
        start_date: new Date('2025-09-01'),
        end_date: new Date('2026-06-30'),
      }),
    };
    mockInquiriesFacade = {
      findByParentIds: jest.fn().mockResolvedValue([]),
    };
    mockBehaviourFacade = {
      findParentAcknowledgements: jest.fn().mockResolvedValue([]),
    };

    const module = await Test.createTestingModule({
      providers: [
        EngagementSignalCollector,
        { provide: ParentReadFacade, useValue: mockParentFacade },
        { provide: CommunicationsReadFacade, useValue: mockCommsFacade },
        { provide: AuthReadFacade, useValue: mockAuthFacade },
        { provide: AcademicReadFacade, useValue: mockAcademicFacade },
        { provide: ParentInquiriesReadFacade, useValue: mockInquiriesFacade },
        { provide: BehaviourReadFacade, useValue: mockBehaviourFacade },
      ],
    }).compile();

    collector = module.get(EngagementSignalCollector);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── No parents → early return ──────────────────────────────────────────
  describe('EngagementSignalCollector — collectSignals — no parents', () => {
    it('should return zero score when no parent users found', async () => {
      mockParentFacade.findParentUserIdsForStudent.mockResolvedValue([]);
      const result = await collector.collectSignals(TENANT_ID, STUDENT_ID, YEAR_ID);
      expect(result.domain).toBe('engagement');
      expect(result.rawScore).toBe(0);
      expect(result.signals).toHaveLength(0);
    });

    it('should skip parents without user_id', async () => {
      mockParentFacade.findParentUserIdsForStudent.mockResolvedValue([
        { id: PARENT_ID, user_id: null },
      ]);
      const result = await collector.collectSignals(TENANT_ID, STUDENT_ID, YEAR_ID);
      expect(result.rawScore).toBe(0);
    });
  });

  // ─── Signal 1: low_notification_read_rate ───────────────────────────────
  describe('EngagementSignalCollector — low_notification_read_rate', () => {
    it('should detect low notification read rate (0%)', async () => {
      mockParentFacade.findParentUserIdsForStudent.mockResolvedValue([
        { id: PARENT_ID, user_id: USER_ID },
      ]);
      mockCommsFacade.findInAppNotificationsForUsers.mockResolvedValue([
        { id: 'n1', recipient_user_id: USER_ID, read_at: null, created_at: new Date() },
        { id: 'n2', recipient_user_id: USER_ID, read_at: null, created_at: new Date() },
      ]);
      mockAuthFacade.findUsersWithLoginInfo.mockResolvedValue([
        { id: USER_ID, last_login_at: new Date() },
      ]);

      const result = await collector.collectSignals(TENANT_ID, STUDENT_ID, YEAR_ID);
      const signal = result.signals.find((s) => s.signalType === 'low_notification_read_rate');
      expect(signal).toBeDefined();
      expect(signal!.scoreContribution).toBe(20);
    });

    it('should not flag when read rate is >= 30%', async () => {
      mockParentFacade.findParentUserIdsForStudent.mockResolvedValue([
        { id: PARENT_ID, user_id: USER_ID },
      ]);
      // 1 read out of 3 = 33%
      mockCommsFacade.findInAppNotificationsForUsers.mockResolvedValue([
        { id: 'n1', recipient_user_id: USER_ID, read_at: new Date(), created_at: new Date() },
        { id: 'n2', recipient_user_id: USER_ID, read_at: null, created_at: new Date() },
        { id: 'n3', recipient_user_id: USER_ID, read_at: null, created_at: new Date() },
      ]);
      mockAuthFacade.findUsersWithLoginInfo.mockResolvedValue([
        { id: USER_ID, last_login_at: new Date() },
      ]);

      const result = await collector.collectSignals(TENANT_ID, STUDENT_ID, YEAR_ID);
      const signal = result.signals.find((s) => s.signalType === 'low_notification_read_rate');
      expect(signal).toBeUndefined();
    });

    it('should score 10 when read rate is 15-29%', async () => {
      mockParentFacade.findParentUserIdsForStudent.mockResolvedValue([
        { id: PARENT_ID, user_id: USER_ID },
      ]);
      // 1 read out of 5 = 20%
      const notifs = Array.from({ length: 5 }, (_, i) => ({
        id: `n${i}`,
        recipient_user_id: USER_ID,
        read_at: i === 0 ? new Date() : null,
        created_at: new Date(),
      }));
      mockCommsFacade.findInAppNotificationsForUsers.mockResolvedValue(notifs);
      mockAuthFacade.findUsersWithLoginInfo.mockResolvedValue([
        { id: USER_ID, last_login_at: new Date() },
      ]);

      const result = await collector.collectSignals(TENANT_ID, STUDENT_ID, YEAR_ID);
      const signal = result.signals.find((s) => s.signalType === 'low_notification_read_rate');
      expect(signal).toBeDefined();
      expect(signal!.scoreContribution).toBe(10);
    });
  });

  // ─── Signal 2: no_portal_login ──────────────────────────────────────────
  describe('EngagementSignalCollector — no_portal_login', () => {
    it('should detect no login for 30+ days', async () => {
      mockParentFacade.findParentUserIdsForStudent.mockResolvedValue([
        { id: PARENT_ID, user_id: USER_ID },
      ]);
      mockAuthFacade.findUsersWithLoginInfo.mockResolvedValue([
        { id: USER_ID, last_login_at: new Date(Date.now() - 35 * MS_PER_DAY) },
      ]);

      const result = await collector.collectSignals(TENANT_ID, STUDENT_ID, YEAR_ID);
      const signal = result.signals.find((s) => s.signalType === 'no_portal_login');
      expect(signal).toBeDefined();
    });

    it('should detect no login ever (null last_login_at)', async () => {
      mockParentFacade.findParentUserIdsForStudent.mockResolvedValue([
        { id: PARENT_ID, user_id: USER_ID },
      ]);
      mockAuthFacade.findUsersWithLoginInfo.mockResolvedValue([
        { id: USER_ID, last_login_at: null },
      ]);

      const result = await collector.collectSignals(TENANT_ID, STUDENT_ID, YEAR_ID);
      const signal = result.signals.find((s) => s.signalType === 'no_portal_login');
      expect(signal).toBeDefined();
      expect(signal!.scoreContribution).toBe(25);
      expect(signal!.summaryFragment).toContain('ever');
    });

    it('should not flag recent login (< 21 days)', async () => {
      mockParentFacade.findParentUserIdsForStudent.mockResolvedValue([
        { id: PARENT_ID, user_id: USER_ID },
      ]);
      mockAuthFacade.findUsersWithLoginInfo.mockResolvedValue([
        { id: USER_ID, last_login_at: new Date(Date.now() - 10 * MS_PER_DAY) },
      ]);

      const result = await collector.collectSignals(TENANT_ID, STUDENT_ID, YEAR_ID);
      const signal = result.signals.find((s) => s.signalType === 'no_portal_login');
      expect(signal).toBeUndefined();
    });
  });

  // ─── Signal 3: no_parent_inquiry ────────────────────────────────────────
  describe('EngagementSignalCollector — no_parent_inquiry', () => {
    it('should detect no inquiries in academic year', async () => {
      mockParentFacade.findParentUserIdsForStudent.mockResolvedValue([
        { id: PARENT_ID, user_id: USER_ID },
      ]);
      mockAuthFacade.findUsersWithLoginInfo.mockResolvedValue([
        { id: USER_ID, last_login_at: new Date() },
      ]);
      mockInquiriesFacade.findByParentIds.mockResolvedValue([]);

      const result = await collector.collectSignals(TENANT_ID, STUDENT_ID, YEAR_ID);
      const signal = result.signals.find((s) => s.signalType === 'no_parent_inquiry');
      expect(signal).toBeDefined();
    });

    it('should not flag when inquiries exist', async () => {
      mockParentFacade.findParentUserIdsForStudent.mockResolvedValue([
        { id: PARENT_ID, user_id: USER_ID },
      ]);
      mockAuthFacade.findUsersWithLoginInfo.mockResolvedValue([
        { id: USER_ID, last_login_at: new Date() },
      ]);
      mockInquiriesFacade.findByParentIds.mockResolvedValue([{ id: 'inq-1' }]);

      const result = await collector.collectSignals(TENANT_ID, STUDENT_ID, YEAR_ID);
      const signal = result.signals.find((s) => s.signalType === 'no_parent_inquiry');
      expect(signal).toBeUndefined();
    });

    it('should skip when no academic year found', async () => {
      mockParentFacade.findParentUserIdsForStudent.mockResolvedValue([
        { id: PARENT_ID, user_id: USER_ID },
      ]);
      mockAuthFacade.findUsersWithLoginInfo.mockResolvedValue([
        { id: USER_ID, last_login_at: new Date() },
      ]);
      // academic year for inquiry fetch returns null
      mockAcademicFacade.findYearById
        .mockResolvedValueOnce(null) // fetchParentInquiryCount
        .mockResolvedValueOnce(null); // fetchAcademicYear

      const result = await collector.collectSignals(TENANT_ID, STUDENT_ID, YEAR_ID);
      const signal = result.signals.find((s) => s.signalType === 'no_parent_inquiry');
      expect(signal).toBeUndefined();
    });
  });

  // ─── Signal 4: slow_acknowledgement ─────────────────────────────────────
  describe('EngagementSignalCollector — slow_acknowledgement', () => {
    it('should detect slow acknowledgements (> 72 hours)', async () => {
      mockParentFacade.findParentUserIdsForStudent.mockResolvedValue([
        { id: PARENT_ID, user_id: USER_ID },
      ]);
      mockAuthFacade.findUsersWithLoginInfo.mockResolvedValue([
        { id: USER_ID, last_login_at: new Date() },
      ]);
      const sentDate = new Date(Date.now() - 10 * MS_PER_DAY);
      const ackDate = new Date(sentDate.getTime() + 100 * 3600000); // 100 hours later
      mockBehaviourFacade.findParentAcknowledgements.mockResolvedValue([
        { id: 'ack-1', parent_id: PARENT_ID, sent_at: sentDate, acknowledged_at: ackDate },
      ]);

      const result = await collector.collectSignals(TENANT_ID, STUDENT_ID, YEAR_ID);
      const signal = result.signals.find((s) => s.signalType === 'slow_acknowledgement');
      expect(signal).toBeDefined();
    });

    it('should detect unacknowledged (never responded)', async () => {
      mockParentFacade.findParentUserIdsForStudent.mockResolvedValue([
        { id: PARENT_ID, user_id: USER_ID },
      ]);
      mockAuthFacade.findUsersWithLoginInfo.mockResolvedValue([
        { id: USER_ID, last_login_at: new Date() },
      ]);
      mockBehaviourFacade.findParentAcknowledgements.mockResolvedValue([
        { id: 'ack-1', parent_id: PARENT_ID, sent_at: new Date(), acknowledged_at: null },
      ]);

      const result = await collector.collectSignals(TENANT_ID, STUDENT_ID, YEAR_ID);
      const signal = result.signals.find((s) => s.signalType === 'slow_acknowledgement');
      expect(signal).toBeDefined();
      expect(signal!.scoreContribution).toBe(20);
      expect(signal!.summaryFragment).toContain('never');
    });

    it('should not flag fast acknowledgements (< 72 hours)', async () => {
      mockParentFacade.findParentUserIdsForStudent.mockResolvedValue([
        { id: PARENT_ID, user_id: USER_ID },
      ]);
      mockAuthFacade.findUsersWithLoginInfo.mockResolvedValue([
        { id: USER_ID, last_login_at: new Date() },
      ]);
      const sentDate = new Date();
      const ackDate = new Date(sentDate.getTime() + 24 * 3600000); // 24 hours
      mockBehaviourFacade.findParentAcknowledgements.mockResolvedValue([
        { id: 'ack-1', parent_id: PARENT_ID, sent_at: sentDate, acknowledged_at: ackDate },
      ]);

      const result = await collector.collectSignals(TENANT_ID, STUDENT_ID, YEAR_ID);
      const signal = result.signals.find((s) => s.signalType === 'slow_acknowledgement');
      expect(signal).toBeUndefined();
    });
  });

  // ─── rawScore capping ───────────────────────────────────────────────────
  describe('EngagementSignalCollector — rawScore', () => {
    it('should cap rawScore at 100', async () => {
      mockParentFacade.findParentUserIdsForStudent.mockResolvedValue([
        { id: PARENT_ID, user_id: USER_ID },
      ]);
      // All signals fire with high contributions
      mockCommsFacade.findInAppNotificationsForUsers.mockResolvedValue([
        { id: 'n1', recipient_user_id: USER_ID, read_at: null, created_at: new Date() },
      ]);
      mockAuthFacade.findUsersWithLoginInfo.mockResolvedValue([
        { id: USER_ID, last_login_at: null },
      ]);
      mockBehaviourFacade.findParentAcknowledgements.mockResolvedValue([
        { id: 'ack-1', parent_id: PARENT_ID, sent_at: new Date(), acknowledged_at: null },
      ]);

      const result = await collector.collectSignals(TENANT_ID, STUDENT_ID, YEAR_ID);
      expect(result.rawScore).toBeLessThanOrEqual(100);
    });
  });
});
