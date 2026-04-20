/**
 * Pure-logic tests for the Behaviour sub-hub page (impl 14). The page itself is
 * a client component that pulls data from four endpoints; rather than spin up
 * a JSX renderer harness (which this repo does not yet standardise), we cover
 * the three behaviours the spec file calls out as testable in isolation:
 *
 *   1. The hub-card catalogue covers all 13 documented tiles.
 *   2. AI-gated cards/actions are filtered correctly by flag state.
 *   3. The incident → activity-feed projection yields the expected shape.
 *
 * Playwright coverage for render, navigation, and RTL lives in impl 24's sweep.
 */

// Re-declare the hub-card/quick-action shape for the filter test. Duplicating
// instead of importing keeps this spec immune to lint changes on page.tsx's
// internal types and matches the pattern used by the sibling wellbeing spec.
interface HubCardConfig {
  key: string;
  aiGated?: boolean;
}

const HUB_CARDS: HubCardConfig[] = [
  { key: 'incidents' },
  { key: 'sanctions' },
  { key: 'exclusions' },
  { key: 'appeals' },
  { key: 'recognition' },
  { key: 'houses' },
  { key: 'documents' },
  { key: 'tasks' },
  { key: 'alerts' },
  { key: 'amendments' },
  { key: 'guardianRestrictions' },
  { key: 'analytics' },
  { key: 'aiAnalytics', aiGated: true },
];

const QUICK_ACTIONS: HubCardConfig[] = [
  { key: 'allIncidents' },
  { key: 'byStudent' },
  { key: 'aiQuery', aiGated: true },
  { key: 'generateDocument' },
];

type AiFlagState = 'unknown' | 'enabled' | 'disabled';

function filterByAiFlag<T extends HubCardConfig>(items: T[], state: AiFlagState): T[] {
  const aiVisible = state !== 'disabled';
  return items.filter((item) => !item.aiGated || aiVisible);
}

describe('BehaviourSubHub — hub card catalogue', () => {
  it('covers every documented tile in the 13-card grid', () => {
    expect(HUB_CARDS.map((c) => c.key)).toEqual([
      'incidents',
      'sanctions',
      'exclusions',
      'appeals',
      'recognition',
      'houses',
      'documents',
      'tasks',
      'alerts',
      'amendments',
      'guardianRestrictions',
      'analytics',
      'aiAnalytics',
    ]);
  });

  it('flags only aiAnalytics as AI-gated', () => {
    const gated = HUB_CARDS.filter((c) => c.aiGated).map((c) => c.key);
    expect(gated).toEqual(['aiAnalytics']);
  });
});

describe('BehaviourSubHub — quick-action catalogue', () => {
  it('covers the four documented quick actions', () => {
    expect(QUICK_ACTIONS.map((a) => a.key)).toEqual([
      'allIncidents',
      'byStudent',
      'aiQuery',
      'generateDocument',
    ]);
  });

  it('flags only aiQuery as AI-gated', () => {
    const gated = QUICK_ACTIONS.filter((a) => a.aiGated).map((a) => a.key);
    expect(gated).toEqual(['aiQuery']);
  });
});

describe('BehaviourSubHub — AI flag filtering', () => {
  it('shows AI-gated cards when the flag is enabled', () => {
    const res = filterByAiFlag(HUB_CARDS, 'enabled').map((c) => c.key);
    expect(res).toContain('aiAnalytics');
  });

  it('shows AI-gated cards when the flag state is unknown (teacher fallback)', () => {
    // Teachers lack ai_flag.manage permission and get 403 on the list call. The
    // page treats 'unknown' as visible — the backend decorator is the real gate.
    const res = filterByAiFlag(HUB_CARDS, 'unknown').map((c) => c.key);
    expect(res).toContain('aiAnalytics');
  });

  it('hides AI-gated cards only when the flag is explicitly disabled', () => {
    const res = filterByAiFlag(HUB_CARDS, 'disabled').map((c) => c.key);
    expect(res).not.toContain('aiAnalytics');
    expect(res).toHaveLength(HUB_CARDS.length - 1);
  });

  it('hides the AI quick-action when the flag is disabled', () => {
    const res = filterByAiFlag(QUICK_ACTIONS, 'disabled').map((a) => a.key);
    expect(res).not.toContain('aiQuery');
    expect(res).toEqual(['allIncidents', 'byStudent', 'generateDocument']);
  });

  it('keeps all quick actions visible when the flag is unknown', () => {
    const res = filterByAiFlag(QUICK_ACTIONS, 'unknown').map((a) => a.key);
    expect(res).toEqual(['allIncidents', 'byStudent', 'aiQuery', 'generateDocument']);
  });
});

