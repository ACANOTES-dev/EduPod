/**
 * Stress-test dataset seeder.
 *
 * Modes:
 *   --mode baseline    Seed a solvable medium school (matches STRESS-002 scale).
 *                      20 teachers, 10 classes, 11 subjects, 25 rooms, full
 *                      period grid (8×5=40 slots with break+lunch), Ireland
 *                      calendar (2025-2026 academic year, Sept–June).
 *   --mode teardown    Delete the seeded academic year; cascade removes all
 *                      scheduling-related rows (classes, curriculum,
 *                      competencies, period templates, schedules). Teachers
 *                      and subjects are kept (they may be reused across runs).
 *   --mode nuke        Aggressive teardown: also deletes the 20 seeded teachers,
 *                      subjects, rooms, and year groups. Use before starting
 *                      a clean stress sweep.
 *
 * Flags:
 *   --tenant-slug <slug>  Target tenant (default: stress-a).
 *
 * Run on server (production):
 *   cd /opt/edupod/app && \
 *     set -a; source /opt/edupod/app/.env; set +a && \
 *     npx tsx packages/prisma/scripts/stress-seed.ts --mode baseline --tenant-slug stress-a
 *
 * Idempotent within a mode. Re-running --mode baseline will upsert.
 */
/* eslint-disable no-console -- seed script uses console for progress */
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

const connectionString = process.env.DATABASE_MIGRATE_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_MIGRATE_URL or DATABASE_URL must be set');
const prisma = new PrismaClient({ datasources: { db: { url: connectionString } } });

const PASSWORD = 'StressTest2026!';
const BCRYPT_ROUNDS = 10;

// ─── Dataset definitions ─────────────────────────────────────────────────────

const ACADEMIC_YEAR = {
  name: 'AY 2025-2026',
  start_date: new Date('2025-09-01'),
  end_date: new Date('2026-06-30'),
};

const YEAR_GROUPS = [
  { name: 'Y7', display_order: 1 },
  { name: 'Y8', display_order: 2 },
  { name: 'Y9', display_order: 3 },
  { name: 'Y10', display_order: 4 },
  { name: 'Y11', display_order: 5 },
  { name: 'Y12', display_order: 6 },
];

const SUBJECTS = [
  'Maths',
  'English',
  'Irish',
  'Science',
  'History',
  'Geography',
  'Religion',
  'PE',
  'Art',
  'IT',
  'Music',
];

interface RoomDef {
  name: string;
  room_type:
    | 'classroom'
    | 'lab'
    | 'gym'
    | 'auditorium'
    | 'library'
    | 'computer_lab'
    | 'art_room'
    | 'music_room'
    | 'outdoor'
    | 'science_lab';
  capacity: number;
}

const ROOMS: RoomDef[] = [
  ...Array.from({ length: 20 }, (_, i) => ({
    name: `CR${String(i + 1).padStart(2, '0')}`,
    room_type: 'classroom' as const,
    capacity: 30,
  })),
  { name: 'LAB01', room_type: 'science_lab', capacity: 24 },
  { name: 'LAB02', room_type: 'science_lab', capacity: 24 },
  { name: 'GYM01', room_type: 'gym', capacity: 60 },
  { name: 'ART01', room_type: 'art_room', capacity: 28 },
  { name: 'COMP01', room_type: 'computer_lab', capacity: 28 },
];

// Period grid: 8 periods × 5 days. Break after P3 (20 min), lunch after P5 (30 min).
const PERIOD_TEMPLATE = [
  { period_order: 1, start: '09:00', end: '09:45', type: 'teaching' as const },
  { period_order: 2, start: '09:45', end: '10:30', type: 'teaching' as const },
  { period_order: 3, start: '10:30', end: '11:15', type: 'teaching' as const },
  { period_order: 4, start: '11:35', end: '12:20', type: 'teaching' as const }, // 20m break 11:15–11:35
  { period_order: 5, start: '12:20', end: '13:05', type: 'teaching' as const },
  { period_order: 6, start: '13:35', end: '14:20', type: 'teaching' as const }, // 30m lunch 13:05–13:35
  { period_order: 7, start: '14:20', end: '15:05', type: 'teaching' as const },
  { period_order: 8, start: '15:05', end: '15:50', type: 'teaching' as const },
];

