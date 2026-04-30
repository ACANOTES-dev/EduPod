import { isPathInTier2Scope, stripLocalePrefix } from '../../../i18n/tier-routes';

describe('Tier 2 route scope', () => {
  it('strips a registered locale prefix before matching', () => {
    expect(stripLocalePrefix('/it/parent/household')).toBe('/parent/household');
    expect(stripLocalePrefix('/en/finance/payroll')).toBe('/finance/payroll');
    expect(stripLocalePrefix('/unknown/finance')).toBe('/unknown/finance');
  });

  it('allows parent routes', () => {
    expect(isPathInTier2Scope('/parent/household')).toBe(true);
    expect(isPathInTier2Scope('/it/parent/sen/plan-1')).toBe(true);
    expect(isPathInTier2Scope('/it/dashboard/parent')).toBe(true);
    expect(isPathInTier2Scope('/it/homework/parent')).toBe(true);
    expect(isPathInTier2Scope('/it/engagement/parent')).toBe(true);
    expect(isPathInTier2Scope('/it/behaviour/parent-portal/appeals/new')).toBe(true);
  });

  it('allows student routes', () => {
    expect(isPathInTier2Scope('/student/dashboard')).toBe(true);
    expect(isPathInTier2Scope('/it/dashboard/student')).toBe(true);
  });

  it('allows public and profile routes', () => {
    expect(isPathInTier2Scope('/')).toBe(true);
    expect(isPathInTier2Scope('/it/login')).toBe(true);
    expect(isPathInTier2Scope('/it/register')).toBe(true);
    expect(isPathInTier2Scope('/it/contact')).toBe(true);
    expect(isPathInTier2Scope('/it/apply/nhqs')).toBe(true);
    expect(isPathInTier2Scope('/it/verify/token-123')).toBe(true);
    expect(isPathInTier2Scope('/it/profile/communication')).toBe(true);
    expect(isPathInTier2Scope('/it/wellbeing/survey')).toBe(true);
  });

  it('blocks staff, admin, regulatory, finance, and back-office routes', () => {
    expect(isPathInTier2Scope('/it/finance/payroll')).toBe(false);
    expect(isPathInTier2Scope('/it/admin/tenants')).toBe(false);
    expect(isPathInTier2Scope('/it/regulatory/des-returns')).toBe(false);
    expect(isPathInTier2Scope('/it/staff')).toBe(false);
    expect(isPathInTier2Scope('/it/settings/users')).toBe(false);
    expect(isPathInTier2Scope('/it/dashboard')).toBe(false);
    expect(isPathInTier2Scope('/it/dashboard/teacher')).toBe(false);
    expect(isPathInTier2Scope('/it/inbox/oversight')).toBe(false);
    expect(isPathInTier2Scope('/it/wellbeing/dashboard')).toBe(false);
  });

  it('defaults unknown routes to out of scope', () => {
    expect(isPathInTier2Scope('/it/some-new-back-office-route')).toBe(false);
  });
});