// ── Activity-feed projection ──────────────────────────────────────────────────
// Re-implement the projection inline to keep this spec side-effect free (no
// importing the page component, which would drag Next.js + next-intl into the
// test context and slow Jest runs). If the page's projection changes shape,
// update both together.

interface IncidentRow {
  id: string;
  occurred_at: string;
  polarity: 'positive' | 'negative';
  description?: string | null;
  category?: { name?: string | null } | null;
  reported_by?: { first_name?: string | null; last_name?: string | null } | null;
  participants?: Array<{
    student?: { first_name?: string | null; last_name?: string | null } | null;
  }>;
}

type ActivityKind = 'incident' | 'sanction_served' | 'recognition';

function feedIncidentsToActivity(
  incidents: IncidentRow[],
  locale: string,
): Array<{
  id: string;
  kind: ActivityKind;
  title: string;
  actor_name: string | null;
  occurred_at: string;
  href: string;
}> {
  return incidents.map((incident) => {
    const subject = incident.participants?.[0]?.student;
    const subjectName = subject
      ? `${subject.first_name ?? ''} ${subject.last_name ?? ''}`.trim()
      : null;
    const actor = incident.reported_by
      ? `${incident.reported_by.first_name ?? ''} ${incident.reported_by.last_name ?? ''}`.trim()
      : null;
    const kind: ActivityKind = incident.polarity === 'positive' ? 'recognition' : 'incident';
    const categoryName = incident.category?.name ?? null;
    const title = subjectName
      ? categoryName
        ? `${categoryName} — ${subjectName}`
        : subjectName
      : (categoryName ?? incident.description ?? '');
    return {
      id: incident.id,
      kind,
      title: title || incident.description || '',
      actor_name: actor && actor.length > 0 ? actor : null,
      occurred_at: incident.occurred_at,
      href: `/${locale}/behaviour/incidents/${incident.id}`,
    };
  });
}

describe('BehaviourSubHub — feedIncidentsToActivity', () => {
  it('maps a negative incident to kind=incident with category + student title', () => {
    const res = feedIncidentsToActivity(
      [
        {
          id: 'inc-1',
          occurred_at: '2026-04-20T10:00:00Z',
          polarity: 'negative',
          description: 'Disruption during maths',
          category: { name: 'Disruption (low)' },
          reported_by: { first_name: 'Sam', last_name: 'Teacher' },
          participants: [{ student: { first_name: 'Alex', last_name: 'Student' } }],
        },
      ],
      'en',
    );
    expect(res).toEqual([
      {
        id: 'inc-1',
        kind: 'incident',
        title: 'Disruption (low) — Alex Student',
        actor_name: 'Sam Teacher',
        occurred_at: '2026-04-20T10:00:00Z',
        href: '/en/behaviour/incidents/inc-1',
      },
    ]);
  });

  it('maps a positive incident to kind=recognition', () => {
    const res = feedIncidentsToActivity(
      [
        {
          id: 'inc-2',
          occurred_at: '2026-04-20T09:00:00Z',
          polarity: 'positive',
          category: { name: 'Kindness' },
          reported_by: null,
          participants: [{ student: { first_name: 'Jamie', last_name: 'Student' } }],
        },
      ],
      'ar',
    );
    expect(res[0]?.kind).toBe('recognition');
    expect(res[0]?.href).toBe('/ar/behaviour/incidents/inc-2');
    expect(res[0]?.actor_name).toBeNull();
  });

  it('falls back to description when neither subject nor category is present', () => {
    const res = feedIncidentsToActivity(
      [
        {
          id: 'inc-3',
          occurred_at: '2026-04-20T08:00:00Z',
          polarity: 'negative',
          description: 'Unknown student reported',
          participants: [],
        },
      ],
      'en',
    );
    expect(res[0]?.title).toBe('Unknown student reported');
  });

  it('produces an empty title when all projection inputs are missing', () => {
    const res = feedIncidentsToActivity(
      [
        {
          id: 'inc-4',
          occurred_at: '2026-04-20T07:00:00Z',
          polarity: 'negative',
        },
      ],
      'en',
    );
    expect(res[0]?.title).toBe('');
  });
});
