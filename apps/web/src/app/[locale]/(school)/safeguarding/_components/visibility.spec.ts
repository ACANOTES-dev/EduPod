import {
  canViewSafeguarding,
  canViewSealedRecords,
  filterSafeguardingHubCards,
  filterSafeguardingQuickActions,
  SAFEGUARDING_SEAL_VIEW_ROLES,
  SAFEGUARDING_TIER_ROLES,
} from './visibility';

describe('canViewSafeguarding', () => {
  it.each(SAFEGUARDING_TIER_ROLES)('returns true for %s', (role) => {
    expect(canViewSafeguarding([role])).toBe(true);
  });

  it('returns false for teacher', () => {
    expect(canViewSafeguarding(['teacher'])).toBe(false);
  });

  it('returns false for school_admin (generic admin is NOT dedicated safeguarding)', () => {
    expect(canViewSafeguarding(['admin'])).toBe(false);
  });

  it('returns false for parent / student / front_office', () => {
    expect(canViewSafeguarding(['parent'])).toBe(false);
    expect(canViewSafeguarding(['student'])).toBe(false);
    expect(canViewSafeguarding(['front_office'])).toBe(false);
  });

  it('returns false for empty role list', () => {
    expect(canViewSafeguarding([])).toBe(false);
  });

  it('returns true when user has any of the tier roles alongside other roles', () => {
    expect(canViewSafeguarding(['teacher', 'school_principal'])).toBe(true);
  });
});

describe('canViewSealedRecords', () => {
  it.each(SAFEGUARDING_SEAL_VIEW_ROLES)('returns true for %s', (role) => {
    expect(canViewSealedRecords([role])).toBe(true);
  });

  it('returns false for teacher', () => {
    expect(canViewSealedRecords(['teacher'])).toBe(false);
  });

  it('returns false for generic admin', () => {
    expect(canViewSealedRecords(['admin'])).toBe(false);
  });
});

describe('filterSafeguardingHubCards', () => {
  const allCards = [
    { key: 'concerns' as const },
    { key: 'sla' as const },
    { key: 'sealed' as const, roles: SAFEGUARDING_SEAL_VIEW_ROLES },
    { key: 'breakGlass' as const },
    { key: 'reviews' as const },
    { key: 'settings' as const },
  ];

  it('returns all cards for owner', () => {
    const visible = filterSafeguardingHubCards({
      roleKeys: ['school_owner'],
      cards: allCards,
    });
    expect(visible.map((c) => c.key).sort()).toEqual(
      ['breakGlass', 'concerns', 'reviews', 'sealed', 'settings', 'sla'].sort(),
    );
  });

  it('hides sealed card when user lacks seal view', () => {
    const visible = filterSafeguardingHubCards({
      roleKeys: ['admin'],
      cards: allCards,
    });
    expect(visible.map((c) => c.key)).not.toContain('sealed');
  });

  it('returns cards without role restriction when user has no roles at all', () => {
    const visible = filterSafeguardingHubCards({
      roleKeys: [],
      cards: allCards,
    });
    expect(visible.map((c) => c.key)).toEqual([
      'concerns',
      'sla',
      'breakGlass',
      'reviews',
      'settings',
    ]);
  });
});

describe('filterSafeguardingQuickActions', () => {
  const allActions = [
    { key: 'reportConcern' as const },
    { key: 'viewMyReports' as const },
    { key: 'requestBreakGlass' as const, roles: SAFEGUARDING_TIER_ROLES },
    { key: 'runAfterAction' as const, roles: SAFEGUARDING_TIER_ROLES },
  ];

  it('returns all actions for owner', () => {
    const visible = filterSafeguardingQuickActions({
      roleKeys: ['school_owner'],
      actions: allActions,
    });
    expect(visible).toHaveLength(4);
  });

  it('hides tier-restricted actions for teacher', () => {
    const visible = filterSafeguardingQuickActions({
      roleKeys: ['teacher'],
      actions: allActions,
    });
    expect(visible.map((a) => a.key)).toEqual(['reportConcern', 'viewMyReports']);
  });
});