const CLASSES: Array<{ name: string; year_group: string }> = [
  { name: 'Y7-A', year_group: 'Y7' },
  { name: 'Y7-B', year_group: 'Y7' },
  { name: 'Y8-A', year_group: 'Y8' },
  { name: 'Y8-B', year_group: 'Y8' },
  { name: 'Y9-A', year_group: 'Y9' },
  { name: 'Y9-B', year_group: 'Y9' },
  { name: 'Y10-A', year_group: 'Y10' },
  { name: 'Y10-B', year_group: 'Y10' },
  { name: 'Y11-A', year_group: 'Y11' },
  { name: 'Y12-A', year_group: 'Y12' },
];

// Per year-group curriculum: subject → periods per week. Totals: 32 per week,
// leaving 8 free slots out of 40 total — comfortable margin for the solver.
const CURRICULUM_PERIODS: Record<string, number> = {
  Maths: 5,
  English: 5,
  Irish: 4,
  Science: 4,
  History: 3,
  Geography: 3,
  Religion: 2,
  PE: 2,
  Art: 2,
  IT: 1,
  Music: 1,
};

const TEACHER_COUNT = 20;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getTenantSlug(): string {
  const idx = process.argv.indexOf('--tenant-slug');
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1]! : 'stress-a';
}

function getMode(): 'baseline' | 'teardown' | 'nuke' {
  const idx = process.argv.indexOf('--mode');
  const v = idx >= 0 ? process.argv[idx + 1] : undefined;
  if (v === 'baseline' || v === 'teardown' || v === 'nuke') return v;
  throw new Error('Required: --mode baseline|teardown|nuke');
}

// ─── Baseline seeder ─────────────────────────────────────────────────────────

