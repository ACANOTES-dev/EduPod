import { ADMIN_ROLES, STAFF_ROLES, type RoleKey } from '@/lib/route-roles';

import {
  VISIBLE_HUB_KEYS,
  VISIBLE_QUICK_ACTION_KEYS,
  filterHubCards,
  filterQuickActions,
} from './hub-filters';

describe('VISIBLE_HUB_KEYS', () => {
  it('covers all seven hub tiles in the documented order', () => {
    expect(VISIBLE_HUB_KEYS).toEqual([
      'behaviour',
      'pastoral',
      'safeguarding',
      'sen',
      'earlyWarnings',
      'staffWellbeing',
      'settings',
    ]);
  });
});

describe('VISIBLE_QUICK_ACTION_KEYS', () => {
  it('covers all four quick actions', () => {
    expect(VISIBLE_QUICK_ACTION_KEYS).toEqual([
      'logIncident',
      'logConcern',
      'declareCritical',
      'openCase',
    ]);
  });
});

describe('filterHubCards', () => {
  const CARDS = [
    { key: 'behaviour' as const },
    { key: 'pastoral' as const },
    { key: 'safeguarding' as const },
    { key: 'sen' as const },
    { key: 'earlyWarnings' as const },
    { key: 'staffWellbeing' as const, roles: [...STAFF_ROLES] },
    { key: 'settings' as const, roles: ADMIN_ROLES },
  ];

  it('returns every card when the user is a school owner', () => {
    const res = filterHubCards({ roleKeys: ['school_owner'] as RoleKey[], cards: CARDS });
    expect(res.map((c) => c.key)).toEqual([
      'behaviour',
      'pastoral',
      'safeguarding',
      'sen',
      'earlyWarnings',
      'staffWellbeing',
      'settings',
    ]);
  });

  it('hides the settings card for a teacher', () => {
    const res = filterHubCards({ roleKeys: ['teacher'] as RoleKey[], cards: CARDS });
    const keys = res.map((c) => c.key);
    expect(keys).toContain('staffWellbeing');
    expect(keys).toContain('sen');
    expect(keys).not.toContain('settings');
  });

  it('hides both staff-wellbeing and settings for a parent', () => {
    const res = filterHubCards({ roleKeys: ['parent'] as RoleKey[], cards: CARDS });
    const keys = res.map((c) => c.key);
    expect(keys).toEqual(['behaviour', 'pastoral', 'safeguarding', 'sen', 'earlyWarnings']);
  });

  it('keeps unrestricted cards visible when the user has no roles', () => {
    const res = filterHubCards({ roleKeys: [] as RoleKey[], cards: CARDS });
    expect(res.map((c) => c.key)).toEqual([
      'behaviour',
      'pastoral',
      'safeguarding',
      'sen',
      'earlyWarnings',
    ]);
  });
});

describe('filterQuickActions', () => {
  const ACTIONS = [
    { key: 'logIncident' as const },
    { key: 'logConcern' as const },
    { key: 'declareCritical' as const, roles: ADMIN_ROLES },
    { key: 'openCase' as const },
  ];

  it('shows every action to a principal', () => {
    const res = filterQuickActions({
      roleKeys: ['school_principal'] as RoleKey[],
      actions: ACTIONS,
    });
    expect(res.map((a) => a.key)).toEqual([
      'logIncident',
      'logConcern',
      'declareCritical',
      'openCase',
    ]);
  });

  it('hides declare-critical for a teacher', () => {
    const res = filterQuickActions({ roleKeys: ['teacher'] as RoleKey[], actions: ACTIONS });
    expect(res.map((a) => a.key)).toEqual(['logIncident', 'logConcern', 'openCase']);
  });
});
