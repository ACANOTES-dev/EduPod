/**
 * QA seed data for the MDAD tenant — 750 students, ~65 staff, ~964 parents.
 *
 * Exports 3 functions that create the core data in dependency order:
 *   1. seedFoundation — academic year, periods, year groups, subjects, rooms
 *   2. seedPeople     — users, memberships, staff profiles, households, parents, students
 *   3. seedClasses    — homeroom + subject classes, staff assignments, enrolments
 */

import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

import {
  type FoundationResult,
  type PeopleResult,
  type ClassesResult,
  type StaffInfo,
  type HouseholdInfo,
  type StudentInfo,
  type ClassInfo,
  YEAR_GROUP_NAMES,
  SECTION_LETTERS,
  STUDENTS_PER_SECTION,
  SUBJECT_DEFS,
  ROOM_DEFS,
  SUBJECTS_BY_YEAR,
  Y5_Y6_CORE,
  Y5_Y6_ELECTIVES,
  Y5_Y6_ELECTIVE_PICK,
} from './types';

import {
  pickMaleName,
  pickFemaleName,
  pickFamilyName,
  makeEmail,
  TEACHER_DEFS,
  SUPPORT_STAFF_DEFS,
  FAMILY_NAMES,
  MALE_FIRST_NAMES,
  FEMALE_FIRST_NAMES,
} from './names';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Batch an array into chunks of a given size. */
function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

/** Dubai-style phone number generator. */
function makePhone(index: number): string {
  const base = 501000000 + index;
  return `+971${base}`;
}

/** Dubai-area postal code. */
function makePostalCode(index: number): string {
  return String(10000 + (index % 90000)).padStart(5, '0');
}

// ═══════════════════════════════════════════════════════════════════════════════
// Function 1: seedFoundation
// ═══════════════════════════════════════════════════════════════════════════════

