/**
 * QA Seed: Midaad Ul Qalam (mdad) — 750-student school dataset.
 *
 * Run with: pnpm --filter @school/prisma seed:qa-mdad
 *
 * Prerequisites: The main seed (seed.ts) must have been run first to create
 * the mdad tenant, its 4 dev users, roles, permissions, and modules.
 *
 * This script:
 *   1. Wipes all existing mdad tenant data (preserving tenant config + dev users)
 *   2. Recreates everything from scratch: academic structure, 750 students,
 *      ~65 staff, ~534 households, ~964 parents, 435 classes, ~10K enrolments,
 *      schedule, grading, finance, payroll, attendance, admissions, comms.
 *
 * Total: ~40,000 records.
 */

import { PrismaClient } from '@prisma/client';
import { hashPassword, DEV_PASSWORD } from './seed/dev-data';
import { cleanMdadData } from './seed/qa-mdad/clean';
import { seedFoundation, seedPeople, seedClasses } from './seed/qa-mdad/seed-data';
import {
  seedSchedule,
  seedGrading,
  seedFinance,
  seedPayroll,
  seedAttendance,
  seedExtras,
} from './seed/qa-mdad/seed-ops';

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('QA seed must not run in production.');
  }

  const prisma = new PrismaClient();

  try {
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║  QA Seed: Midaad Ul Qalam — 750-Student Dataset        ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log();

    // Look up the mdad tenant (must exist from main seed)
    const tenant = await prisma.tenant.findUnique({ where: { slug: 'mdad' } });
    if (!tenant) {
      throw new Error(
        'MDAD tenant not found. Run the main seed first: pnpm --filter @school/prisma seed'
      );
    }
    const tenantId = tenant.id;
    console.log(`Tenant: ${tenant.name} (${tenantId})`);
    console.log();

    // Hash the dev password once (bcrypt is slow)
    console.log('Hashing dev password...');
    const passwordHash = await hashPassword(DEV_PASSWORD);

    // Step 1: Clean existing data
    console.log('\n━━━ Step 1/9: Clean existing MDAD data ━━━');
    await cleanMdadData(prisma, tenantId);

    // Step 2: Foundation — academic year, periods, year groups, subjects, rooms
    console.log('\n━━━ Step 2/9: Academic foundation ━━━');
    const foundation = await seedFoundation(prisma, tenantId);
    console.log(`  Created: 1 academic year, ${foundation.periodIds.length} periods, ${foundation.yearGroupIds.length} year groups, ${foundation.subjectIds.length} subjects, ${foundation.roomIds.length} rooms`);

    // Step 3: People — users, staff, households, parents, students
    console.log('\n━━━ Step 3/9: People ━━━');
    const people = await seedPeople(prisma, tenantId, foundation, passwordHash);
    console.log(`  Created: ${people.staff.length} staff, ${people.households.length} households, ${people.students.length} students`);

    // Step 4: Classes — homerooms, subject classes, enrolments
    console.log('\n━━━ Step 4/9: Classes & Enrolments ━━━');
    const classes = await seedClasses(prisma, tenantId, foundation, people);
    console.log(`  Created: ${classes.homerooms.length} homerooms, ${classes.subjectClasses.length} subject classes, total enrolments across all`);

    // Step 5: Schedule — period grid, curriculum, competencies, staff availability
    console.log('\n━━━ Step 5/9: Schedule & Curriculum ━━━');
    await seedSchedule(prisma, tenantId, foundation, people, classes);

    // Step 6: Grading — scales, categories, assessments, grades
    console.log('\n━━━ Step 6/9: Grading & Assessments ━━━');
    await seedGrading(prisma, tenantId, foundation, people, classes);

    // Step 7: Finance — fees, invoices, payments
    console.log('\n━━━ Step 7/9: Finance ━━━');
    await seedFinance(prisma, tenantId, foundation, people, people.ownerUserId);

    // Step 8: Payroll — compensations, runs, entries, payslips
    console.log('\n━━━ Step 8/9: Payroll ━━━');
    await seedPayroll(prisma, tenantId, people, people.ownerUserId);

    // Step 9: Attendance + Extras (admissions, comms, closures, website)
    console.log('\n━━━ Step 9/9: Attendance & Extras ━━━');
    await seedAttendance(prisma, tenantId, foundation, people, classes);
    await seedExtras(prisma, tenantId, foundation, people, people.ownerUserId);

    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║  QA Seed Complete!                                      ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log();
    console.log('Login credentials (all use Password123!):');
    console.log('  Owner/Principal:  owner@mdad.test');
    console.log('  Admin:            admin@mdad.test');
    console.log('  Teacher:          teacher@mdad.test');
    console.log('  Parent:           parent@mdad.test');
    console.log(`  + ${people.staff.length - 3} staff accounts ({name}.t/s{n}@mdad.test)`);
    console.log(`  + ${people.parentUserIds.length} parent portal accounts`);
    console.log();
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('QA Seed failed:', err);
  process.exit(1);
});
