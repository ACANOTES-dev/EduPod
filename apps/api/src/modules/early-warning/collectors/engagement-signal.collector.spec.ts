import { Test } from '@nestjs/testing';

import {
  MOCK_FACADE_PROVIDERS,
  ParentReadFacade,
  CommunicationsReadFacade,
  AuthReadFacade,
  AcademicReadFacade,
  ParentInquiriesReadFacade,
  BehaviourReadFacade,
} from '../../../common/tests/mock-facades';
import { PrismaService } from '../../prisma/prisma.service';

import { EngagementSignalCollector } from './engagement-signal.collector';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const STUDENT_ID = '00000000-0000-0000-0000-000000000002';
const ACADEMIC_YEAR_ID = '00000000-0000-0000-0000-000000000003';
const PARENT_ID_1 = '00000000-0000-0000-0000-000000000010';
const PARENT_ID_2 = '00000000-0000-0000-0000-000000000011';
const USER_ID_1 = '00000000-0000-0000-0000-000000000020';
const USER_ID_2 = '00000000-0000-0000-0000-000000000021';
const NOTIF_ID_1 = '00000000-0000-0000-0000-000000000030';
const ACK_ID_1 = '00000000-0000-0000-0000-000000000040';

const MS_PER_DAY = 86_400_000;

// ─── Mock Factory ───────────────────────────────────────────────────────────

function buildMockPrisma() {
  return {
    studentParent: { findMany: jest.fn().mockResolvedValue([]) },
    notification: { findMany: jest.fn().mockResolvedValue([]) },
    parentInquiry: { findMany: jest.fn().mockResolvedValue([]) },
    academicYear: { findFirst: jest.fn().mockResolvedValue(null) },
    behaviourParentAcknowledgement: { findMany: jest.fn().mockResolvedValue([]) },
    user: { findMany: jest.fn().mockResolvedValue([]) },
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * MS_PER_DAY);
}

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 3_600_000);
}

function makeStudentParent(parentId: string, userId: string | null) {
  return {
    student_id: STUDENT_ID,
    parent_id: parentId,
    tenant_id: TENANT_ID,
    parent: { id: parentId, user_id: userId },
  };
}

function makeNotification(
  id: string,
  recipientUserId: string,
  createdAt: Date,
  readAt: Date | null,
) {
  return { id, recipient_user_id: recipientUserId, created_at: createdAt, read_at: readAt };
}

function makeAcademicYear(startDate: Date, endDate: Date) {
  return { id: ACADEMIC_YEAR_ID, start_date: startDate, end_date: endDate };
}

