import type { MessagingRole } from './constants';

/**
 * The default tenant messaging policy matrix shipped with every new tenant.
 *
 * Read as: `DEFAULT_MESSAGING_POLICY_MATRIX[senderRole][recipientRole] = allowed`.
 *
 * The matching DB-side definition lives in `packages/prisma/src/inbox-defaults.ts`
 * (which is what actually seeds the `tenant_messaging_policy` table). This
 * file is the frontend-facing mirror — the messaging policy settings page
 * imports it to pre-populate the grid on tenants that haven't customised it.
 *
 * If you change one, change the other.
 */
export const DEFAULT_MESSAGING_POLICY_MATRIX: Record<
  MessagingRole,
  Record<MessagingRole, boolean>
> = {
  owner: {
    owner: true,
    principal: true,
    vice_principal: true,
    office: true,
    finance: true,
    nurse: true,
    teacher: true,
    parent: true,
    student: true,
  },
  principal: {
    owner: true,
    principal: true,
    vice_principal: true,
    office: true,
    finance: true,
    nurse: true,
    teacher: true,
    parent: true,
    student: true,
  },
  vice_principal: {
    owner: true,
    principal: true,
    vice_principal: true,
    office: true,
    finance: true,
    nurse: true,
    teacher: true,
    parent: true,
    student: true,
  },
  office: {
    owner: true,
    principal: true,
    vice_principal: true,
    office: true,
    finance: true,
    nurse: true,
    teacher: true,
    parent: true,
    student: false,
  },
  finance: {
    owner: true,
    principal: true,
    vice_principal: true,
    office: true,
    finance: true,
    nurse: false,
    teacher: true,
    parent: true,
    student: false,
  },
  nurse: {
    owner: true,
    principal: true,
    vice_principal: true,
    office: true,
    finance: false,
    nurse: true,
    teacher: true,
    parent: true,
    student: false,
  },
  teacher: {
    owner: true,
    principal: true,
    vice_principal: true,
    office: true,
    finance: true,
    nurse: true,
    teacher: true,
    parent: true,
    student: true,
  },
  parent: {
    owner: false,
    principal: false,
    vice_principal: false,
    office: false,
    finance: false,
    nurse: false,
    teacher: false,
    parent: false,
    student: false,
  },
  student: {
    owner: false,
    principal: false,
    vice_principal: false,
    office: false,
    finance: false,
    nurse: false,
    teacher: false,
    parent: false,
    student: false,
  },
};
