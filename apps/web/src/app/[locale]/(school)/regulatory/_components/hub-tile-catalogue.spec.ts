import type { RegulatoryDashboardSummary } from '@school/shared/regulatory';

import type { RoleKey } from '@/lib/route-roles';

import {
  filterTilesForRoles,
  REGULATORY_TILES,
  resolveTileCount,
  type RegulatoryTileKey,
} from './hub-tile-catalogue';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function buildSummary(): RegulatoryDashboardSummary {
  return {
    calendar: {
      upcoming_deadlines: 7,
      overdue: 2,
      next_deadline: null,
      next_deadlines: [],
    },
    tusla: {
      students_approaching_threshold: 1,
      students_exceeded_threshold: 3,
      active_alerts: 5,
    },
    des: {
      readiness_status: 'not_started',
      recent_submissions: 0,
      last_submission_at: null,
    },
    october_returns: { readiness_status: 'not_started' },
    ppod: {
      synced: 120,
      pending: 4,
      errors: 1,
      last_sync_at: null,
      health_percent: 96,
    },
    cba: {
      pending_sync: 6,
      synced: 10,
      last_sync_at: null,
    },
    transfers: { pending_count: 2 },
    submissions: { this_year_count: 11 },
    anti_bullying: { open_count: 1 },
    safeguarding: { open_count: 4 },
    gdpr: { open_dsar_count: 2 },
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('REGULATORY_TILES catalogue', () => {
  it('every tile has a valid kebab-case href rooted at /regulatory', () => {
    for (const tile of REGULATORY_TILES) {
      expect(tile.href.startsWith('/regulatory')).toBe(true);
      expect(tile.href).toMatch(/^\/regulatory(\/[a-z0-9-]+)+$/);
    }
  });

  it('every tile has at least one role permitted', () => {
    for (const tile of REGULATORY_TILES) {
      expect(tile.roles.length).toBeGreaterThan(0);
    }
  });

  it('tile keys are unique', () => {
    const keys = REGULATORY_TILES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('includes all eleven required tiles', () => {
    const expectedKeys: RegulatoryTileKey[] = [
      'tusla',
      'ppod',
      'desReturns',
      'octoberReturns',
      'cba',
      'transfers',
      'calendar',
      'submissions',
      'antiBullying',
      'safeguarding',
      'gdpr',
    ];
    const keys = REGULATORY_TILES.map((t) => t.key);
    for (const key of expectedKeys) {
      expect(keys).toContain(key);
    }
  });
});

describe('resolveTileCount', () => {
  it('returns undefined when summary is null', () => {
    for (const tile of REGULATORY_TILES) {
      expect(resolveTileCount(tile.key, null)).toBeUndefined();
    }
  });

  it('returns correct counts for each tile', () => {
    const summary = buildSummary();
    expect(resolveTileCount('tusla', summary)).toBe(5);
    expect(resolveTileCount('ppod', summary)).toBe(4);
    expect(resolveTileCount('cba', summary)).toBe(6);
    expect(resolveTileCount('transfers', summary)).toBe(2);
    expect(resolveTileCount('calendar', summary)).toBe(7);
    expect(resolveTileCount('submissions', summary)).toBe(11);
    expect(resolveTileCount('antiBullying', summary)).toBe(1);
    expect(resolveTileCount('safeguarding', summary)).toBe(4);
    expect(resolveTileCount('gdpr', summary)).toBe(2);
    // DES Returns + October Returns have no meaningful count badge
    expect(resolveTileCount('desReturns', summary)).toBeUndefined();
    expect(resolveTileCount('octoberReturns', summary)).toBeUndefined();
  });
});

describe('filterTilesForRoles', () => {
  it('returns only tiles allowed for a teacher', () => {
    const teacherRoles: RoleKey[] = ['teacher'];
    const visible = filterTilesForRoles(REGULATORY_TILES, teacherRoles);
    const keys = visible.map((t) => t.key);
    // Teacher is in STAFF_ROLES → sees tusla/calendar/submissions
    expect(keys).toContain('tusla');
    expect(keys).toContain('calendar');
    expect(keys).toContain('submissions');
    // Admin-only tiles are hidden
    expect(keys).not.toContain('ppod');
    expect(keys).not.toContain('desReturns');
    expect(keys).not.toContain('gdpr');
  });

  it('returns all tiles for a principal', () => {
    const principalRoles: RoleKey[] = ['school_principal'];
    const visible = filterTilesForRoles(REGULATORY_TILES, principalRoles);
    expect(visible).toHaveLength(REGULATORY_TILES.length);
  });

  it('returns no tiles for a parent', () => {
    const parentRoles: RoleKey[] = ['parent'];
    const visible = filterTilesForRoles(REGULATORY_TILES, parentRoles);
    expect(visible).toEqual([]);
  });
});
