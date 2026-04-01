import { randomUUID } from 'crypto';

import { PrismaClient } from '@prisma/client';

export interface TenantFixtureOptions {
  name?: string;
  slug?: string;
  domain?: string;
}

export interface TenantFixture {
  tenantId: string;
  domainName: string;
  ownerUserId: string;
  staffProfileId: string;
  studentId: string;
  householdId: string;
  academicYearId: string;
  classId: string;
  roomId: string;
}

/**
 * Deterministically creates a complete foundational sandbox for a single Tenant.
 * Used for multi-tenant isolation tests locally ensuring DB integrity sweeps
 * are safely segmented uniquely from existing Seed values or other test sweeps.
 */
export async function createTenantFixture(
  prisma: PrismaClient,
  options: TenantFixtureOptions = {},
): Promise<TenantFixture> {
  const ts = Date.now();
  const suffix = randomUUID().substring(0, 8);
  const slug = options.slug || `fixture-${ts}-${suffix}`;
  const name = options.name || `Fixture School ${suffix}`;
  const domainName = options.domain || `${slug}.test.edupod.app`;

  // 1. Create Tenant
  const tenant = await prisma.tenant.create({
    data: {
      name,
      slug,
      default_locale: 'en',
      timezone: 'Europe/Dublin',
      date_format: 'DD/MM/YYYY',
      currency_code: 'EUR',
      academic_year_start_month: 9,
    },
  });
  const tenantId = tenant.id;

  // 2. Add default Domain
  await prisma.tenantDomain.create({
    data: {
      tenant_id: tenantId,
      domain: domainName,
      domain_type: 'app',
      is_primary: true,
      verification_status: 'verified',
      ssl_status: 'active',
    },
  });

  // 3. User & Staff Profile
  const ownerUserId = randomUUID();
  await prisma.user.create({
    data: {
      id: ownerUserId,
      email: `owner-${suffix}@${domainName}`,
      password_hash: 'mock-hash',
      first_name: 'Fixture',
      last_name: 'Owner',
      global_status: 'active',
      email_verified_at: new Date(),
    },
  });

  await prisma.tenantMembership.create({
    data: {
      tenant_id: tenantId,
      user_id: ownerUserId,
      membership_status: 'active',
      joined_at: new Date(),
    },
  });

  const staff = await prisma.staffProfile.create({
    data: {
      tenant_id: tenantId,
      user_id: ownerUserId,
      staff_number: `ST-${suffix}`,
      employment_status: 'active',
      employment_type: 'full_time',
    },
  });

  // 4. Academic Year
  const year = new Date().getFullYear();
  const ay = await prisma.academicYear.create({
    data: {
      tenant_id: tenantId,
      name: `AY ${year}-${year + 1}`,
      start_date: new Date(`${year}-09-01`),
      end_date: new Date(`${year + 1}-06-30`),
      status: 'active',
    },
  });

  // 5. Class
  const cls = await prisma.class.create({
    data: {
      tenant_id: tenantId,
      academic_year_id: ay.id,
      name: 'Fixture Class',
      status: 'active',
    },
  });

  // 6. Room
  const room = await prisma.room.create({
    data: {
      tenant_id: tenantId,
      name: `Fixture Room ${suffix}`,
      room_type: 'classroom',
      capacity: 30,
      is_exclusive: false,
    },
  });

  // 7. Household
  const household = await prisma.household.create({
    data: {
      tenant_id: tenantId,
      household_name: 'Fixture Family',
      status: 'active',
    },
  });

  // 8. Student
  const student = await prisma.student.create({
    data: {
      tenant_id: tenantId,
      household_id: household.id,
      student_number: `STU-${suffix}`,
      first_name: 'Fixture',
      last_name: 'Student',
      date_of_birth: new Date('2015-01-01'),
      status: 'active',
      gender: 'other',
    },
  });

  // Enrol the student in the created class automatically
  await prisma.classEnrolment.create({
    data: {
      tenant_id: tenantId,
      class_id: cls.id,
      student_id: student.id,
      start_date: new Date(`${year}-09-01`),
      status: 'active',
    },
  });

  return {
    tenantId,
    domainName,
    ownerUserId,
    staffProfileId: staff.id,
    academicYearId: ay.id,
    classId: cls.id,
    roomId: room.id,
    householdId: household.id,
    studentId: student.id,
  };
}
