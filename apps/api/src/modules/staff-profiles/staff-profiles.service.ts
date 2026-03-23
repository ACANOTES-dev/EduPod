import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CreateStaffProfileDto,
  PreviewResponse,
  StaffProfileQueryDto,
  UpdateStaffProfileDto,
} from '@school/shared';
import { hash } from 'bcryptjs';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { EncryptionService } from '../configuration/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { SequenceService } from '../tenants/sequence.service';

// ─── Local types for include results ─────────────────────────────────────────

export interface UserSummary {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

export interface StaffProfileWithUser {
  id: string;
  tenant_id: string;
  user_id: string;
  staff_number: string | null;
  job_title: string | null;
  employment_status: string;
  department: string | null;
  employment_type: string;
  bank_name: string | null;
  bank_account_number_encrypted: string | null;
  bank_iban_encrypted: string | null;
  bank_encryption_key_ref: string | null;
  created_at: Date;
  updated_at: Date;
  user: UserSummary;
}

interface ClassEntitySummary {
  id: string;
  name: string;
  academic_year: { name: string };
  subject: { name: string } | null;
}

interface ClassStaffEntry {
  class_id: string;
  staff_profile_id: string;
  assignment_role: string;
  class_entity: ClassEntitySummary;
}

interface StaffProfileDetail extends StaffProfileWithUser {
  class_staff: ClassStaffEntry[];
}

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class StaffProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly encryptionService: EncryptionService,
    private readonly sequenceService: SequenceService,
  ) {}

  /**
   * Generate a random staff number in format: ABC1234-5
   * (3 uppercase letters + 4 digits + hyphen + 1 digit)
   */
  private generateStaffNumber(): string {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const letterPart = Array.from(
      { length: 3 },
      () => letters[Math.floor(Math.random() * 26)],
    ).join('');
    const numberPart = String(Math.floor(Math.random() * 10000)).padStart(
      4,
      '0',
    );
    const lastDigit = Math.floor(Math.random() * 10);
    return `${letterPart}${numberPart}-${lastDigit}`;
  }

  /**
   * Create a new staff profile, user account, membership, and role assignment.
   * The staff number is auto-generated and used as the initial password.
   */
  async create(tenantId: string, dto: CreateStaffProfileDto) {
    // Encrypt bank details if provided
    let bankAccountNumberEncrypted: string | null = null;
    let bankIbanEncrypted: string | null = null;
    let bankEncryptionKeyRef: string | null = null;

    if (dto.bank_account_number) {
      const result = this.encryptionService.encrypt(dto.bank_account_number);
      bankAccountNumberEncrypted = result.encrypted;
      bankEncryptionKeyRef = result.keyRef;
    }

    if (dto.bank_iban) {
      const result = this.encryptionService.encrypt(dto.bank_iban);
      bankIbanEncrypted = result.encrypted;
      bankEncryptionKeyRef = bankEncryptionKeyRef ?? result.keyRef;
    }

    // Generate unique staff number (retry on collision)
    let staffNumber = this.generateStaffNumber();

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    try {
      const profile = (await prismaWithRls.$transaction(async (tx) => {
        const db = tx as unknown as PrismaService;

        // Ensure staff number is unique within this tenant
        for (let attempt = 0; attempt < 5; attempt++) {
          const existing = await db.staffProfile.findFirst({
            where: { tenant_id: tenantId, staff_number: staffNumber },
            select: { id: true },
          });
          if (!existing) break;
          staffNumber = this.generateStaffNumber();
        }

        // Hash the staff number as the initial password
        const passwordHash = await hash(staffNumber, 12);

        // Check if user with this email already exists
        const existingUser = await db.user.findUnique({
          where: { email: dto.email.toLowerCase() },
          select: { id: true },
        });

        let userId: string;

        if (existingUser) {
          // User exists — check they don't already have a staff profile here
          const existingProfile = await db.staffProfile.findFirst({
            where: { tenant_id: tenantId, user_id: existingUser.id },
            select: { id: true },
          });
          if (existingProfile) {
            throw new ConflictException({
              code: 'STAFF_PROFILE_EXISTS',
              message:
                'A staff profile already exists for this email in this school',
            });
          }

          userId = existingUser.id;

          // Ensure they have an active membership in this tenant
          const existingMembership = await db.tenantMembership.findUnique({
            where: {
              idx_tenant_memberships_tenant_user: {
                tenant_id: tenantId,
                user_id: userId,
              },
            },
            select: { id: true },
          });

          if (!existingMembership) {
            const membership = await db.tenantMembership.create({
              data: {
                tenant_id: tenantId,
                user_id: userId,
                membership_status: 'active',
                joined_at: new Date(),
              },
            });

            await db.membershipRole.create({
              data: {
                membership_id: membership.id,
                role_id: dto.role_id,
                tenant_id: tenantId,
              },
            });
          }
        } else {
          // Create new user account with staff number as password
          const newUser = await db.user.create({
            data: {
              email: dto.email.toLowerCase(),
              password_hash: passwordHash,
              first_name: dto.first_name,
              last_name: dto.last_name,
              phone: dto.phone ?? null,
              email_verified_at: new Date(),
            },
          });

          userId = newUser.id;

          // Create tenant membership
          const membership = await db.tenantMembership.create({
            data: {
              tenant_id: tenantId,
              user_id: userId,
              membership_status: 'active',
              joined_at: new Date(),
            },
          });

          // Assign role
          await db.membershipRole.create({
            data: {
              membership_id: membership.id,
              role_id: dto.role_id,
              tenant_id: tenantId,
            },
          });
        }

        return db.staffProfile.create({
          data: {
            tenant_id: tenantId,
            user_id: userId,
            staff_number: staffNumber,
            job_title: dto.job_title ?? null,
            employment_status: dto.employment_status ?? 'active',
            department: dto.department ?? null,
            employment_type: dto.employment_type ?? 'full_time',
            bank_name: dto.bank_name ?? null,
            bank_account_number_encrypted: bankAccountNumberEncrypted,
            bank_iban_encrypted: bankIbanEncrypted,
            bank_encryption_key_ref: bankEncryptionKeyRef,
          },
          include: {
            user: {
              select: {
                id: true,
                first_name: true,
                last_name: true,
                email: true,
              },
            },
          },
        });
      })) as StaffProfileWithUser;

      return this.maskBankDetails(profile);
    } catch (err: unknown) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'STAFF_PROFILE_EXISTS',
          message:
            'A staff profile already exists for this user in this tenant',
        });
      }
      throw err;
    }
  }

  /**
   * List staff profiles with pagination and optional filters.
   */
  async findAll(tenantId: string, query: StaffProfileQueryDto) {
    const { page, pageSize, employment_status, department, search } = query;
    const skip = (page - 1) * pageSize;

    const where: Prisma.StaffProfileWhereInput = { tenant_id: tenantId };

    if (employment_status) {
      where.employment_status = employment_status;
    }

    if (department) {
      where.department = department;
    }

    if (search) {
      where.user = {
        OR: [
          { first_name: { contains: search, mode: 'insensitive' } },
          { last_name: { contains: search, mode: 'insensitive' } },
        ],
      };
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const result = (await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return Promise.all([
        db.staffProfile.findMany({
          where,
          skip,
          take: pageSize,
          include: {
            user: {
              select: {
                id: true,
                first_name: true,
                last_name: true,
                email: true,
              },
            },
          },
          orderBy: { created_at: 'desc' },
        }),
        db.staffProfile.count({ where }),
      ]);
    })) as [StaffProfileWithUser[], number];

    const [profiles, total] = result;

    return {
      data: profiles.map((p) => this.maskBankDetails(p)),
      meta: {
        page,
        pageSize,
        total,
      },
    };
  }

  /**
   * Get a single staff profile with user info and class assignments.
   */
  async findOne(tenantId: string, id: string) {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const profile = (await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.staffProfile.findFirst({
        where: { id, tenant_id: tenantId },
        include: {
          user: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
              email: true,
            },
          },
          class_staff: {
            include: {
              class_entity: {
                select: {
                  id: true,
                  name: true,
                  academic_year: {
                    select: { name: true },
                  },
                  subject: {
                    select: { name: true },
                  },
                },
              },
            },
          },
        },
      });
    })) as StaffProfileDetail | null;

    if (!profile) {
      throw new NotFoundException({
        code: 'STAFF_PROFILE_NOT_FOUND',
        message: `Staff profile with id "${id}" not found`,
      });
    }

    const classAssignments = profile.class_staff.map((cs) => ({
      class_id: cs.class_id,
      class_name: cs.class_entity.name,
      subject_name: cs.class_entity.subject?.name ?? null,
      academic_year_name: cs.class_entity.academic_year.name,
      assignment_role: cs.assignment_role,
    }));

    const { class_staff: _cs, ...profileWithoutClassStaff } =
      this.maskBankDetails(profile);

    return {
      ...profileWithoutClassStaff,
      user_first_name: profile.user.first_name,
      user_last_name: profile.user.last_name,
      user_email: profile.user.email,
      class_assignments: classAssignments,
    };
  }

  /**
   * Update a staff profile. Re-encrypts bank fields if changed.
   */
  async update(tenantId: string, id: string, dto: UpdateStaffProfileDto) {
    // Verify profile exists (direct query without RLS — tenant_id filter ensures isolation)
    const existing = await this.prisma.staffProfile.findFirst({
      where: { id, tenant_id: tenantId },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException({
        code: 'STAFF_PROFILE_NOT_FOUND',
        message: `Staff profile with id "${id}" not found`,
      });
    }

    // Prepare bank encryption updates
    const bankUpdates: Record<string, string | null> = {};

    if ('bank_account_number' in dto) {
      if (dto.bank_account_number) {
        const result = this.encryptionService.encrypt(dto.bank_account_number);
        bankUpdates.bank_account_number_encrypted = result.encrypted;
        bankUpdates.bank_encryption_key_ref = result.keyRef;
      } else {
        bankUpdates.bank_account_number_encrypted = null;
      }
    }

    if ('bank_iban' in dto) {
      if (dto.bank_iban) {
        const result = this.encryptionService.encrypt(dto.bank_iban);
        bankUpdates.bank_iban_encrypted = result.encrypted;
        if (!bankUpdates.bank_encryption_key_ref) {
          bankUpdates.bank_encryption_key_ref = result.keyRef;
        }
      } else {
        bankUpdates.bank_iban_encrypted = null;
      }
    }

    // Build update data, omitting raw bank fields (replaced by encrypted versions)
    const {
      bank_account_number: _ban,
      bank_iban: _bi,
      ...profileFields
    } = dto;

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const updated = (await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.staffProfile.update({
        where: { id },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: { ...profileFields, ...bankUpdates } as any,
        include: {
          user: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
              email: true,
            },
          },
        },
      });
    })) as StaffProfileWithUser;

    // Invalidate preview cache
    await this.redis.getClient().del(`preview:staff:${id}`);

    return this.maskBankDetails(updated);
  }

  /**
   * Return masked bank details (last 4 chars + bank name) for a profile.
   * Requires payroll.view_bank_details permission — enforced at controller layer.
   */
  async getBankDetails(tenantId: string, id: string) {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const profile = (await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.staffProfile.findFirst({
        where: { id, tenant_id: tenantId },
        select: {
          id: true,
          bank_name: true,
          bank_account_number_encrypted: true,
          bank_iban_encrypted: true,
          bank_encryption_key_ref: true,
        },
      });
    })) as {
      id: string;
      bank_name: string | null;
      bank_account_number_encrypted: string | null;
      bank_iban_encrypted: string | null;
      bank_encryption_key_ref: string | null;
    } | null;

    if (!profile) {
      throw new NotFoundException({
        code: 'STAFF_PROFILE_NOT_FOUND',
        message: `Staff profile with id "${id}" not found`,
      });
    }

    let bankAccountMasked: string | null = null;
    let bankIbanMasked: string | null = null;

    if (
      profile.bank_account_number_encrypted &&
      profile.bank_encryption_key_ref
    ) {
      const decrypted = this.encryptionService.decrypt(
        profile.bank_account_number_encrypted,
        profile.bank_encryption_key_ref,
      );
      bankAccountMasked = this.encryptionService.mask(decrypted);
    }

    if (profile.bank_iban_encrypted && profile.bank_encryption_key_ref) {
      const decrypted = this.encryptionService.decrypt(
        profile.bank_iban_encrypted,
        profile.bank_encryption_key_ref,
      );
      bankIbanMasked = this.encryptionService.mask(decrypted);
    }

    return {
      id: profile.id,
      bank_name: profile.bank_name,
      bank_account_number_masked: bankAccountMasked,
      bank_iban_masked: bankIbanMasked,
    };
  }

  /**
   * Return lightweight preview data for a staff profile, cached in Redis for 30s.
   */
  async preview(tenantId: string, id: string): Promise<PreviewResponse> {
    const cacheKey = `preview:staff:${id}`;
    const redisClient = this.redis.getClient();

    const cached = await redisClient.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as PreviewResponse;
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const profile = (await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.staffProfile.findFirst({
        where: { id, tenant_id: tenantId },
        select: {
          id: true,
          employment_status: true,
          job_title: true,
          department: true,
          employment_type: true,
          staff_number: true,
          user: {
            select: {
              first_name: true,
              last_name: true,
              email: true,
            },
          },
        },
      });
    })) as {
      id: string;
      employment_status: string;
      job_title: string | null;
      department: string | null;
      employment_type: string;
      staff_number: string | null;
      user: { first_name: string; last_name: string; email: string };
    } | null;

    if (!profile) {
      throw new NotFoundException({
        code: 'STAFF_PROFILE_NOT_FOUND',
        message: `Staff profile with id "${id}" not found`,
      });
    }

    const fullName =
      `${profile.user.first_name} ${profile.user.last_name}`.trim();

    const facts: { label: string; value: string }[] = [
      { label: 'Email', value: profile.user.email },
    ];

    if (profile.employment_type) {
      facts.push({
        label: 'Employment Type',
        value: profile.employment_type.replace(/_/g, ' '),
      });
    }

    if (profile.staff_number) {
      facts.push({ label: 'Staff Number', value: profile.staff_number });
    }

    const previewData: PreviewResponse = {
      id: profile.id,
      entity_type: 'staff',
      primary_label: fullName,
      secondary_label: profile.job_title ?? profile.department ?? '',
      status: profile.employment_status,
      facts,
    };

    await redisClient.set(cacheKey, JSON.stringify(previewData), 'EX', 30);

    return previewData;
  }

  /**
   * Strip raw encrypted bank fields from a profile response and add masked indicators.
   */
  private maskBankDetails<
    T extends {
      bank_account_number_encrypted?: string | null;
      bank_iban_encrypted?: string | null;
      bank_encryption_key_ref?: string | null;
    },
  >(
    profile: T,
  ): Omit<
    T,
    | 'bank_account_number_encrypted'
    | 'bank_iban_encrypted'
    | 'bank_encryption_key_ref'
  > & {
    bank_account_last4: string | null;
    bank_iban_last4: string | null;
  } {
    const {
      bank_account_number_encrypted,
      bank_iban_encrypted,
      bank_encryption_key_ref: _keyRef,
      ...rest
    } = profile;

    return {
      ...rest,
      bank_account_last4: bank_account_number_encrypted ? '****' : null,
      bank_iban_last4: bank_iban_encrypted ? '****' : null,
    };
  }
}
