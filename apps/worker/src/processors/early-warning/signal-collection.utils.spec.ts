import { collectAllSignals } from './signal-collection.utils';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const STUDENT_ID = '22222222-2222-2222-2222-222222222222';
const ACADEMIC_YEAR_ID = '33333333-3333-3333-3333-333333333333';
const PARENT_ID = '44444444-4444-4444-4444-444444444444';
const USER_ID = '55555555-5555-5555-5555-555555555555';

interface BuildMockTxOptions {
  acknowledgements?: Array<{
    acknowledged_at: Date | null;
    id: string;
    parent_id: string;
    sent_at: Date;
  }>;
  academicYear?: {
    end_date: Date;
    id: string;
    start_date: Date;
  } | null;
  behaviourExclusionCases?: Array<{ id: string }>;
  behaviourIncidentParticipants14d?: Array<{
    id: string;
    incident: { occurred_at: Date; polarity: string; severity: number };
  }>;
  behaviourIncidentParticipants30d?: Array<{
    id: string;
    incident: { occurred_at: Date; polarity: string; severity: number };
  }>;
  behaviourInterventions?: Array<{ id: string; outcome: string | null; status: string }>;
  behaviourSanctions?: Array<{
    id: string;
    status: string;
    suspension_start_date: Date | null;
    type: string;
  }>;
  checkins?: Array<{ checkin_date: Date; id: string; mood_score: number }>;
  concerns?: Array<{
    category: string;
    follow_up_needed: boolean;
    id: string;
    severity: string;
  }>;
  criticalIncidentAffected?: Array<{ id: string; impact_level: string }>;
  missingGrades?: Array<{ id: string }>;
  notifications?: Array<{
    created_at: Date;
    id: string;
    read_at: Date | null;
    recipient_user_id: string;
  }>;
  parentInquiries?: Array<{ id: string }>;
  pastoralCases?: Array<{ id: string; status: string }>;
  pastoralReferrals?: Array<{
    id: string;
    referral_body_name: string | null;
    referral_type: string;
    status: string;
  }>;
  patternAlerts?: Array<{
    alert_type: string;
    details_json: Record<string, unknown>;
    id: string;
    status: string;
  }>;
  progressEntries?: Array<{ subject_id: string; trend: string }>;
  riskAlerts?: Array<{
    alert_type: string;
    id: string;
    subject_id: string;
    trigger_reason: string;
  }>;
  snapshots?: Array<{
    academic_period: { start_date: Date };
    academic_period_id: string;
    computed_value: number;
    id: string;
    subject_id: string;
  }>;
  studentParents?: Array<{
    parent: { id: string; user_id: string | null };
  }>;
  summaries?: Array<{ derived_status: string; id: string; summary_date: Date }>;
  users?: Array<{ id: string; last_login_at: Date | null }>;
}

function buildMockTx(options: BuildMockTxOptions = {}) {
  return {
    academicYear: {
      findFirst: jest.fn().mockResolvedValue(
        options.academicYear ?? {
          end_date: new Date('2026-06-30T00:00:00.000Z'),
          id: ACADEMIC_YEAR_ID,
          start_date: new Date('2025-09-01T00:00:00.000Z'),
        },
      ),
    },
    attendancePatternAlert: {
      findMany: jest.fn().mockResolvedValue(options.patternAlerts ?? []),
    },
    behaviourExclusionCase: {
      findMany: jest.fn().mockResolvedValue(options.behaviourExclusionCases ?? []),
    },
    behaviourIncidentParticipant: {
      findMany: jest
        .fn()
        .mockImplementation(
          async (args: { where: { incident: { occurred_at: { gte: Date } } } }) => {
            const lowerBound = args.where.incident.occurred_at.gte;
            const thirtyDaysAgo = new Date('2026-03-02T12:00:00.000Z');

            return lowerBound.getTime() <= thirtyDaysAgo.getTime()
              ? (options.behaviourIncidentParticipants30d ?? [])
              : (options.behaviourIncidentParticipants14d ?? []);
          },
        ),
    },
    behaviourIntervention: {
      findMany: jest.fn().mockResolvedValue(options.behaviourInterventions ?? []),
    },
    behaviourParentAcknowledgement: {
      findMany: jest.fn().mockResolvedValue(options.acknowledgements ?? []),
    },
    behaviourSanction: {
      findMany: jest.fn().mockResolvedValue(options.behaviourSanctions ?? []),
    },
    criticalIncidentAffected: {
      findMany: jest.fn().mockResolvedValue(options.criticalIncidentAffected ?? []),
    },
    dailyAttendanceSummary: {
      findMany: jest.fn().mockResolvedValue(options.summaries ?? []),
    },
    grade: {
      findMany: jest.fn().mockResolvedValue(options.missingGrades ?? []),
    },
    notification: {
      findMany: jest.fn().mockResolvedValue(options.notifications ?? []),
    },
    parentInquiry: {
      findMany: jest.fn().mockResolvedValue(options.parentInquiries ?? []),
    },
    pastoralCase: {
      findMany: jest.fn().mockResolvedValue(options.pastoralCases ?? []),
    },
    pastoralConcern: {
      findMany: jest.fn().mockResolvedValue(options.concerns ?? []),
    },
    pastoralReferral: {
      findMany: jest.fn().mockResolvedValue(options.pastoralReferrals ?? []),
    },
    periodGradeSnapshot: {
      findMany: jest.fn().mockResolvedValue(options.snapshots ?? []),
    },
    progressReportEntry: {
      findMany: jest.fn().mockResolvedValue(options.progressEntries ?? []),
    },
    studentAcademicRiskAlert: {
      findMany: jest.fn().mockResolvedValue(options.riskAlerts ?? []),
    },
    studentCheckin: {
      findMany: jest.fn().mockResolvedValue(options.checkins ?? []),
    },
    studentParent: {
      findMany: jest.fn().mockResolvedValue(options.studentParents ?? []),
    },
    user: {
      findMany: jest.fn().mockResolvedValue(options.users ?? []),
    },
  };
}

