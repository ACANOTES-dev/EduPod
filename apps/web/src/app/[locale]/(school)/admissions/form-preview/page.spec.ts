/**
 * Pure-logic tests for the admissions form-preview page.
 *
 * The page is a client-only React component — mounting it requires Next
 * navigation, qrcode.react canvas, and a live auth provider. Following the
 * repo convention (see `components/hover-preview-card.spec.ts`,
 * `components/require-role.spec.ts`) we only unit-test the pure helpers
 * exported from the page module.
 */

import { canManageForm } from './form-preview-helpers';

describe('AdmissionsFormPreviewPage — canManageForm', () => {
  afterEach(() => jest.clearAllMocks());

  it('allows school_owner to manage the form', () => {
    expect(canManageForm(['school_owner'])).toBe(true);
  });

  it('allows school_principal to manage the form', () => {
    expect(canManageForm(['school_principal'])).toBe(true);
  });

  it('allows admin to manage the form', () => {
    expect(canManageForm(['admin'])).toBe(true);
  });

  it('denies front_office from managing the form', () => {
    expect(canManageForm(['front_office'])).toBe(false);
  });

  it('denies teacher from managing the form', () => {
    expect(canManageForm(['teacher'])).toBe(false);
  });

  it('denies parent from managing the form', () => {
    expect(canManageForm(['parent'])).toBe(false);
  });

  it('denies empty role list', () => {
    expect(canManageForm([])).toBe(false);
  });

  it('allows a user with multiple roles where one is admin', () => {
    expect(canManageForm(['teacher', 'admin'])).toBe(true);
  });

  it('denies a user whose roles are all below admin', () => {
    expect(canManageForm(['teacher', 'parent', 'front_office'])).toBe(false);
  });
});
