import { hash } from 'bcryptjs';

import type { PrismaService } from '../../modules/prisma/prisma.service';

import { buildLoginEmail } from './login-email';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateSystemUserArgs {
  tenantId: string;
  /** `parent` or `student` — matches roles.role_key within the tenant. */
  roleKey: string;
  /** The tenant-unique identifier (household_number or student_number) used
   *  as both the email local part and the initial password. */
  localPart: string;
  /** Primary tenant domain (e.g., `nhqs.edupod.app`). */
  tenantDomain: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
}

export interface CreatedSystemUser {
  userId: string;
  email: string;
  membershipId: string;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Creates a system-managed User + TenantMembership + MembershipRole in a
 * single atomic group. The email is derived from {localPart}@{tenantDomain},
 * and the initial password is the localPart itself (hashed via bcrypt).
 *
 * Must be called inside an active interactive transaction. The caller is
 * responsible for wiring the returned `userId` back into the owning entity
 * (e.g., Student.user_id or Parent.user_id).
 *
 * Throws if:
 *   - The tenant does not have a role with the given role_key.
 *   - The generated email is already in use (pool/uniqueness invariant broken).
 *
 * Intended for the system-generated credentials convention:
 *   - Staff:   `{staff_number}@{tenant-domain}`    (wired directly in StaffProfilesService)
 *   - Parent:  `{household_number}@{tenant-domain}` (one shared login per household)
 *   - Student: `{student_number}@{tenant-domain}`
 */
export async function createSystemUser(
  tx: PrismaService,
  args: CreateSystemUserArgs,
): Promise<CreatedSystemUser> {
  const email = buildLoginEmail(args.localPart, args.tenantDomain);

  const role = await tx.role.findFirst({
    where: { role_key: args.roleKey, tenant_id: args.tenantId },
    select: { id: true },
  });
  if (!role) {
    throw new Error(
      `Tenant "${args.tenantId}" has no role with key "${args.roleKey}" — tenant onboarding is incomplete`,
    );
  }

  const existing = await tx.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    throw new Error(
      `createSystemUser: email "${email}" already in use — inspect tenant code pool invariant`,
    );
  }

  const passwordHash = await hash(args.localPart, 12);
  const user = await tx.user.create({
    data: {
      email,
      password_hash: passwordHash,
      first_name: args.firstName,
      last_name: args.lastName,
      phone: args.phone ?? null,
      email_verified_at: new Date(),
    },
    select: { id: true },
  });

  const membership = await tx.tenantMembership.create({
    data: {
      tenant_id: args.tenantId,
      user_id: user.id,
      membership_status: 'active',
      joined_at: new Date(),
    },
    select: { id: true },
  });

  await tx.membershipRole.create({
    data: {
      membership_id: membership.id,
      role_id: role.id,
      tenant_id: args.tenantId,
    },
  });

  return { userId: user.id, email, membershipId: membership.id };
}