async function seedBaseline(tenantId: string, tenantSlug: string): Promise<void> {
  console.log(`\n=== Seeding baseline for tenant "${tenantSlug}" (${tenantId}) ===`);
  const passwordHash = await hash(PASSWORD, BCRYPT_ROUNDS);

  // 1. Academic year
  const ay = await prisma.academicYear.upsert({
    where: {
      idx_academic_years_tenant_name: { tenant_id: tenantId, name: ACADEMIC_YEAR.name },
    },
    update: {},
    create: {
      tenant_id: tenantId,
      name: ACADEMIC_YEAR.name,
      start_date: ACADEMIC_YEAR.start_date,
      end_date: ACADEMIC_YEAR.end_date,
      status: 'active',
    },
  });
  console.log(`  academic year: ${ay.name}`);

  // 2. Year groups
  const ygMap = new Map<string, string>();
  for (const yg of YEAR_GROUPS) {
    const row = await prisma.yearGroup.upsert({
      where: { idx_year_groups_tenant_name: { tenant_id: tenantId, name: yg.name } },
      update: {},
      create: {
        tenant_id: tenantId,
        name: yg.name,
        display_order: yg.display_order,
      },
    });
    ygMap.set(yg.name, row.id);
  }
  console.log(`  year groups: ${YEAR_GROUPS.length}`);

  // 3. Subjects
  const subjectMap = new Map<string, string>();
  for (const name of SUBJECTS) {
    const row = await prisma.subject.upsert({
      where: { idx_subjects_tenant_name: { tenant_id: tenantId, name } },
      update: {},
      create: {
        tenant_id: tenantId,
        name,
        subject_type: 'academic',
        active: true,
      },
    });
    subjectMap.set(name, row.id);
  }
  console.log(`  subjects: ${SUBJECTS.length}`);

  // 4. Rooms
  const roomMap = new Map<string, string>();
  for (const r of ROOMS) {
    const row = await prisma.room.upsert({
      where: { idx_rooms_tenant_name: { tenant_id: tenantId, name: r.name } },
      update: {},
      create: {
        tenant_id: tenantId,
        name: r.name,
        room_type: r.room_type,
        capacity: r.capacity,
        is_exclusive: true,
        active: true,
      },
    });
    roomMap.set(r.name, row.id);
  }
  console.log(`  rooms: ${ROOMS.length}`);

  // 5. Break group (single group, all year groups in it for baseline)
  const breakGroup = await prisma.breakGroup.upsert({
    where: {
      idx_break_groups_unique: {
        tenant_id: tenantId,
        academic_year_id: ay.id,
        name: 'Primary Break',
      },
    },
    update: {},
    create: {
      tenant_id: tenantId,
      academic_year_id: ay.id,
      name: 'Primary Break',
      required_supervisor_count: 2,
    },
  });
  for (const [, ygId] of ygMap) {
    const existing = await prisma.breakGroupYearGroup.findFirst({
      where: {
        tenant_id: tenantId,
        break_group_id: breakGroup.id,
        year_group_id: ygId,
      },
    });
    if (!existing) {
      await prisma.breakGroupYearGroup.create({
        data: {
          tenant_id: tenantId,
          break_group_id: breakGroup.id,
          year_group_id: ygId,
        },
      });
    }
  }
  console.log(`  break group: Primary Break`);

  // 6. Period grid — shared across all year groups (year_group_id null)
  for (let weekday = 1; weekday <= 5; weekday++) {
    for (const p of PERIOD_TEMPLATE) {
      const existing = await prisma.schedulePeriodTemplate.findFirst({
        where: {
          tenant_id: tenantId,
          academic_year_id: ay.id,
          year_group_id: null,
          weekday,
          period_order: p.period_order,
        },
      });
      if (!existing) {
        await prisma.schedulePeriodTemplate.create({
          data: {
            tenant_id: tenantId,
            academic_year_id: ay.id,
            weekday,
            period_order: p.period_order,
            period_name: `P${p.period_order}`,
            start_time: new Date(`1970-01-01T${p.start}:00Z`),
            end_time: new Date(`1970-01-01T${p.end}:00Z`),
            schedule_period_type: p.type,
          },
        });
      }
    }
  }
  console.log(`  period templates: 40 (8 periods × 5 days)`);

  // 7. Teachers — 20 staff profiles + users. The first one is the existing
  // `teacher@<slug>.test` login account; the remainder are t2@…t20@.
  const teacherIds: string[] = [];
  for (let i = 1; i <= TEACHER_COUNT; i++) {
    const email = i === 1 ? `teacher@${tenantSlug}.test` : `t${i}@${tenantSlug}.local`;
    const first = `Teacher`;
    const last = `${String(i).padStart(2, '0')}`;

    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        password_hash: passwordHash,
        first_name: first,
        last_name: last,
        preferred_locale: 'en',
        global_status: 'active',
        email_verified_at: new Date(),
      },
    });

    const membership = await prisma.tenantMembership.upsert({
      where: { idx_tenant_memberships_tenant_user: { tenant_id: tenantId, user_id: user.id } },
      update: {},
      create: {
        tenant_id: tenantId,
        user_id: user.id,
        membership_status: 'active',
        joined_at: new Date(),
      },
    });

    // Teacher role (skip for i===1 — already has role from tenant provisioning)
    if (i > 1) {
      const teacherRole = await prisma.role.findFirst({
        where: { tenant_id: tenantId, role_key: 'teacher' },
      });
      if (teacherRole) {
        const existing = await prisma.membershipRole.findUnique({
          where: {
            membership_id_role_id: {
              membership_id: membership.id,
              role_id: teacherRole.id,
            },
          },
        });
        if (!existing) {
          await prisma.membershipRole.create({
            data: {
              membership_id: membership.id,
              role_id: teacherRole.id,
              tenant_id: tenantId,
            },
          });
        }
      }
    }

    const sp = await prisma.staffProfile.findFirst({
      where: { tenant_id: tenantId, user_id: user.id },
    });
    const staff =
      sp ??
      (await prisma.staffProfile.create({
        data: {
          tenant_id: tenantId,
          user_id: user.id,
          staff_number: `T-${tenantSlug}-${String(i).padStart(3, '0')}`,
          employment_status: 'active',
          employment_type: 'full_time',
        },
      }));
    teacherIds.push(staff.id);
  }
  console.log(`  teachers: ${teacherIds.length}`);

  // 8. Classes
  const classMap = new Map<string, string>();
  for (const c of CLASSES) {
    const ygId = ygMap.get(c.year_group);
    if (!ygId) continue;
    const row = await prisma.class.upsert({
      where: {
        idx_classes_tenant_name_year: {
          tenant_id: tenantId,
          name: c.name,
          academic_year_id: ay.id,
        },
      },
      update: {},
      create: {
        tenant_id: tenantId,
        academic_year_id: ay.id,
        year_group_id: ygId,
        name: c.name,
        max_capacity: 30,
        status: 'active',
      },
    });
    classMap.set(c.name, row.id);
  }
  console.log(`  classes: ${classMap.size}`);

  // 9. Curriculum requirements — year-group × subject
  let curriculumCount = 0;
  for (const [, ygId] of ygMap) {
    for (const [subjectName, periods] of Object.entries(CURRICULUM_PERIODS)) {
      const subjectId = subjectMap.get(subjectName);
      if (!subjectId) continue;
      await prisma.curriculumRequirement.upsert({
        where: {
          idx_curriculum_req_unique: {
            tenant_id: tenantId,
            academic_year_id: ay.id,
            year_group_id: ygId,
            subject_id: subjectId,
          },
        },
        update: { min_periods_per_week: periods, max_periods_per_day: 2 },
        create: {
          tenant_id: tenantId,
          academic_year_id: ay.id,
          year_group_id: ygId,
          subject_id: subjectId,
          min_periods_per_week: periods,
          max_periods_per_day: 2,
        },
      });
      curriculumCount++;
    }
  }
  console.log(`  curriculum requirements: ${curriculumCount}`);

  // 10. Teacher competencies — every teacher can teach every subject for
  // every year group. Generous coverage so baseline is always solvable;
  // constraint-shortage scenarios tighten this per-scenario.
  let competencyCount = 0;
  for (const staffId of teacherIds) {
    for (const [, ygId] of ygMap) {
      for (const [, subjectId] of subjectMap) {
        const existing = await prisma.teacherCompetency.findFirst({
          where: {
            tenant_id: tenantId,
            academic_year_id: ay.id,
            staff_profile_id: staffId,
            subject_id: subjectId,
            year_group_id: ygId,
            class_id: null,
          },
        });
        if (!existing) {
          await prisma.teacherCompetency.create({
            data: {
              tenant_id: tenantId,
              academic_year_id: ay.id,
              staff_profile_id: staffId,
              subject_id: subjectId,
              year_group_id: ygId,
            },
          });
          competencyCount++;
        }
      }
    }
  }
  console.log(`  teacher competencies: ${competencyCount} (added)`);

  console.log(`\n=== Baseline seed complete for ${tenantSlug} ===`);
}