function findDomain(results: Awaited<ReturnType<typeof collectAllSignals>>, domain: string) {
  const result = results.find((entry) => entry.domain === domain);

  if (!result) {
    throw new Error(`Domain ${domain} not found`);
  }

  return result;
}

describe('collectAllSignals', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-01T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('should return five ordered domain results even when no signals are present', async () => {
    const results = await collectAllSignals(
      buildMockTx() as never,
      TENANT_ID,
      STUDENT_ID,
      ACADEMIC_YEAR_ID,
    );

    expect(results.map((result) => result.domain)).toEqual([
      'attendance',
      'grades',
      'behaviour',
      'wellbeing',
      'engagement',
    ]);
    expect(results.every((result) => result.rawScore === 0)).toBe(true);
    expect(results.every((result) => result.signals.length === 0)).toBe(true);
  });

  it('should collect attendance signals across rate, streak, pattern, tardiness, and trajectory thresholds', async () => {
    const results = await collectAllSignals(
      buildMockTx({
        patternAlerts: [
          {
            alert_type: 'recurring_day',
            details_json: { count: 3, day_name: 'Monday' },
            id: 'pattern-recurring',
            status: 'active',
          },
          {
            alert_type: 'chronic_tardiness',
            details_json: {},
            id: 'pattern-tardy',
            status: 'active',
          },
        ],
        summaries: [
          {
            derived_status: 'absent',
            id: 'sum-20',
            summary_date: new Date('2026-04-01T09:00:00.000Z'),
          },
          {
            derived_status: 'absent',
            id: 'sum-19',
            summary_date: new Date('2026-03-31T09:00:00.000Z'),
          },
          {
            derived_status: 'absent',
            id: 'sum-18',
            summary_date: new Date('2026-03-30T09:00:00.000Z'),
          },
          {
            derived_status: 'late',
            id: 'sum-17',
            summary_date: new Date('2026-03-27T09:00:00.000Z'),
          },
          {
            derived_status: 'late',
            id: 'sum-16',
            summary_date: new Date('2026-03-26T09:00:00.000Z'),
          },
          {
            derived_status: 'absent',
            id: 'sum-15',
            summary_date: new Date('2026-03-25T09:00:00.000Z'),
          },
          {
            derived_status: 'absent',
            id: 'sum-14',
            summary_date: new Date('2026-03-24T09:00:00.000Z'),
          },
          {
            derived_status: 'present',
            id: 'sum-13',
            summary_date: new Date('2026-03-23T09:00:00.000Z'),
          },
          {
            derived_status: 'present',
            id: 'sum-12',
            summary_date: new Date('2026-03-20T09:00:00.000Z'),
          },
          {
            derived_status: 'present',
            id: 'sum-11',
            summary_date: new Date('2026-03-19T09:00:00.000Z'),
          },
          {
            derived_status: 'absent',
            id: 'sum-10',
            summary_date: new Date('2026-03-18T09:00:00.000Z'),
          },
          {
            derived_status: 'present',
            id: 'sum-9',
            summary_date: new Date('2026-03-17T09:00:00.000Z'),
          },
          {
            derived_status: 'present',
            id: 'sum-8',
            summary_date: new Date('2026-03-16T09:00:00.000Z'),
          },
          {
            derived_status: 'present',
            id: 'sum-7',
            summary_date: new Date('2026-03-13T09:00:00.000Z'),
          },
          {
            derived_status: 'present',
            id: 'sum-6',
            summary_date: new Date('2026-03-12T09:00:00.000Z'),
          },
          {
            derived_status: 'present',
            id: 'sum-5',
            summary_date: new Date('2026-03-11T09:00:00.000Z'),
          },
          {
            derived_status: 'present',
            id: 'sum-4',
            summary_date: new Date('2026-03-10T09:00:00.000Z'),
          },
          {
            derived_status: 'present',
            id: 'sum-3',
            summary_date: new Date('2026-03-09T09:00:00.000Z'),
          },
          {
            derived_status: 'present',
            id: 'sum-2',
            summary_date: new Date('2026-03-06T09:00:00.000Z'),
          },
          {
            derived_status: 'present',
            id: 'sum-1',
            summary_date: new Date('2026-03-05T09:00:00.000Z'),
          },
        ],
      }) as never,
      TENANT_ID,
      STUDENT_ID,
      ACADEMIC_YEAR_ID,
    );
    const attendance = findDomain(results, 'attendance');

    expect(attendance.rawScore).toBe(75);
    expect(attendance.signals.map((signal) => signal.signalType)).toEqual([
      'attendance_rate_decline',
      'consecutive_absences',
      'recurring_day_pattern',
      'chronic_tardiness',
      'attendance_trajectory',
    ]);
  });

  it('should collect grades signals for active risk alerts, trajectory decline, missing assessments, and anomalies', async () => {
    const results = await collectAllSignals(
      buildMockTx({
        missingGrades: [
          { id: 'missing-1' },
          { id: 'missing-2' },
          { id: 'missing-3' },
          { id: 'missing-4' },
        ],
        riskAlerts: [
          {
            alert_type: 'at_risk_high',
            id: 'risk-high',
            subject_id: 'subject-a',
            trigger_reason: 'Student average dropped sharply below class mean',
          },
          {
            alert_type: 'score_anomaly',
            id: 'risk-anomaly',
            subject_id: 'subject-b',
            trigger_reason: 'One score is far from the student mean',
          },
        ],
        snapshots: [
          {
            academic_period: { start_date: new Date('2025-09-01T00:00:00.000Z') },
            academic_period_id: 'period-1',
            computed_value: 85,
            id: 'snap-1',
            subject_id: 'subject-a',
          },
          {
            academic_period: { start_date: new Date('2026-01-15T00:00:00.000Z') },
            academic_period_id: 'period-2',
            computed_value: 70,
            id: 'snap-2',
            subject_id: 'subject-a',
          },
          {
            academic_period: { start_date: new Date('2025-09-01T00:00:00.000Z') },
            academic_period_id: 'period-1',
            computed_value: 88,
            id: 'snap-3',
            subject_id: 'subject-b',
          },
          {
            academic_period: { start_date: new Date('2026-01-15T00:00:00.000Z') },
            academic_period_id: 'period-2',
            computed_value: 70,
            id: 'snap-4',
            subject_id: 'subject-b',
          },
          {
            academic_period: { start_date: new Date('2025-09-01T00:00:00.000Z') },
            academic_period_id: 'period-1',
            computed_value: 90,
            id: 'snap-5',
            subject_id: 'subject-c',
          },
          {
            academic_period: { start_date: new Date('2026-01-15T00:00:00.000Z') },
            academic_period_id: 'period-2',
            computed_value: 60,
            id: 'snap-6',
            subject_id: 'subject-c',
          },
        ],
      }) as never,
      TENANT_ID,
      STUDENT_ID,
      ACADEMIC_YEAR_ID,
    );
    const grades = findDomain(results, 'grades');

    expect(grades.rawScore).toBe(100);
    expect(grades.signals.map((signal) => signal.signalType)).toEqual([
      'below_class_mean',
      'grade_trajectory_decline',
      'multi_subject_decline',
      'missing_assessments',
      'score_anomaly',
    ]);
  });

  it('should collect behaviour signals for frequency, severity, sanctions, exclusions, and failed interventions', async () => {
    const results = await collectAllSignals(
      buildMockTx({
        behaviourExclusionCases: [{ id: 'exclusion-1' }, { id: 'exclusion-2' }],
        behaviourIncidentParticipants14d: [
          {
            id: 'bi-1',
            incident: {
              occurred_at: new Date('2026-03-31T09:00:00.000Z'),
              polarity: 'negative',
              severity: 4,
            },
          },
          {
            id: 'bi-2',
            incident: {
              occurred_at: new Date('2026-03-30T09:00:00.000Z'),
              polarity: 'negative',
              severity: 4,
            },
          },
          {
            id: 'bi-3',
            incident: {
              occurred_at: new Date('2026-03-28T09:00:00.000Z'),
              polarity: 'negative',
              severity: 3,
            },
          },
          {
            id: 'bi-4',
            incident: {
              occurred_at: new Date('2026-03-26T09:00:00.000Z'),
              polarity: 'negative',
              severity: 3,
            },
          },
          {
            id: 'bi-5',
            incident: {
              occurred_at: new Date('2026-03-24T09:00:00.000Z'),
              polarity: 'negative',
              severity: 3,
            },
          },
          {
            id: 'bi-6',
            incident: {
              occurred_at: new Date('2026-03-22T09:00:00.000Z'),
              polarity: 'negative',
              severity: 2,
            },
          },
          {
            id: 'bi-7',
            incident: {
              occurred_at: new Date('2026-03-20T09:00:00.000Z'),
              polarity: 'negative',
              severity: 2,
            },
          },
        ],
        behaviourIncidentParticipants30d: [
          {
            id: 'bi-8',
            incident: {
              occurred_at: new Date('2026-03-10T09:00:00.000Z'),
              polarity: 'negative',
              severity: 1,
            },
          },
          {
            id: 'bi-9',
            incident: {
              occurred_at: new Date('2026-03-12T09:00:00.000Z'),
              polarity: 'negative',
              severity: 1,
            },
          },
          {
            id: 'bi-10',
            incident: {
              occurred_at: new Date('2026-03-28T09:00:00.000Z'),
              polarity: 'negative',
              severity: 4,
            },
          },
          {
            id: 'bi-11',
            incident: {
              occurred_at: new Date('2026-03-29T09:00:00.000Z'),
              polarity: 'negative',
              severity: 4,
            },
          },
        ],
        behaviourInterventions: [
          { id: 'intervention-1', outcome: 'deteriorated', status: 'completed_intervention' },
          { id: 'intervention-2', outcome: null, status: 'abandoned' },
        ],
        behaviourSanctions: [
          {
            id: 'sanction-1',
            status: 'scheduled',
            suspension_start_date: new Date('2026-04-02T09:00:00.000Z'),
            type: 'suspension_external',
          },
        ],
      }) as never,
      TENANT_ID,
      STUDENT_ID,
      ACADEMIC_YEAR_ID,
    );
    const behaviour = findDomain(results, 'behaviour');

    expect(behaviour.rawScore).toBe(100);
    expect(behaviour.signals.map((signal) => signal.signalType)).toEqual(
      expect.arrayContaining([
        'incident_frequency',
        'active_sanction',
        'exclusion_history',
        'failed_intervention',
      ]),
    );
  });

  it('should collect wellbeing signals for declining mood, active concerns, cases, referrals, and critical incidents', async () => {
    const results = await collectAllSignals(
      buildMockTx({
        checkins: [
          { checkin_date: new Date('2026-04-01T09:00:00.000Z'), id: 'checkin-1', mood_score: 1 },
          { checkin_date: new Date('2026-03-25T09:00:00.000Z'), id: 'checkin-2', mood_score: 1 },
          { checkin_date: new Date('2026-03-20T09:00:00.000Z'), id: 'checkin-3', mood_score: 1 },
          { checkin_date: new Date('2026-03-15T09:00:00.000Z'), id: 'checkin-4', mood_score: 3 },
          { checkin_date: new Date('2026-03-10T09:00:00.000Z'), id: 'checkin-5', mood_score: 4 },
        ],
        concerns: [
          {
            category: 'self-harm',
            follow_up_needed: true,
            id: 'concern-1',
            severity: 'critical',
          },
        ],
        criticalIncidentAffected: [{ id: 'affected-1', impact_level: 'direct' }],
        pastoralCases: [
          { id: 'case-1', status: 'open' },
          { id: 'case-2', status: 'monitoring' },
        ],
        pastoralReferrals: [
          {
            id: 'referral-1',
            referral_body_name: 'Tusla',
            referral_type: 'statutory',
            status: 'submitted',
          },
          {
            id: 'referral-2',
            referral_body_name: 'NEPS',
            referral_type: 'support',
            status: 'acknowledged',
          },
        ],
      }) as never,
      TENANT_ID,
      STUDENT_ID,
      ACADEMIC_YEAR_ID,
    );
    const wellbeing = findDomain(results, 'wellbeing');

    expect(wellbeing.rawScore).toBe(100);
    expect(wellbeing.signals.map((signal) => signal.signalType)).toEqual([
      'declining_wellbeing_score',
      'low_mood_pattern',
      'active_pastoral_concern',
      'active_pastoral_case',
      'external_referral',
      'critical_incident_affected',
    ]);
  });

  it('should collect engagement signals for unread notifications, no login, no inquiry, slow acknowledgements, and disengagement trajectory', async () => {
    const results = await collectAllSignals(
      buildMockTx({
        acknowledgements: [
          {
            acknowledged_at: null,
            id: 'ack-1',
            parent_id: PARENT_ID,
            sent_at: new Date('2026-03-20T09:00:00.000Z'),
          },
          {
            acknowledged_at: null,
            id: 'ack-2',
            parent_id: PARENT_ID,
            sent_at: new Date('2026-03-28T09:00:00.000Z'),
          },
        ],
        notifications: [
          {
            created_at: new Date('2026-04-01T09:00:00.000Z'),
            id: 'notif-1',
            read_at: null,
            recipient_user_id: USER_ID,
          },
          {
            created_at: new Date('2026-03-31T09:00:00.000Z'),
            id: 'notif-2',
            read_at: null,
            recipient_user_id: USER_ID,
          },
          {
            created_at: new Date('2026-03-30T09:00:00.000Z'),
            id: 'notif-3',
            read_at: null,
            recipient_user_id: USER_ID,
          },
          {
            created_at: new Date('2026-03-27T09:00:00.000Z'),
            id: 'notif-4',
            read_at: null,
            recipient_user_id: USER_ID,
          },
          {
            created_at: new Date('2026-03-26T09:00:00.000Z'),
            id: 'notif-5',
            read_at: null,
            recipient_user_id: USER_ID,
          },
          {
            created_at: new Date('2026-03-25T09:00:00.000Z'),
            id: 'notif-6',
            read_at: new Date('2026-03-25T10:00:00.000Z'),
            recipient_user_id: USER_ID,
          },
          {
            created_at: new Date('2026-03-24T09:00:00.000Z'),
            id: 'notif-7',
            read_at: null,
            recipient_user_id: USER_ID,
          },
          {
            created_at: new Date('2026-03-23T09:00:00.000Z'),
            id: 'notif-8',
            read_at: null,
            recipient_user_id: USER_ID,
          },
          {
            created_at: new Date('2026-03-20T09:00:00.000Z'),
            id: 'notif-9',
            read_at: null,
            recipient_user_id: USER_ID,
          },
          {
            created_at: new Date('2026-03-19T09:00:00.000Z'),
            id: 'notif-10',
            read_at: null,
            recipient_user_id: USER_ID,
          },
          {
            created_at: new Date('2026-03-18T09:00:00.000Z'),
            id: 'notif-11',
            read_at: new Date('2026-03-18T10:00:00.000Z'),
            recipient_user_id: USER_ID,
          },
          {
            created_at: new Date('2026-03-17T09:00:00.000Z'),
            id: 'notif-12',
            read_at: null,
            recipient_user_id: USER_ID,
          },
          {
            created_at: new Date('2026-03-14T09:00:00.000Z'),
            id: 'notif-13',
            read_at: null,
            recipient_user_id: USER_ID,
          },
          {
            created_at: new Date('2026-03-12T09:00:00.000Z'),
            id: 'notif-14',
            read_at: null,
            recipient_user_id: USER_ID,
          },
          {
            created_at: new Date('2026-03-10T09:00:00.000Z'),
            id: 'notif-15',
            read_at: new Date('2026-03-10T10:00:00.000Z'),
            recipient_user_id: USER_ID,
          },
        ],
        parentInquiries: [],
        studentParents: [
          {
            parent: {
              id: PARENT_ID,
              user_id: USER_ID,
            },
          },
        ],
        users: [{ id: USER_ID, last_login_at: null }],
      }) as never,
      TENANT_ID,
      STUDENT_ID,
      ACADEMIC_YEAR_ID,
    );
    const engagement = findDomain(results, 'engagement');

    expect(engagement.rawScore).toBe(80);
    expect(engagement.signals.map((signal) => signal.signalType)).toEqual([
      'low_notification_read_rate',
      'no_portal_login',
      'no_parent_inquiry',
      'slow_acknowledgement',
      'disengagement_trajectory',
    ]);
  });
});