export async function seedFoundation(
  prisma: PrismaClient,
  tenantId: string,
): Promise<FoundationResult> {
  console.log('  [Foundation] Creating academic year...');

  // ── Academic Year ──────────────────────────────────────────────────────────
  const academicYearId = crypto.randomUUID();
  await prisma.academicYear.create({
    data: {
      id: academicYearId,
      tenant_id: tenantId,
      name: '2025-2026',
      start_date: new Date('2025-09-01'),
      end_date: new Date('2026-06-30'),
      status: 'active' as never,
    },
  });

  // ── Academic Periods ───────────────────────────────────────────────────────
  console.log('  [Foundation] Creating academic periods...');
  const periodDefs = [
    { name: 'Term 1', start: '2025-09-01', end: '2025-12-19', status: 'closed' as never },
    { name: 'Term 2', start: '2026-01-06', end: '2026-03-20', status: 'active' as never },
    { name: 'Term 3', start: '2026-03-30', end: '2026-06-30', status: 'planned' as never },
  ];
  const periodIds: string[] = [];
  for (const pd of periodDefs) {
    const id = crypto.randomUUID();
    periodIds.push(id);
    await prisma.academicPeriod.create({
      data: {
        id,
        tenant_id: tenantId,
        academic_year_id: academicYearId,
        name: pd.name,
        period_type: 'term' as never,
        start_date: new Date(pd.start),
        end_date: new Date(pd.end),
        status: pd.status,
      },
    });
  }

  // ── Year Groups (with next_year_group_id chain) ────────────────────────────
  console.log('  [Foundation] Creating year groups...');
  const yearGroupIds: string[] = YEAR_GROUP_NAMES.map(() => crypto.randomUUID());
  const yearGroupMap = new Map<string, string>();

  // Create them without chain first
  for (let i = 0; i < YEAR_GROUP_NAMES.length; i++) {
    await prisma.yearGroup.create({
      data: {
        id: yearGroupIds[i]!,
        tenant_id: tenantId,
        name: YEAR_GROUP_NAMES[i]!,
        display_order: i + 1,
        next_year_group_id: null,
      },
    });
    yearGroupMap.set(YEAR_GROUP_NAMES[i]!, yearGroupIds[i]!);
  }

  // Now set next_year_group_id chain: Y1->Y2->...->Y5->null, Y6 stays null
  for (let i = 0; i < YEAR_GROUP_NAMES.length - 1; i++) {
    await prisma.yearGroup.update({
      where: { id: yearGroupIds[i]! },
      data: { next_year_group_id: yearGroupIds[i + 1]! },
    });
  }

  // ── Subjects ───────────────────────────────────────────────────────────────
  console.log('  [Foundation] Creating subjects...');
  const subjectIds: string[] = [];
  const subjectMap = new Map<string, string>();
  const subjectData = SUBJECT_DEFS.map((s) => {
    const id = crypto.randomUUID();
    subjectIds.push(id);
    subjectMap.set(s.code, id);
    return {
      id,
      tenant_id: tenantId,
      name: s.name,
      code: s.code,
      subject_type: s.type as never,
      active: true,
    };
  });
  await prisma.subject.createMany({ data: subjectData, skipDuplicates: true });

  // ── Rooms ──────────────────────────────────────────────────────────────────
  console.log('  [Foundation] Creating rooms...');
  const roomIds: string[] = [];
  const roomMap = new Map<string, string>();
  const roomData = ROOM_DEFS.map((r) => {
    const id = crypto.randomUUID();
    roomIds.push(id);
    roomMap.set(r.name, id);
    return {
      id,
      tenant_id: tenantId,
      name: r.name,
      room_type: r.room_type as never,
      capacity: r.capacity,
      is_exclusive: r.is_exclusive,
      active: true,
    };
  });
  await prisma.room.createMany({ data: roomData, skipDuplicates: true });

  console.log(
    `  [Foundation] Done: 1 year, ${periodIds.length} periods, ${yearGroupIds.length} year groups, ` +
      `${subjectIds.length} subjects, ${roomIds.length} rooms`,
  );

  return {
    academicYearId,
    periodIds,
    yearGroupIds,
    yearGroupMap,
    subjectIds,
    subjectMap,
    roomIds,
    roomMap,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Function 2: seedPeople
// ═══════════════════════════════════════════════════════════════════════════════

export async function seedPeople(
  prisma: PrismaClient,
  tenantId: string,
  foundation: FoundationResult,
  passwordHash: string,
): Promise<PeopleResult> {
  // ── A) Look up existing users created by dev-data seed ─────────────────────
  console.log('  [People] Looking up existing users...');

  const ownerUser = await prisma.user.findUniqueOrThrow({ where: { email: 'owner@mdad.test' } });
  const adminUser = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@mdad.test' } });
  const teacherUser = await prisma.user.findUniqueOrThrow({ where: { email: 'teacher@mdad.test' } });
  const parentUser = await prisma.user.findUniqueOrThrow({ where: { email: 'parent@mdad.test' } });

  const ownerMembership = await prisma.tenantMembership.findUniqueOrThrow({
    where: { idx_tenant_memberships_tenant_user: { tenant_id: tenantId, user_id: ownerUser.id } },
  });
  const adminMembership = await prisma.tenantMembership.findUniqueOrThrow({
    where: { idx_tenant_memberships_tenant_user: { tenant_id: tenantId, user_id: adminUser.id } },
  });
  const teacherMembership = await prisma.tenantMembership.findUniqueOrThrow({
    where: { idx_tenant_memberships_tenant_user: { tenant_id: tenantId, user_id: teacherUser.id } },
  });

  // Find roles we need
  const teacherRole = await prisma.role.findFirstOrThrow({
    where: { tenant_id: tenantId, role_key: 'teacher' },
  });
  const schoolAdminRole = await prisma.role.findFirstOrThrow({
    where: { tenant_id: tenantId, role_key: 'school_admin' },
  });
  const parentRole = await prisma.role.findFirstOrThrow({
    where: { tenant_id: tenantId, role_key: 'parent' },
  });

  // Attempt to find optional roles — they may or may not exist
  const financeRole = await prisma.role.findFirst({
    where: { tenant_id: tenantId, role_key: 'finance_staff' },
  });
  const admissionsRole = await prisma.role.findFirst({
    where: { tenant_id: tenantId, role_key: 'admissions_staff' },
  });

  // ── B) Create ~47 new teacher users + memberships + role assignments ───────
  console.log('  [People] Creating teacher users...');

  const allStaff: StaffInfo[] = [];
  const teachersBySubject = new Map<string, string[]>();
  const allTeacherStaffIds: string[] = [];

  // Pre-generate all teacher data
  const newTeacherUsers: Array<{
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    def: (typeof TEACHER_DEFS)[number];
  }> = [];

  let teacherMaleIdx = 0;
  let teacherFemaleIdx = 0;

  for (let i = 0; i < TEACHER_DEFS.length; i++) {
    const def = TEACHER_DEFS[i]!;
    const isMale = i % 5 !== 3 && i % 5 !== 4; // ~60% male
    const firstName = isMale ? pickMaleName(teacherMaleIdx++) : pickFemaleName(teacherFemaleIdx++);
    const lastName = pickFamilyName(i + 10); // offset to avoid collision with existing staff names
    const email = makeEmail(firstName, lastName, i + 1, 'mdad.test');
    const id = crypto.randomUUID();

    newTeacherUsers.push({ id, email, firstName, lastName, def });
  }

  // Bulk create users
  await prisma.user.createMany({
    data: newTeacherUsers.map((t) => ({
      id: t.id,
      email: t.email,
      password_hash: passwordHash,
      first_name: t.firstName,
      last_name: t.lastName,
      preferred_locale: 'ar',
      global_status: 'active' as never,
      email_verified_at: new Date(),
    })),
    skipDuplicates: true,
  });

  // Bulk create memberships
  const teacherMemberships = newTeacherUsers.map((t) => ({
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    user_id: t.id,
    membership_status: 'active' as never,
    joined_at: new Date(),
  }));
  await prisma.tenantMembership.createMany({
    data: teacherMemberships,
    skipDuplicates: true,
  });

  // Bulk create membership roles
  await prisma.membershipRole.createMany({
    data: teacherMemberships.map((m) => ({
      membership_id: m.id,
      role_id: teacherRole.id,
      tenant_id: tenantId,
    })),
    skipDuplicates: true,
  });

  // ── C) Create ~15 support staff users + memberships + role assignments ─────
  console.log('  [People] Creating support staff users...');

  const newSupportUsers: Array<{
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    def: (typeof SUPPORT_STAFF_DEFS)[number];
  }> = [];

  let supportMaleIdx = 50; // offset from teacher names
  let supportFemaleIdx = 50;

  for (let i = 0; i < SUPPORT_STAFF_DEFS.length; i++) {
    const def = SUPPORT_STAFF_DEFS[i]!;
    const isMale = i % 3 !== 2; // ~67% male for support staff
    const firstName = isMale ? pickMaleName(supportMaleIdx++) : pickFemaleName(supportFemaleIdx++);
    const lastName = pickFamilyName(i + 80); // offset to avoid collisions
    const email = makeEmail(firstName, lastName, i + 1, 'mdad.test');
    const id = crypto.randomUUID();

    newSupportUsers.push({ id, email, firstName, lastName, def });
  }

  await prisma.user.createMany({
    data: newSupportUsers.map((s) => ({
      id: s.id,
      email: s.email,
      password_hash: passwordHash,
      first_name: s.firstName,
      last_name: s.lastName,
      preferred_locale: 'ar',
      global_status: 'active' as never,
      email_verified_at: new Date(),
    })),
    skipDuplicates: true,
  });

  const supportMemberships = newSupportUsers.map((s) => ({
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    user_id: s.id,
    membership_status: 'active' as never,
    joined_at: new Date(),
  }));
  await prisma.tenantMembership.createMany({
    data: supportMemberships,
    skipDuplicates: true,
  });

  // Assign roles per support staff
  const supportMembershipRoles: Array<{
    membership_id: string;
    role_id: string;
    tenant_id: string;
  }> = [];
  for (let i = 0; i < newSupportUsers.length; i++) {
    const def = newSupportUsers[i]!.def;
    const membershipId = supportMemberships[i]!.id;
    let roleId = schoolAdminRole.id;

    if (def.roleKey === 'finance_staff' && financeRole) {
      roleId = financeRole.id;
    } else if (def.roleKey === 'admissions_staff' && admissionsRole) {
      roleId = admissionsRole.id;
    }

    supportMembershipRoles.push({
      membership_id: membershipId,
      role_id: roleId,
      tenant_id: tenantId,
    });
  }
  await prisma.membershipRole.createMany({
    data: supportMembershipRoles,
    skipDuplicates: true,
  });

  // ── D) Create StaffProfiles for ALL staff ──────────────────────────────────
  console.log('  [People] Creating staff profiles...');

  const staffProfileData: Array<{
    id: string;
    tenant_id: string;
    user_id: string;
    staff_number: string;
    job_title: string;
    department: string;
    employment_status: never;
    employment_type: never;
    bank_name: null;
  }> = [];

  // Owner (Abdullah Al-Farsi) — Principal
  const ownerStaffProfileId = crypto.randomUUID();
  staffProfileData.push({
    id: ownerStaffProfileId,
    tenant_id: tenantId,
    user_id: ownerUser.id,
    staff_number: 'MDAD-A-001',
    job_title: 'Principal',
    department: 'Leadership',
    employment_status: 'active' as never,
    employment_type: 'full_time' as never,
    bank_name: null,
  });

  // Admin (Maryam Al-Sayed) — Office Administrator
  const adminStaffProfileId = crypto.randomUUID();
  staffProfileData.push({
    id: adminStaffProfileId,
    tenant_id: tenantId,
    user_id: adminUser.id,
    staff_number: 'MDAD-A-002',
    job_title: 'Office Administrator',
    department: 'Administration',
    employment_status: 'active' as never,
    employment_type: 'full_time' as never,
    bank_name: null,
  });

  // Existing teacher (Ibrahim Nasser) — Head of Mathematics
  const existingTeacherStaffProfileId = crypto.randomUUID();
  staffProfileData.push({
    id: existingTeacherStaffProfileId,
    tenant_id: tenantId,
    user_id: teacherUser.id,
    staff_number: 'MDAD-T-001',
    job_title: 'Head of Mathematics',
    department: 'Mathematics',
    employment_status: 'active' as never,
    employment_type: 'full_time' as never,
    bank_name: null,
  });

  // Track the existing teacher as staff
  allStaff.push({
    userId: teacherUser.id,
    membershipId: teacherMembership.id,
    staffProfileId: existingTeacherStaffProfileId,
    subjectCodes: ['MATH'],
    isTeacher: true,
    firstName: 'Ibrahim',
    lastName: 'Nasser',
    email: 'teacher@mdad.test',
    jobTitle: 'Head of Mathematics',
    department: 'Mathematics',
    employmentType: 'full_time',
    monthlySalary: 15000,
  });

  // Add existing teacher to MATH subject pool
  if (!teachersBySubject.has('MATH')) teachersBySubject.set('MATH', []);
  teachersBySubject.get('MATH')!.push(existingTeacherStaffProfileId);
  allTeacherStaffIds.push(existingTeacherStaffProfileId);

  // New teachers: staff_number MDAD-T-002 through MDAD-T-048
  for (let i = 0; i < newTeacherUsers.length; i++) {
    const t = newTeacherUsers[i]!;
    const staffProfileId = crypto.randomUUID();
    const staffNumber = `MDAD-T-${String(i + 2).padStart(3, '0')}`;
    const jobTitle = t.def.isHead ? `Head of ${t.def.department}` : `${t.def.department} Teacher`;

    staffProfileData.push({
      id: staffProfileId,
      tenant_id: tenantId,
      user_id: t.id,
      staff_number: staffNumber,
      job_title: jobTitle,
      department: t.def.department,
      employment_status: 'active' as never,
      employment_type: t.def.employmentType as never,
      bank_name: null,
    });

    const subjectCodes = t.def.subjectCode ? [t.def.subjectCode] : [];
    allStaff.push({
      userId: t.id,
      membershipId: teacherMemberships[i]!.id,
      staffProfileId,
      subjectCodes,
      isTeacher: true,
      firstName: t.firstName,
      lastName: t.lastName,
      email: t.email,
      jobTitle,
      department: t.def.department,
      employmentType: t.def.employmentType,
      monthlySalary: t.def.salaryAED,
    });

    if (t.def.subjectCode) {
      if (!teachersBySubject.has(t.def.subjectCode)) teachersBySubject.set(t.def.subjectCode, []);
      teachersBySubject.get(t.def.subjectCode)!.push(staffProfileId);
      allTeacherStaffIds.push(staffProfileId);
    }
  }

  // New support staff: staff_number MDAD-A-003 through MDAD-A-017
  for (let i = 0; i < newSupportUsers.length; i++) {
    const s = newSupportUsers[i]!;
    const staffProfileId = crypto.randomUUID();
    const staffNumber = `MDAD-A-${String(i + 3).padStart(3, '0')}`;

    staffProfileData.push({
      id: staffProfileId,
      tenant_id: tenantId,
      user_id: s.id,
      staff_number: staffNumber,
      job_title: s.def.jobTitle,
      department: s.def.department,
      employment_status: 'active' as never,
      employment_type: s.def.employmentType as never,
      bank_name: null,
    });

    allStaff.push({
      userId: s.id,
      membershipId: supportMemberships[i]!.id,
      staffProfileId,
      subjectCodes: [],
      isTeacher: false,
      firstName: s.firstName,
      lastName: s.lastName,
      email: s.email,
      jobTitle: s.def.jobTitle,
      department: s.def.department,
      employmentType: s.def.employmentType,
      monthlySalary: s.def.salaryAED,
    });
  }

  // Bulk create all staff profiles
  await prisma.staffProfile.createMany({
    data: staffProfileData,
    skipDuplicates: true,
  });

  console.log(`  [People] Created ${staffProfileData.length} staff profiles`);

  // ── E) Create Households ───────────────────────────────────────────────────
  console.log('  [People] Creating households...');

  // Distribution: 350 single + 150 double + 33 triple + 1 single = 534 HH, 750 students
  const SINGLE_COUNT = 350;
  const DOUBLE_COUNT = 150;
  const TRIPLE_COUNT = 33;
  const EXTRA_SINGLE_COUNT = 1; // 1 extra single-child HH to reach 750
  const TOTAL_HH = SINGLE_COUNT + DOUBLE_COUNT + TRIPLE_COUNT + EXTRA_SINGLE_COUNT;

  const households: HouseholdInfo[] = [];
  const householdCreateData: Array<{
    id: string;
    tenant_id: string;
    household_name: string;
    address_line_1: string;
    city: string;
    country: string;
    postal_code: string;
    needs_completion: boolean;
    status: never;
  }> = [];

  const emergencyContactData: Array<{
    id: string;
    tenant_id: string;
    household_id: string;
    contact_name: string;
    phone: string;
    relationship_label: string;
    display_order: number;
  }> = [];

  const dubaiAreas = [
    'Jumeirah', 'Al Barsha', 'Dubai Marina', 'Deira', 'Bur Dubai',
    'Al Quoz', 'JBR', 'Downtown Dubai', 'Business Bay', 'Motor City',
    'Arabian Ranches', 'Al Nahda', 'Al Karama', 'Mirdif', 'Silicon Oasis',
    'Sports City', 'Jumeirah Village', 'Discovery Gardens', 'Al Furjan', 'Damac Hills',
  ];

  for (let h = 0; h < TOTAL_HH; h++) {
    const id = crypto.randomUUID();
    const familyName = pickFamilyName(h);

    let childCount: number;
    if (h < SINGLE_COUNT) {
      childCount = 1;
    } else if (h < SINGLE_COUNT + DOUBLE_COUNT) {
      childCount = 2;
    } else if (h < SINGLE_COUNT + DOUBLE_COUNT + TRIPLE_COUNT) {
      childCount = 3;
    } else {
      childCount = 1; // extra single
    }

    const hInfo: HouseholdInfo = {
      id,
      familyName,
      studentIds: [], // filled later when creating students
      parentIds: [],  // filled later when creating parents
      yearGroupIndices: [],
    };
    households.push(hInfo);

    // Mark a few edge cases as needs_completion
    const needsCompletion = h >= TOTAL_HH - 5;

    householdCreateData.push({
      id,
      tenant_id: tenantId,
      household_name: `The ${familyName} Family`,
      address_line_1: `${100 + (h % 500)} ${dubaiAreas[h % dubaiAreas.length]!} Street`,
      city: 'Dubai',
      country: 'AE',
      postal_code: makePostalCode(h),
      needs_completion: needsCompletion,
      status: 'active' as never,
    });

    // Emergency contact per household
    const ecFirstName = pickMaleName(h + 200);
    const ecLastName = pickFamilyName(h + 200);
    emergencyContactData.push({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      household_id: id,
      contact_name: `${ecFirstName} ${ecLastName}`,
      phone: makePhone(h + 5000),
      relationship_label: h % 3 === 0 ? 'Uncle' : h % 3 === 1 ? 'Aunt' : 'Grandparent',
      display_order: 1,
    });
  }

  // Bulk create households
  for (const batch of chunk(householdCreateData, 500)) {
    await prisma.household.createMany({ data: batch, skipDuplicates: true });
  }

  // Bulk create emergency contacts
  for (const batch of chunk(emergencyContactData, 500)) {
    await prisma.householdEmergencyContact.createMany({ data: batch, skipDuplicates: true });
  }

  console.log(`  [People] Created ${TOTAL_HH} households with emergency contacts`);

  // ── F) Create Parents ──────────────────────────────────────────────────────
  console.log('  [People] Creating parents...');

  // ~430 households get 2 parents, ~104 get 1 parent
  const TWO_PARENT_COUNT = 430;
  const ONE_PARENT_COUNT = TOTAL_HH - TWO_PARENT_COUNT; // 104

  // We'll also create 25 parent user accounts (for parent portal testing)
  const PARENT_PORTAL_COUNT = 25;

  const parentCreateData: Array<{
    id: string;
    tenant_id: string;
    user_id: string | null;
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
    whatsapp_phone: string | null;
    preferred_contact_channels: unknown;
    relationship_label: string;
    is_primary_contact: boolean;
    is_billing_contact: boolean;
    status: never;
  }> = [];

  const householdParentJoins: Array<{
    household_id: string;
    parent_id: string;
    role_label: string;
    tenant_id: string;
  }> = [];

  // Parent user accounts (for portal testing)
  const parentUserIds: string[] = [];
  const parentPortalUsers: Array<{
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  }> = [];

  // parent@mdad.test is the first portal user
  parentUserIds.push(parentUser.id);

  // Create 24 more parent user accounts
  for (let pu = 0; pu < PARENT_PORTAL_COUNT - 1; pu++) {
    const id = crypto.randomUUID();
    const firstName = pu % 2 === 0 ? pickMaleName(pu + 300) : pickFemaleName(pu + 300);
    const lastName = pickFamilyName(pu + 300);
    const email = makeEmail(firstName, lastName, pu + 1, 'mdad.test');
    parentPortalUsers.push({ id, email, firstName, lastName });
    parentUserIds.push(id);
  }

  if (parentPortalUsers.length > 0) {
    await prisma.user.createMany({
      data: parentPortalUsers.map((p) => ({
        id: p.id,
        email: p.email,
        password_hash: passwordHash,
        first_name: p.firstName,
        last_name: p.lastName,
        preferred_locale: 'ar',
        global_status: 'active' as never,
        email_verified_at: new Date(),
      })),
      skipDuplicates: true,
    });

    // Create memberships for parent portal users
    const parentPortalMemberships = parentPortalUsers.map((p) => ({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      user_id: p.id,
      membership_status: 'active' as never,
      joined_at: new Date(),
    }));
    await prisma.tenantMembership.createMany({
      data: parentPortalMemberships,
      skipDuplicates: true,
    });

    // Assign parent role
    await prisma.membershipRole.createMany({
      data: parentPortalMemberships.map((m) => ({
        membership_id: m.id,
        role_id: parentRole.id,
        tenant_id: tenantId,
      })),
      skipDuplicates: true,
    });
  }

  // Create parent records for all households
  let parentIdx = 0;
  let portalUserAssignIdx = 0; // tracks which portal user to assign next

  for (let h = 0; h < TOTAL_HH; h++) {
    const hh = households[h]!;
    const familyName = hh.familyName;
    const hasTwoParents = h < TWO_PARENT_COUNT;
    const parentCount = hasTwoParents ? 2 : 1;

    for (let p = 0; p < parentCount; p++) {
      const parentId = crypto.randomUUID();
      const isFather = p === 0;
      const firstName = isFather
        ? pickMaleName(parentIdx + 500)
        : pickFemaleName(parentIdx + 500);
      const phone = makePhone(parentIdx + 10000);
      const email = makeEmail(firstName, familyName, parentIdx, 'parent.mdad.test');

      // Assign user accounts to first N parents for portal testing
      let userId: string | null = null;
      if (portalUserAssignIdx === 0 && isFather && h === 0) {
        // First household father gets the existing parent@mdad.test user
        userId = parentUser.id;
        portalUserAssignIdx++;
      } else if (portalUserAssignIdx > 0 && portalUserAssignIdx < PARENT_PORTAL_COUNT && isFather && h <= PARENT_PORTAL_COUNT) {
        userId = parentPortalUsers[portalUserAssignIdx - 1]?.id ?? null;
        if (userId) portalUserAssignIdx++;
      }

      parentCreateData.push({
        id: parentId,
        tenant_id: tenantId,
        user_id: userId,
        first_name: firstName,
        last_name: familyName,
        email,
        phone,
        whatsapp_phone: phone,
        preferred_contact_channels: JSON.parse('["email","whatsapp"]'),
        relationship_label: isFather ? 'Father' : 'Mother',
        is_primary_contact: isFather,
        is_billing_contact: isFather,
        status: 'active' as never,
      });

      householdParentJoins.push({
        household_id: hh.id,
        parent_id: parentId,
        role_label: isFather ? 'Father' : 'Mother',
        tenant_id: tenantId,
      });

      hh.parentIds.push(parentId);
      parentIdx++;
    }
  }

  // Bulk create parents
  for (const batch of chunk(parentCreateData, 500)) {
    await prisma.parent.createMany({ data: batch, skipDuplicates: true });
  }

  // Bulk create household-parent joins
  for (const batch of chunk(householdParentJoins, 500)) {
    await prisma.householdParent.createMany({ data: batch, skipDuplicates: true });
  }

  // Now update primary_billing_parent_id on households
  // Set the first parent (father) as the billing parent
  for (const hh of households) {
    if (hh.parentIds.length > 0) {
      await prisma.household.update({
        where: { id: hh.id },
        data: { primary_billing_parent_id: hh.parentIds[0]! },
      });
    }
  }

  console.log(`  [People] Created ${parentCreateData.length} parents (${PARENT_PORTAL_COUNT} with portal accounts)`);

  // ── G) Create 750 Students ─────────────────────────────────────────────────
  console.log('  [People] Creating students...');

  const students: StudentInfo[] = [];
  const allStudentIds: string[] = [];
  const studentsByYearGroup = new Map<string, string[]>();
  const studentsBySection = new Map<string, string[]>();

  // Initialize maps
  for (let yi = 0; yi < YEAR_GROUP_NAMES.length; yi++) {
    studentsByYearGroup.set(foundation.yearGroupIds[yi]!, []);
    for (let si = 0; si < SECTION_LETTERS.length; si++) {
      const sectionKey = `Y${yi + 1}${SECTION_LETTERS[si]!}`;
      studentsBySection.set(sectionKey, []);
    }
  }

  // Build student list: 125 per year group, 25 per section
  const studentCreateData: Array<{
    id: string;
    tenant_id: string;
    household_id: string;
    student_number: string;
    first_name: string;
    last_name: string;
    first_name_ar: string;
    last_name_ar: string;
    date_of_birth: Date;
    gender: never;
    status: never;
    entry_date: Date;
    year_group_id: string;
    class_homeroom_id: null;
  }> = [];

  const studentParentJoins: Array<{
    student_id: string;
    parent_id: string;
    relationship_label: string;
    tenant_id: string;
  }> = [];

  let studentGlobalIdx = 0;
  let householdStudentIdx = 0; // tracks which household gets the next student

  // Helper: map student to a household
  // Single-child households: indices 0-349 and 533
  // Double-child households: indices 350-499
  // Triple-child households: indices 500-532
  // We assign students to households as we go through year groups

  // Pre-compute household assignments: build a flat list of (householdIndex, childSlot)
  const studentHouseholdAssignments: Array<{ hhIdx: number; childSlot: number }> = [];

  // Single-child HH: 350 slots
  for (let i = 0; i < SINGLE_COUNT; i++) {
    studentHouseholdAssignments.push({ hhIdx: i, childSlot: 0 });
  }
  // Double-child HH: 300 slots
  for (let i = 0; i < DOUBLE_COUNT; i++) {
    const hhIdx = SINGLE_COUNT + i;
    studentHouseholdAssignments.push({ hhIdx, childSlot: 0 });
    studentHouseholdAssignments.push({ hhIdx, childSlot: 1 });
  }
  // Triple-child HH: 99 slots
  for (let i = 0; i < TRIPLE_COUNT; i++) {
    const hhIdx = SINGLE_COUNT + DOUBLE_COUNT + i;
    studentHouseholdAssignments.push({ hhIdx, childSlot: 0 });
    studentHouseholdAssignments.push({ hhIdx, childSlot: 1 });
    studentHouseholdAssignments.push({ hhIdx, childSlot: 2 });
  }
  // Extra single: 1 slot
  studentHouseholdAssignments.push({ hhIdx: TOTAL_HH - 1, childSlot: 0 });

  // Total = 350 + 300 + 99 + 1 = 750

  // Status distribution: 730 active, 10 applicant, 5 withdrawn, 5 archived
  function getStudentStatus(idx: number): string {
    if (idx >= 740 && idx < 745) return 'withdrawn';
    if (idx >= 745) return 'archived';
    if (idx >= 730) return 'applicant';
    return 'active';
  }

  // Student name counters
  let studentMaleIdx = 0;
  let studentFemaleIdx = 0;

  for (let yi = 0; yi < YEAR_GROUP_NAMES.length; yi++) {
    const yearGroupId = foundation.yearGroupIds[yi]!;
    // DOB: Y1 kids born ~2014, Y6 kids born ~2009 (for 2025-2026 academic year)
    // Y1 ~age 11 → born 2014, Y6 ~age 16 → born 2009
    const birthYear = 2014 - yi;

    for (let si = 0; si < SECTION_LETTERS.length; si++) {
      const sectionKey = `Y${yi + 1}${SECTION_LETTERS[si]!}`;

      for (let s = 0; s < STUDENTS_PER_SECTION; s++) {
        const studentId = crypto.randomUUID();
        const isMale = studentGlobalIdx % 2 === 0;
        const firstName = isMale
          ? pickMaleName(studentMaleIdx++)
          : pickFemaleName(studentFemaleIdx++);

        const assignment = studentHouseholdAssignments[studentGlobalIdx]!;
        const hh = households[assignment.hhIdx]!;
        const lastName = hh.familyName;
        const fullName = `${firstName} ${lastName}`;

        const studentNumber = `MDAD-S-${String(studentGlobalIdx + 1).padStart(5, '0')}`;
        const status = getStudentStatus(studentGlobalIdx);

        // Generate a deterministic DOB within the birth year
        const month = (studentGlobalIdx % 12) + 1;
        const day = (studentGlobalIdx % 28) + 1;
        const dob = new Date(`${birthYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);

        const entryDate = status === 'applicant' ? new Date('2026-09-01') : new Date('2025-09-01');

        studentCreateData.push({
          id: studentId,
          tenant_id: tenantId,
          household_id: hh.id,
          student_number: studentNumber,
          first_name: firstName,
          last_name: lastName,
          first_name_ar: firstName,
          last_name_ar: lastName,
          date_of_birth: dob,
          gender: (isMale ? 'male' : 'female') as never,
          status: status as never,
          entry_date: entryDate,
          year_group_id: yearGroupId,
          class_homeroom_id: null,
        });

        // Track student
        const studentInfo: StudentInfo = {
          id: studentId,
          firstName,
          lastName,
          gender: isMale ? 'male' : 'female',
          status: status as 'active' | 'applicant' | 'withdrawn' | 'archived',
          yearGroupId,
          yearGroupIndex: yi,
          sectionIndex: si,
          householdId: hh.id,
          studentNumber,
        };
        students.push(studentInfo);
        allStudentIds.push(studentId);
        studentsByYearGroup.get(yearGroupId)!.push(studentId);
        studentsBySection.get(sectionKey)!.push(studentId);

        // Link student to household
        hh.studentIds.push(studentId);
        if (!hh.yearGroupIndices.includes(yi)) {
          hh.yearGroupIndices.push(yi);
        }

        // Create student-parent joins
        for (const parentId of hh.parentIds) {
          const parentRecord = parentCreateData.find((pc) => pc.id === parentId);
          studentParentJoins.push({
            student_id: studentId,
            parent_id: parentId,
            relationship_label: parentRecord?.relationship_label ?? 'Parent',
            tenant_id: tenantId,
          });
        }

        studentGlobalIdx++;
      }
    }
  }

  // Bulk create students
  console.log('  [People] Inserting students in batches...');
  for (const batch of chunk(studentCreateData, 500)) {
    await prisma.student.createMany({ data: batch, skipDuplicates: true });
  }

  // Bulk create student-parent joins
  console.log('  [People] Inserting student-parent links...');
  for (const batch of chunk(studentParentJoins, 1000)) {
    await prisma.studentParent.createMany({ data: batch, skipDuplicates: true });
  }

  console.log(
    `  [People] Created ${students.length} students, ${studentParentJoins.length} student-parent links`,
  );

  return {
    ownerUserId: ownerUser.id,
    ownerStaffProfileId,
    adminUserId: adminUser.id,
    staff: allStaff,
    teachersBySubject,
    allTeacherStaffIds,
    households,
    students,
    allStudentIds,
    studentsByYearGroup,
    studentsBySection,
    parentUserIds,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Function 3: seedClasses
// ═══════════════════════════════════════════════════════════════════════════════

export async function seedClasses(
  prisma: PrismaClient,
  tenantId: string,
  foundation: FoundationResult,
  people: PeopleResult,
): Promise<ClassesResult> {
  const homerooms: ClassInfo[] = [];
  const subjectClasses: ClassInfo[] = [];

  // ── A) 30 Homeroom Classes ─────────────────────────────────────────────────
  console.log('  [Classes] Creating homeroom classes...');

  const homeroomCreateData: Array<{
    id: string;
    tenant_id: string;
    academic_year_id: string;
    year_group_id: string;
    subject_id: null;
    homeroom_teacher_staff_id: string;
    name: string;
    status: never;
  }> = [];

  let homeroomTeacherIdx = 0;

  for (let yi = 0; yi < YEAR_GROUP_NAMES.length; yi++) {
    const yearGroupId = foundation.yearGroupIds[yi]!;

    for (let si = 0; si < SECTION_LETTERS.length; si++) {
      const className = `Y${yi + 1}${SECTION_LETTERS[si]!}`;
      const classId = crypto.randomUUID();

      // Assign a teacher as homeroom teacher (round-robin through all teacher staff IDs)
      const teacherStaffId =
        people.allTeacherStaffIds[homeroomTeacherIdx % people.allTeacherStaffIds.length]!;
      homeroomTeacherIdx++;

      homeroomCreateData.push({
        id: classId,
        tenant_id: tenantId,
        academic_year_id: foundation.academicYearId,
        year_group_id: yearGroupId,
        subject_id: null,
        homeroom_teacher_staff_id: teacherStaffId,
        name: className,
        status: 'active' as never,
      });

      const sectionKey = `Y${yi + 1}${SECTION_LETTERS[si]!}`;
      const studentIds = people.studentsBySection.get(sectionKey) ?? [];

      homerooms.push({
        id: classId,
        name: className,
        yearGroupId,
        yearGroupIndex: yi,
        subjectId: null,
        subjectCode: null,
        teacherStaffId,
        studentIds: [...studentIds],
        sectionIndex: si,
      });
    }
  }

  await prisma.class.createMany({ data: homeroomCreateData, skipDuplicates: true });
  console.log(`  [Classes] Created ${homeroomCreateData.length} homeroom classes`);

  // ── B) Subject Classes ─────────────────────────────────────────────────────
  console.log('  [Classes] Creating subject classes...');

  const subjectClassCreateData: Array<{
    id: string;
    tenant_id: string;
    academic_year_id: string;
    year_group_id: string;
    subject_id: string;
    homeroom_teacher_staff_id: null;
    name: string;
    status: never;
  }> = [];

  for (let yi = 0; yi < YEAR_GROUP_NAMES.length; yi++) {
    const yearGroupId = foundation.yearGroupIds[yi]!;
    const yearSubjects = SUBJECTS_BY_YEAR[yi]!;

    for (const subjectCode of yearSubjects) {
      const subjectId = foundation.subjectMap.get(subjectCode);
      if (!subjectId) continue;

      const subjectDef = SUBJECT_DEFS.find((s) => s.code === subjectCode);
      const subjectName = subjectDef?.name ?? subjectCode;

      for (let si = 0; si < SECTION_LETTERS.length; si++) {
        const className = `Y${yi + 1}${SECTION_LETTERS[si]!} - ${subjectName}`;
        const classId = crypto.randomUUID();

        subjectClassCreateData.push({
          id: classId,
          tenant_id: tenantId,
          academic_year_id: foundation.academicYearId,
          year_group_id: yearGroupId,
          subject_id: subjectId,
          homeroom_teacher_staff_id: null,
          name: className,
          status: 'active' as never,
        });

        // Determine which students are in this class
        const sectionKey = `Y${yi + 1}${SECTION_LETTERS[si]!}`;
        let studentIds: string[];

        if (yi <= 3) {
          // Y1-Y4: all students take all subjects
          studentIds = [...(people.studentsBySection.get(sectionKey) ?? [])];
        } else {
          // Y5-Y6: students pick 8 subjects (4 core + 4 electives)
          const allSectionStudents = people.studentsBySection.get(sectionKey) ?? [];
          studentIds = [];

          if (Y5_Y6_CORE.includes(subjectCode)) {
            // Core subject — all students take it
            studentIds = [...allSectionStudents];
          } else {
            // Elective — deterministic selection
            // Each student picks 4 electives from the 8 available
            // Student index within section determines which electives they pick
            for (let sidx = 0; sidx < allSectionStudents.length; sidx++) {
              // Use student index to deterministically select 4 from 8 electives
              const electiveIdx = Y5_Y6_ELECTIVES.indexOf(subjectCode);
              if (electiveIdx === -1) continue;

              // Assign electives in a round-robin pattern:
              // Student 0 picks electives 0,1,2,3
              // Student 1 picks electives 1,2,3,4
              // etc.
              const studentElectiveStart = sidx % Y5_Y6_ELECTIVES.length;
              const studentElectives: number[] = [];
              for (let e = 0; e < Y5_Y6_ELECTIVE_PICK; e++) {
                studentElectives.push((studentElectiveStart + e) % Y5_Y6_ELECTIVES.length);
              }

              if (studentElectives.includes(electiveIdx)) {
                studentIds.push(allSectionStudents[sidx]!);
              }
            }
          }
        }

        subjectClasses.push({
          id: classId,
          name: className,
          yearGroupId,
          yearGroupIndex: yi,
          subjectId,
          subjectCode,
          teacherStaffId: null, // assigned in step C
          studentIds,
          sectionIndex: si,
        });
      }
    }
  }

  // Bulk create subject classes in batches
  for (const batch of chunk(subjectClassCreateData, 500)) {
    await prisma.class.createMany({ data: batch, skipDuplicates: true });
  }
  console.log(`  [Classes] Created ${subjectClassCreateData.length} subject classes`);

  // ── C) ClassStaff assignments ──────────────────────────────────────────────
  console.log('  [Classes] Creating staff assignments...');

  const classStaffData: Array<{
    class_id: string;
    staff_profile_id: string;
    assignment_role: never;
    tenant_id: string;
  }> = [];

  // Homeroom staff assignments
  for (const hr of homerooms) {
    if (hr.teacherStaffId) {
      classStaffData.push({
        class_id: hr.id,
        staff_profile_id: hr.teacherStaffId,
        assignment_role: 'homeroom' as never,
        tenant_id: tenantId,
      });
    }
  }

  // Subject class staff assignments — round-robin per subject
  const subjectTeacherCounters = new Map<string, number>();

  for (const sc of subjectClasses) {
    if (!sc.subjectCode) continue;

    const teacherPool = people.teachersBySubject.get(sc.subjectCode);
    if (!teacherPool || teacherPool.length === 0) continue;

    const counter = subjectTeacherCounters.get(sc.subjectCode) ?? 0;
    const staffProfileId = teacherPool[counter % teacherPool.length]!;
    subjectTeacherCounters.set(sc.subjectCode, counter + 1);

    sc.teacherStaffId = staffProfileId;

    classStaffData.push({
      class_id: sc.id,
      staff_profile_id: staffProfileId,
      assignment_role: 'teacher' as never,
      tenant_id: tenantId,
    });
  }

  // Bulk create class staff
  for (const batch of chunk(classStaffData, 1000)) {
    await prisma.classStaff.createMany({ data: batch, skipDuplicates: true });
  }
  console.log(`  [Classes] Created ${classStaffData.length} staff assignments`);

  // ── D) ClassEnrolments ─────────────────────────────────────────────────────
  console.log('  [Classes] Creating class enrolments...');

  const enrolmentData: Array<{
    id: string;
    tenant_id: string;
    class_id: string;
    student_id: string;
    status: never;
    start_date: Date;
    end_date: Date | null;
  }> = [];

  const startDate = new Date('2025-09-01');

  // Build a lookup of student status by ID
  const studentStatusMap = new Map<string, string>();
  for (const s of people.students) {
    studentStatusMap.set(s.id, s.status);
  }

  function enrolmentStatus(studentId: string): string | null {
    const st = studentStatusMap.get(studentId) ?? 'active';
    if (st === 'applicant') return null;   // applicants not enrolled
    if (st === 'withdrawn') return 'dropped';
    if (st === 'archived') return 'completed';
    return 'active';
  }

  // Homeroom enrolments
  for (const hr of homerooms) {
    for (const studentId of hr.studentIds) {
      const eStatus = enrolmentStatus(studentId);
      if (!eStatus) continue; // skip applicants
      enrolmentData.push({
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        class_id: hr.id,
        student_id: studentId,
        status: eStatus as never,
        start_date: startDate,
        end_date: eStatus !== 'active' ? new Date('2025-12-19') : null,
      });
    }
  }

  // Subject class enrolments
  for (const sc of subjectClasses) {
    for (const studentId of sc.studentIds) {
      const eStatus = enrolmentStatus(studentId);
      if (!eStatus) continue; // skip applicants
      enrolmentData.push({
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        class_id: sc.id,
        student_id: studentId,
        status: eStatus as never,
        start_date: startDate,
        end_date: eStatus !== 'active' ? new Date('2025-12-19') : null,
      });
    }
  }

  console.log(`  [Classes] Inserting ${enrolmentData.length} enrolments in batches...`);
  for (const batch of chunk(enrolmentData, 1000)) {
    await prisma.classEnrolment.createMany({ data: batch, skipDuplicates: true });
  }

  // ── E) Update students' class_homeroom_id ──────────────────────────────────
  console.log('  [Classes] Updating student homeroom assignments...');

  // Build a map: studentId -> homeroomClassId
  const studentHomeroomMap = new Map<string, string>();
  for (const hr of homerooms) {
    for (const studentId of hr.studentIds) {
      studentHomeroomMap.set(studentId, hr.id);
    }
  }

  // Batch update students per homeroom class — skip applicants (they aren't enrolled yet)
  for (const hr of homerooms) {
    const enrolledStudentIds = hr.studentIds.filter((sid) => {
      const st = studentStatusMap.get(sid);
      return st !== 'applicant';
    });
    if (enrolledStudentIds.length > 0) {
      await prisma.student.updateMany({
        where: {
          id: { in: enrolledStudentIds },
          tenant_id: tenantId,
        },
        data: { class_homeroom_id: hr.id },
      });
    }
  }

  const allClasses = [...homerooms, ...subjectClasses];

  console.log(
    `  [Classes] Done: ${homerooms.length} homerooms, ${subjectClasses.length} subject classes, ` +
      `${enrolmentData.length} enrolments`,
  );

  return {
    homerooms,
    subjectClasses,
    allClasses,
  };
}