function makeAcknowledgement(
  id: string,
  parentId: string,
  sentAt: Date,
  acknowledgedAt: Date | null,
) {
  return { id, parent_id: parentId, sent_at: sentAt, acknowledged_at: acknowledgedAt };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('EngagementSignalCollector', () => {
  let collector: EngagementSignalCollector;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        EngagementSignalCollector,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: ParentReadFacade,
          useValue: {
            findParentUserIdsForStudent: jest.fn().mockImplementation(
              async () => {
                // Delegate to mockPrisma.studentParent.findMany and extract parent
                const rows = await mockPrisma.studentParent.findMany();
                return rows.map((r: { parent: { id: string; user_id: string | null } }) => r.parent);
              },
            ),
          },
        },
        {
          provide: CommunicationsReadFacade,
          useValue: {
            findInAppNotificationsForUsers: mockPrisma.notification.findMany,
          },
        },
        {
          provide: AuthReadFacade,
          useValue: {
            findUsersWithLoginInfo: mockPrisma.user.findMany,
          },
        },
        {
          provide: AcademicReadFacade,
          useValue: {
            findYearById: mockPrisma.academicYear.findFirst,
          },
        },
        {
          provide: ParentInquiriesReadFacade,
          useValue: {
            findByParentIds: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: BehaviourReadFacade,
          useValue: {
            findParentAcknowledgements: mockPrisma.behaviourParentAcknowledgement.findMany,
          },
        },
      ],
    }).compile();

    collector = module.get<EngagementSignalCollector>(EngagementSignalCollector);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Test 1: No parents → score 0 ──────────────────────────────────────────

  it('should return score 0 when student has no parents', async () => {
    mockPrisma.studentParent.findMany.mockResolvedValue([]);

    const result = await collector.collectSignals(TENANT_ID, STUDENT_ID, ACADEMIC_YEAR_ID);

    expect(result.domain).toBe('engagement');
    expect(result.rawScore).toBe(0);
    expect(result.signals).toHaveLength(0);
    expect(result.summaryFragments).toHaveLength(0);
  });

  // ─── Test 2: Parents without user accounts → score 0 ───────────────────────

  it('should return score 0 when parents have no user accounts', async () => {
    mockPrisma.studentParent.findMany.mockResolvedValue([
      makeStudentParent(PARENT_ID_1, null),
    ]);

    const result = await collector.collectSignals(TENANT_ID, STUDENT_ID, ACADEMIC_YEAR_ID);

    expect(result.rawScore).toBe(0);
    expect(result.signals).toHaveLength(0);
  });

  // ─── Test 3: low_notification_read_rate — 20% → score 10 ───────────────────

  it('should detect low_notification_read_rate when read rate is 20%', async () => {
    mockPrisma.studentParent.findMany.mockResolvedValue([
      makeStudentParent(PARENT_ID_1, USER_ID_1),
    ]);

    // 10 notifications, 2 read = 20% rate
    const notifs = Array.from({ length: 10 }, (_, i) =>
      makeNotification(
        `${NOTIF_ID_1.slice(0, -2)}${String(i).padStart(2, '0')}`,
        USER_ID_1,
        daysAgo(i + 1),
        i < 2 ? daysAgo(i) : null,
      ),
    );
    mockPrisma.notification.findMany.mockResolvedValue(notifs);
    mockPrisma.user.findMany.mockResolvedValue([
      { id: USER_ID_1, last_login_at: new Date() },
    ]);
    mockPrisma.academicYear.findFirst.mockResolvedValue(null);

    const result = await collector.collectSignals(TENANT_ID, STUDENT_ID, ACADEMIC_YEAR_ID);

    const signal = result.signals.find(
      (s) => s.signalType === 'low_notification_read_rate',
    );
    expect(signal).toBeDefined();
    expect(signal!.scoreContribution).toBe(10);
    expect(signal!.details.bestRate).toBe(20);
    expect(signal!.summaryFragment).toContain('20%');
  });

  // ─── Test 4: no_portal_login — 90 days ago → score 25 ──────────────────────

  it('should detect no_portal_login when last login was 90 days ago', async () => {
    mockPrisma.studentParent.findMany.mockResolvedValue([
      makeStudentParent(PARENT_ID_1, USER_ID_1),
    ]);
    mockPrisma.user.findMany.mockResolvedValue([
      { id: USER_ID_1, last_login_at: daysAgo(90) },
    ]);
    mockPrisma.academicYear.findFirst.mockResolvedValue(null);

    const result = await collector.collectSignals(TENANT_ID, STUDENT_ID, ACADEMIC_YEAR_ID);

    const signal = result.signals.find((s) => s.signalType === 'no_portal_login');
    expect(signal).toBeDefined();
    expect(signal!.scoreContribution).toBe(25);
    expect(signal!.summaryFragment).toContain('90 days');
  });

  // ─── Test 5: no_parent_inquiry — 0 inquiries, year > 6 months → score 15 ──

  it('should detect no_parent_inquiry when no inquiries and year > 6 months', async () => {
    mockPrisma.studentParent.findMany.mockResolvedValue([
      makeStudentParent(PARENT_ID_1, USER_ID_1),
    ]);
    mockPrisma.user.findMany.mockResolvedValue([
      { id: USER_ID_1, last_login_at: new Date() },
    ]);

    // Academic year started 8 months ago
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 8);
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 4);
    const academicYear = makeAcademicYear(startDate, endDate);

    // First call is in fetchParentInquiryCount → academicYear.findFirst
    // Second call is in fetchAcademicYear → academicYear.findFirst
    mockPrisma.academicYear.findFirst.mockResolvedValue(academicYear);
    mockPrisma.parentInquiry.findMany.mockResolvedValue([]);

    const result = await collector.collectSignals(TENANT_ID, STUDENT_ID, ACADEMIC_YEAR_ID);

    const signal = result.signals.find((s) => s.signalType === 'no_parent_inquiry');
    expect(signal).toBeDefined();
    expect(signal!.scoreContribution).toBe(15);
    expect(signal!.summaryFragment).toBe(
      'No parent-initiated inquiries this academic year',
    );
  });

  // ─── Test 6: slow_acknowledgement — 100h avg → score 10 ────────────────────

  it('should detect slow_acknowledgement when average response is 100 hours', async () => {
    mockPrisma.studentParent.findMany.mockResolvedValue([
      makeStudentParent(PARENT_ID_1, USER_ID_1),
    ]);
    mockPrisma.user.findMany.mockResolvedValue([
      { id: USER_ID_1, last_login_at: new Date() },
    ]);
    mockPrisma.academicYear.findFirst.mockResolvedValue(null);

    // 3 acknowledgements with ~100h average
    const acks = [
      makeAcknowledgement(
        `${ACK_ID_1.slice(0, -2)}01`,
        PARENT_ID_1,
        hoursAgo(200),
        hoursAgo(100),
      ),
      makeAcknowledgement(
        `${ACK_ID_1.slice(0, -2)}02`,
        PARENT_ID_1,
        hoursAgo(400),
        hoursAgo(300),
      ),
      makeAcknowledgement(
        `${ACK_ID_1.slice(0, -2)}03`,
        PARENT_ID_1,
        hoursAgo(600),
        hoursAgo(500),
      ),
    ];
    mockPrisma.behaviourParentAcknowledgement.findMany.mockResolvedValue(acks);

    const result = await collector.collectSignals(TENANT_ID, STUDENT_ID, ACADEMIC_YEAR_ID);

    const signal = result.signals.find(
      (s) => s.signalType === 'slow_acknowledgement',
    );
    expect(signal).toBeDefined();
    expect(signal!.scoreContribution).toBe(10);
    expect(signal!.summaryFragment).toContain('100 hours');
  });

  // ─── Test 7: disengagement_trajectory — declining rates → score 10+ ────────

  it('should detect disengagement_trajectory with 3+ declining weeks', async () => {
    mockPrisma.studentParent.findMany.mockResolvedValue([
      makeStudentParent(PARENT_ID_1, USER_ID_1),
    ]);
    mockPrisma.user.findMany.mockResolvedValue([
      { id: USER_ID_1, last_login_at: new Date() },
    ]);
    mockPrisma.academicYear.findFirst.mockResolvedValue(null);

    // Create notifications with declining read rates across 4 weeks
    // Week 1 (oldest): 4/5 read = 80%, Week 2: 3/5 = 60%, Week 3: 2/5 = 40%, Week 4: 1/5 = 20%
    const now = Date.now();
    const notifs: Array<{
      id: string;
      recipient_user_id: string;
      created_at: Date;
      read_at: Date | null;
    }> = [];

    for (let week = 0; week < 4; week++) {
      const readCount = 4 - week; // 4, 3, 2, 1
      for (let j = 0; j < 5; j++) {
        const dayOffset = (3 - week) * 7 + j;
        notifs.push(
          makeNotification(
            `${NOTIF_ID_1.slice(0, -2)}${String(week * 5 + j).padStart(2, '0')}`,
            USER_ID_1,
            new Date(now - dayOffset * MS_PER_DAY),
            j < readCount ? new Date(now - dayOffset * MS_PER_DAY + 3_600_000) : null,
          ),
        );
      }
    }

    mockPrisma.notification.findMany.mockResolvedValue(notifs);

    const result = await collector.collectSignals(TENANT_ID, STUDENT_ID, ACADEMIC_YEAR_ID);

    const signal = result.signals.find(
      (s) => s.signalType === 'disengagement_trajectory',
    );
    expect(signal).toBeDefined();
    expect(signal!.scoreContribution).toBeGreaterThanOrEqual(10);
    expect(signal!.summaryFragment).toContain('consecutive weeks');
  });

  // ─── Test 8: Best parent metric — 2 parents, uses most engaged ─────────────

  it('should use best parent read rate — 50% does not trigger signal', async () => {
    mockPrisma.studentParent.findMany.mockResolvedValue([
      makeStudentParent(PARENT_ID_1, USER_ID_1),
      makeStudentParent(PARENT_ID_2, USER_ID_2),
    ]);
    mockPrisma.user.findMany.mockResolvedValue([
      { id: USER_ID_1, last_login_at: new Date() },
      { id: USER_ID_2, last_login_at: new Date() },
    ]);
    mockPrisma.academicYear.findFirst.mockResolvedValue(null);

    // Parent 1: 5/10 read = 50%, Parent 2: 1/10 read = 10%
    const notifs: Array<{
      id: string;
      recipient_user_id: string;
      created_at: Date;
      read_at: Date | null;
    }> = [];

    for (let i = 0; i < 10; i++) {
      notifs.push(
        makeNotification(
          `${NOTIF_ID_1.slice(0, -2)}${String(i).padStart(2, '0')}`,
          USER_ID_1,
          daysAgo(i + 1),
          i < 5 ? daysAgo(i) : null,
        ),
      );
    }
    for (let i = 0; i < 10; i++) {
      notifs.push(
        makeNotification(
          `${NOTIF_ID_1.slice(0, -2)}${String(i + 10).padStart(2, '0')}`,
          USER_ID_2,
          daysAgo(i + 1),
          i < 1 ? daysAgo(i) : null,
        ),
      );
    }

    mockPrisma.notification.findMany.mockResolvedValue(notifs);

    const result = await collector.collectSignals(TENANT_ID, STUDENT_ID, ACADEMIC_YEAR_ID);

    // Best parent has 50% read rate which is above 30% threshold — no signal
    const signal = result.signals.find(
      (s) => s.signalType === 'low_notification_read_rate',
    );
    expect(signal).toBeUndefined();
  });

  // ─── Test 9: Multiple signals cap at 100 ───────────────────────────────────

  it('should cap rawScore at 100 when multiple signals fire', async () => {
    mockPrisma.studentParent.findMany.mockResolvedValue([
      makeStudentParent(PARENT_ID_1, USER_ID_1),
    ]);

    // Trigger no_portal_login: never logged in → +25
    mockPrisma.user.findMany.mockResolvedValue([
      { id: USER_ID_1, last_login_at: null },
    ]);

    // Trigger no_parent_inquiry: year > 6 months → +15
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 8);
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 4);
    mockPrisma.academicYear.findFirst.mockResolvedValue(
      makeAcademicYear(startDate, endDate),
    );
    mockPrisma.parentInquiry.findMany.mockResolvedValue([]);

    // Trigger low_notification_read_rate: 0% → +20
    const notifs = Array.from({ length: 10 }, (_, i) =>
      makeNotification(
        `${NOTIF_ID_1.slice(0, -2)}${String(i).padStart(2, '0')}`,
        USER_ID_1,
        daysAgo(i + 1),
        null,
      ),
    );
    mockPrisma.notification.findMany.mockResolvedValue(notifs);

    // Trigger slow_acknowledgement: never acknowledged → +20
    const acks = Array.from({ length: 3 }, (_, i) =>
      makeAcknowledgement(
        `${ACK_ID_1.slice(0, -2)}${String(i).padStart(2, '0')}`,
        PARENT_ID_1,
        daysAgo(i + 5),
        null,
      ),
    );
    mockPrisma.behaviourParentAcknowledgement.findMany.mockResolvedValue(acks);

    const result = await collector.collectSignals(TENANT_ID, STUDENT_ID, ACADEMIC_YEAR_ID);

    // 25 + 15 + 20 + 20 = 80, but with disengagement_trajectory could be more
    // Regardless, cap is enforced
    expect(result.rawScore).toBeLessThanOrEqual(100);
    expect(result.signals.length).toBeGreaterThanOrEqual(4);
  });

  // ─── Test 10: Summary fragments generated ──────────────────────────────────

  it('should generate summary fragments for each detected signal', async () => {
    mockPrisma.studentParent.findMany.mockResolvedValue([
      makeStudentParent(PARENT_ID_1, USER_ID_1),
    ]);

    // Trigger no_portal_login (> 60 days)
    mockPrisma.user.findMany.mockResolvedValue([
      { id: USER_ID_1, last_login_at: daysAgo(90) },
    ]);

    // Trigger no_parent_inquiry (> 6 months)
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 8);
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 4);
    mockPrisma.academicYear.findFirst.mockResolvedValue(
      makeAcademicYear(startDate, endDate),
    );
    mockPrisma.parentInquiry.findMany.mockResolvedValue([]);

    const result = await collector.collectSignals(TENANT_ID, STUDENT_ID, ACADEMIC_YEAR_ID);

    expect(result.summaryFragments.length).toBe(result.signals.length);
    expect(result.summaryFragments.length).toBeGreaterThanOrEqual(2);

    // Verify each signal's summaryFragment is in the result
    for (const signal of result.signals) {
      expect(result.summaryFragments).toContain(signal.summaryFragment);
    }

    // Verify specific fragments exist
    expect(result.summaryFragments.some((f) => f.includes('portal login'))).toBe(true);
    expect(
      result.summaryFragments.some((f) => f.includes('inquiries')),
    ).toBe(true);
  });
});