// ─── Teardown ────────────────────────────────────────────────────────────────

async function teardown(tenantId: string, tenantSlug: string, nuke: boolean): Promise<void> {
  console.log(`\n=== Teardown for tenant "${tenantSlug}" (nuke=${nuke}) ===`);

  // Delete the seeded academic year — onDelete: Cascade on its relations
  // cleans up classes, schedules, period templates, curriculum, competencies,
  // break groups.
  const ay = await prisma.academicYear.findFirst({
    where: { tenant_id: tenantId, name: ACADEMIC_YEAR.name },
  });
  if (ay) {
    await prisma.academicYear.delete({ where: { id: ay.id } });
    console.log(`  deleted academic year + cascade`);
  }

  if (nuke) {
    // Also delete seeded teachers (t2-t20), subjects, rooms, year groups.
    // Keep t1 (teacher@stress-a.test) because the tenant provisioning
    // script owns it. Keep admin/principal users too.
    for (let i = 2; i <= TEACHER_COUNT; i++) {
      const email = `t${i}@${tenantSlug}.local`;
      const user = await prisma.user.findUnique({ where: { email } });
      if (user) {
        // Cascade: staff_profile + memberships + membership_roles go with the user
        await prisma.user.delete({ where: { id: user.id } });
      }
    }
    console.log(`  deleted ${TEACHER_COUNT - 1} seeded teachers (t2-t20)`);

    for (const r of ROOMS) {
      await prisma.room.deleteMany({ where: { tenant_id: tenantId, name: r.name } });
    }
    console.log(`  deleted rooms`);

    for (const name of SUBJECTS) {
      await prisma.subject.deleteMany({ where: { tenant_id: tenantId, name } });
    }
    console.log(`  deleted subjects`);

    for (const yg of YEAR_GROUPS) {
      await prisma.yearGroup.deleteMany({ where: { tenant_id: tenantId, name: yg.name } });
    }
    console.log(`  deleted year groups`);
  }

  console.log(`\n=== Teardown complete for ${tenantSlug} ===`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const mode = getMode();
  const tenantSlug = getTenantSlug();

  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) {
    throw new Error(`Tenant "${tenantSlug}" not found. Run create-stress-tenants.ts first.`);
  }

  if (mode === 'baseline') {
    await seedBaseline(tenant.id, tenantSlug);
  } else if (mode === 'teardown') {
    await teardown(tenant.id, tenantSlug, false);
  } else {
    await teardown(tenant.id, tenantSlug, true);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
