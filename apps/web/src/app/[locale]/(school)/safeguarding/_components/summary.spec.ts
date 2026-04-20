import {
  composeHubKpis,
  deriveSlaBucket,
  sealedRowLabel,
  slaProgressPct,
  type SafeguardingDashboardPayload,
} from './summary';

describe('composeHubKpis', () => {
  const baseDashboard: SafeguardingDashboardPayload = {
    open_by_severity: { critical: 2, high: 3, medium: 5, low: 1 },
    sla_compliance: { overdue: 4, due_within_24h: 2, on_track: 5, compliance_rate: 77 },
    by_status: {
      reported: 1,
      acknowledged: 3,
      under_investigation: 4,
      referred: 2,
      monitoring: 1,
    },
    overdue_tasks: [],
    recent_actions: [],
  };

  it('sums open concerns across severity', () => {
    const kpis = composeHubKpis(baseDashboard, 7);
    expect(kpis.open_concerns_total).toBe(11);
    expect(kpis.open_by_severity).toEqual({ critical: 2, high: 3, medium: 5, low: 1 });
  });

  it('exposes sla_compliance.overdue as breaches', () => {
    expect(composeHubKpis(baseDashboard, 0).sla_breaches_open).toBe(4);
  });

  it('approximates critical_awaiting_ack as min(critical, reported)', () => {
    expect(composeHubKpis(baseDashboard, 0).critical_awaiting_ack).toBe(1);
  });

  it('echoes sealed_this_year from its own feed', () => {
    expect(composeHubKpis(baseDashboard, 12).sealed_this_year).toBe(12);
  });

  it('tolerates null dashboard (loading state)', () => {
    const kpis = composeHubKpis(null, null);
    expect(kpis.open_concerns_total).toBe(0);
    expect(kpis.sla_breaches_open).toBe(0);
    expect(kpis.sealed_this_year).toBe(0);
  });

  it('zero-defaults severity keys that the backend omits', () => {
    const kpis = composeHubKpis(
      {
        ...baseDashboard,
        open_by_severity: { critical: 1 },
      },
      null,
    );
    expect(kpis.open_by_severity.high).toBe(0);
    expect(kpis.open_by_severity.medium).toBe(0);
    expect(kpis.open_by_severity.low).toBe(0);
  });
});

describe('deriveSlaBucket', () => {
  const now = new Date('2026-04-20T12:00:00Z');

  it('returns on_track when first response has been met already', () => {
    expect(
      deriveSlaBucket(
        { sla_first_response_met_at: '2026-04-19T10:00:00Z', sla_first_response_due: null },
        now,
      ),
    ).toBe('on_track');
  });

  it('returns breached when due date is in the past and response missing', () => {
    expect(
      deriveSlaBucket(
        { sla_first_response_met_at: null, sla_first_response_due: '2026-04-19T12:00:00Z' },
        now,
      ),
    ).toBe('breached');
  });

  it('returns due_soon within 24 hours window', () => {
    expect(
      deriveSlaBucket(
        { sla_first_response_met_at: null, sla_first_response_due: '2026-04-21T06:00:00Z' },
        now,
      ),
    ).toBe('due_soon');
  });

  it('returns on_track when well outside the 24h window', () => {
    expect(
      deriveSlaBucket(
        { sla_first_response_met_at: null, sla_first_response_due: '2026-05-01T00:00:00Z' },
        now,
      ),
    ).toBe('on_track');
  });

  it('returns unknown when both fields are null', () => {
    expect(
      deriveSlaBucket({ sla_first_response_met_at: null, sla_first_response_due: null }, now),
    ).toBe('unknown');
  });
});

describe('slaProgressPct', () => {
  const now = new Date('2026-04-20T12:00:00Z');

  it('returns 0 before the timer has visibly started', () => {
    expect(
      slaProgressPct(
        { created_at: '2026-04-20T12:00:00Z', sla_first_response_due: '2026-04-21T12:00:00Z' },
        now,
      ),
    ).toBe(0);
  });

  it('returns 50 at the halfway mark', () => {
    expect(
      slaProgressPct(
        { created_at: '2026-04-20T00:00:00Z', sla_first_response_due: '2026-04-21T00:00:00Z' },
        new Date('2026-04-20T12:00:00Z'),
      ),
    ).toBe(50);
  });

  it('caps at 100 after breach', () => {
    expect(
      slaProgressPct(
        { created_at: '2026-04-19T00:00:00Z', sla_first_response_due: '2026-04-19T12:00:00Z' },
        now,
      ),
    ).toBe(100);
  });

  it('returns 0 when no due date is set', () => {
    expect(
      slaProgressPct({ created_at: '2026-04-20T00:00:00Z', sla_first_response_due: null }, now),
    ).toBe(0);
  });
});

describe('sealedRowLabel', () => {
  const opts = { unknownApprover: 'unknown approver', noDate: 'no date' };

  it('includes concern number and approver name when available', () => {
    const label = sealedRowLabel(
      {
        concern_number: 'SG-00042',
        sealed_at: '2026-03-10T08:00:00Z',
        seal_approved_by: { id: 'u1', first_name: 'Yusuf', last_name: 'Rahman' },
      },
      opts,
    );
    expect(label).toBe('Sealed concern #SG-00042 · sealed 2026-03-10 · approved by Yusuf Rahman');
  });

  it('falls back to unknown approver when null', () => {
    const label = sealedRowLabel(
      {
        concern_number: 'SG-1',
        sealed_at: '2026-01-01T00:00:00Z',
        seal_approved_by: null,
      },
      opts,
    );
    expect(label).toContain('approved by unknown approver');
  });

  it('falls back to no-date copy when seal date is missing', () => {
    const label = sealedRowLabel(
      {
        concern_number: 'SG-1',
        sealed_at: null,
        seal_approved_by: null,
      },
      opts,
    );
    expect(label).toContain('no date');
  });
});
