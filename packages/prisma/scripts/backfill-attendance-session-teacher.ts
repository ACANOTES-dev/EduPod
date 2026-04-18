/**
 * Backfill attendance_sessions.teacher_staff_id for rows created before
 * Step 3 of the attendance hardening plan shipped.
 *
 * Precedence:
 *   1. If session.schedule_id is set → use schedules.teacher_staff_id.
 *   2. Otherwise (daily capture mode) → use classes.homeroom_teacher_staff_id.
 *   3. If neither source has a value, leave the session NULL — it will
 *      simply not be markable by a regular teacher until an admin assigns
 *      the class a homeroom or the schedule a teacher.
 *
 * Idempotent: only touches rows where teacher_staff_id IS NULL.
 *
 * Run: npx tsx packages/prisma/scripts/backfill-attendance-session-teacher.ts
 */
/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';

const connectionString = process.env.DATABASE_MIGRATE_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_MIGRATE_URL or DATABASE_URL must be set');
const prisma = new PrismaClient({ datasources: { db: { url: connectionString } } });

async function main() {
  const missing = await prisma.attendanceSession.findMany({
    where: { teacher_staff_id: null },
    select: {
      id: true,
      schedule_id: true,
      class_id: true,
      schedule: { select: { teacher_staff_id: true } },
      class_entity: { select: { homeroom_teacher_staff_id: true } },
    },
  });

  console.log(`Found ${missing.length} sessions without teacher_staff_id.`);

  let fromSchedule = 0;
  let fromHomeroom = 0;
  let stillMissing = 0;

  for (const session of missing) {
    const teacherId =
      session.schedule?.teacher_staff_id ?? session.class_entity.homeroom_teacher_staff_id ?? null;

    if (!teacherId) {
      stillMissing++;
      continue;
    }

    await prisma.attendanceSession.update({
      where: { id: session.id },
      data: { teacher_staff_id: teacherId },
    });

    if (session.schedule?.teacher_staff_id) {
      fromSchedule++;
    } else {
      fromHomeroom++;
    }
  }

  console.log(`Backfilled ${fromSchedule} from schedule.teacher_staff_id`);
  console.log(`Backfilled ${fromHomeroom} from class.homeroom_teacher_staff_id`);
  console.log(`Still without a teacher: ${stillMissing}`);
  console.log('Done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
