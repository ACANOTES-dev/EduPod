import { createHash, randomBytes } from 'crypto';

import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CreateInvitationDto, InvitedRolePayload } from '@school/shared';
import { hash } from 'bcryptjs';
import { Queue } from 'bullmq';


import { PrismaService } from '../prisma/prisma.service';

interface RegistrationData {
  first_name?: string;
  last_name?: string;
  password?: string;
  phone?: string;
}

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('notifications') private readonly notificationsQueue: Queue,
  ) {}

  /**
   * Create an invitation to join a tenant.
   * Generates a secure token, stores the SHA-256 hash, 72-hour expiry.
   */
  async createInvitation(
    tenantId: string,
    invitedByUserId: string,
    data: CreateInvitationDto,
  ) {
    // Check for existing pending invitation for this email at this tenant
    const existingInvitation = await this.prisma.invitation.findFirst({
      where: {
        tenant_id: tenantId,
        email: data.email,
        status: 'pending',
      },
    });

    if (existingInvitation) {
      throw new BadRequestException({
        code: 'INVITATION_EXISTS',
        message: `A pending invitation already exists for "${data.email}" at this tenant`,
      });
    }

    // Check if user already has a membership at this tenant
    const existingUser = await this.prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      const existingMembership = await this.prisma.tenantMembership.findFirst({
        where: {
          tenant_id: tenantId,
          user_id: existingUser.id,
          membership_status: { in: ['active', 'suspended'] },
        },
      });

      if (existingMembership) {
        throw new BadRequestException({
          code: 'USER_ALREADY_MEMBER',
          message: `User "${data.email}" already has an active membership at this tenant`,
        });
      }
    }

    // Verify all role IDs exist and belong to this tenant
    const roles = await this.prisma.role.findMany({
      where: {
        id: { in: data.role_ids },
        OR: [{ tenant_id: tenantId }, { tenant_id: null }],
      },
    });

    if (roles.length !== data.role_ids.length) {
      throw new BadRequestException({
        code: 'ROLE_NOT_FOUND',
        message: 'One or more role IDs are invalid',
      });
    }

    // Generate secure token
    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');

    // 72-hour expiry
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 72);

    const rolePayload: InvitedRolePayload = {
      role_ids: data.role_ids,
      parent_link: data.parent_link,
    };

    const invitation = await this.prisma.invitation.create({
      data: {
        tenant_id: tenantId,
        email: data.email,
        invited_role_payload: JSON.parse(JSON.stringify(rolePayload)),
        invited_by_user_id: invitedByUserId,
        token_hash: tokenHash,
        expires_at: expiresAt,
        status: 'pending',
      },
      include: {
        invited_by: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            email: true,
          },
        },
      },
    });

    // Enqueue invitation email (non-blocking — creation succeeds even if queue fails)
    try {
      await this.notificationsQueue.add(
        'communications:send-invitation',
        {
          tenant_id: tenantId,
          invitation_id: invitation.id,
          token,
          email: data.email,
        },
        { attempts: 3, backoff: { type: 'exponential', delay: 60_000 } },
      );
    } catch {
      // Queue failure should not block invitation creation
    }

    return invitation;
  }

  /**
   * List invitations for a tenant, paginated.
   */
  async listInvitations(tenantId: string, page: number, pageSize: number) {
    const skip = (page - 1) * pageSize;

    const [invitations, total] = await Promise.all([
      this.prisma.invitation.findMany({
        where: { tenant_id: tenantId },
        skip,
        take: pageSize,
        orderBy: { created_at: 'desc' },
        include: {
          invited_by: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
              email: true,
            },
          },
        },
      }),
      this.prisma.invitation.count({
        where: { tenant_id: tenantId },
      }),
    ]);

    return {
      data: invitations,
      meta: { page, pageSize, total },
    };
  }

  /**
   * Revoke a pending invitation.
   */
  async revokeInvitation(tenantId: string, invitationId: string) {
    const invitation = await this.prisma.invitation.findFirst({
      where: {
        id: invitationId,
        tenant_id: tenantId,
      },
    });

    if (!invitation) {
      throw new NotFoundException({
        code: 'INVITATION_NOT_FOUND',
        message: `Invitation with id "${invitationId}" not found`,
      });
    }

    if (invitation.status !== 'pending') {
      throw new BadRequestException({
        code: 'INVITATION_NOT_PENDING',
        message: `Cannot revoke invitation with status "${invitation.status}"`,
      });
    }

    const updated = await this.prisma.invitation.update({
      where: { id: invitationId },
      data: { status: 'revoked' },
    });

    return updated;
  }

  /**
   * Accept an invitation.
   * - For existing users: creates membership + assigns roles.
   * - For new users: creates user, membership, assigns roles.
   */
  async acceptInvitation(token: string, registrationData?: RegistrationData) {
    // Hash the token
    const tokenHash = createHash('sha256').update(token).digest('hex');

    return this.prisma.$transaction(async (tx) => {
      // Find the invitation
      const invitation = await tx.invitation.findFirst({
        where: {
          token_hash: tokenHash,
          status: 'pending',
        },
      });

      if (!invitation) {
        throw new BadRequestException({
          code: 'INVITATION_NOT_FOUND',
          message: 'Invalid or expired invitation token',
        });
      }

      // Check expiry
      if (new Date() > invitation.expires_at) {
        // Mark as expired
        await tx.invitation.update({
          where: { id: invitation.id },
          data: { status: 'expired' },
        });

        throw new BadRequestException({
          code: 'INVITATION_EXPIRED',
          message: 'This invitation has expired',
        });
      }

      const rolePayload = invitation.invited_role_payload as unknown as InvitedRolePayload;

      // Check if user already exists
      let user = await tx.user.findUnique({
        where: { email: invitation.email },
      });

      if (user) {
        // Existing user: create membership + assign roles
        const existingMembership = await tx.tenantMembership.findFirst({
          where: {
            tenant_id: invitation.tenant_id,
            user_id: user.id,
          },
        });

        if (existingMembership) {
          // Reactivate if previously left/archived
          if (
            existingMembership.membership_status === 'archived' ||
            existingMembership.membership_status === 'disabled'
          ) {
            await tx.tenantMembership.update({
              where: { id: existingMembership.id },
              data: {
                membership_status: 'active',
                joined_at: new Date(),
              },
            });

            // Assign roles
            await this.assignRolesToMembershipTx(
              tx,
              existingMembership.id,
              invitation.tenant_id,
              rolePayload.role_ids,
            );
          } else {
            throw new BadRequestException({
              code: 'USER_ALREADY_MEMBER',
              message: 'User already has a membership at this tenant',
            });
          }
        } else {
          // Create new membership
          const membership = await tx.tenantMembership.create({
            data: {
              tenant_id: invitation.tenant_id,
              user_id: user.id,
              membership_status: 'active',
              joined_at: new Date(),
            },
          });

          // Assign roles
          await this.assignRolesToMembershipTx(
            tx,
            membership.id,
            invitation.tenant_id,
            rolePayload.role_ids,
          );
        }
      } else {
        // New user: validate registration data
        if (
          !registrationData?.first_name ||
          !registrationData?.last_name ||
          !registrationData?.password
        ) {
          throw new BadRequestException({
            code: 'REGISTRATION_DATA_REQUIRED',
            message:
              'first_name, last_name, and password are required for new users',
          });
        }

        const passwordHash = await hash(registrationData.password, 12);

        user = await tx.user.create({
          data: {
            email: invitation.email,
            password_hash: passwordHash,
            first_name: registrationData.first_name,
            last_name: registrationData.last_name,
            phone: registrationData.phone ?? null,
            email_verified_at: new Date(), // Accepted invitation verifies email
          },
        });

        // Create membership
        const membership = await tx.tenantMembership.create({
          data: {
            tenant_id: invitation.tenant_id,
            user_id: user.id,
            membership_status: 'active',
            joined_at: new Date(),
          },
        });

        // Assign roles
        await this.assignRolesToMembershipTx(
          tx,
          membership.id,
          invitation.tenant_id,
          rolePayload.role_ids,
        );
      }

      // Mark invitation as accepted
      await tx.invitation.update({
        where: { id: invitation.id },
        data: {
          status: 'accepted',
          accepted_at: new Date(),
        },
      });

      return {
        accepted: true,
        user: {
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
        },
        tenant_id: invitation.tenant_id,
      };
    });
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Assign roles to a membership using a transaction client, clearing any existing roles first.
   */
  private async assignRolesToMembershipTx(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tx: any,
    membershipId: string,
    tenantId: string,
    roleIds: string[],
  ) {
    // Delete existing
    await tx.membershipRole.deleteMany({
      where: { membership_id: membershipId },
    });

    // Create new
    if (roleIds.length > 0) {
      await tx.membershipRole.createMany({
        data: roleIds.map((roleId) => ({
          membership_id: membershipId,
          role_id: roleId,
          tenant_id: tenantId,
        })),
      });
    }
  }

}
