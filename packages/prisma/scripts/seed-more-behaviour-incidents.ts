/**
 * Seeds 50 additional varied behaviour incidents, concentrated so that at
 * least three students accumulate enough negative signal to cross early-warning
 * tiers (yellow / amber / red) after the thresholds were lowered to
 * yellow=15 / amber=30 / red=50.
 *
 * Distribution:
 *   - 3 "red-risk" students: ~6 severe negative incidents each (18 total)
 *   - 4 "amber-risk" students: ~3 mid-severity negative incidents each (12 total)
 *   - 5 "yellow-watch" students: ~2 mild-negative incidents each (10 total)
 *   - 10 positive incidents distributed broadly across the student body
 *
 * Idempotency: every seeded incident carries an idempotency_key starting with
 * 'ew-seed-' so re-running is safe (duplicates are skipped at create time by
 * the service, and the Prisma client's findFirst check short-circuits here).
 *
 * Usage:
 *   npx tsx packages/prisma/scripts/seed-more-behaviour-incidents.ts [--tenant=<id>]
 *
 * Default tenant: NHQS (3ba9b02c-0339-49b8-8583-a06e05a32ac5).
 */
/* eslint-disable no-console -- seed script uses console for progress */
import { PrismaClient, Prisma, ContextType } from '@prisma/client';

const connectionString = process.env.DATABASE_MIGRATE_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_MIGRATE_URL or DATABASE_URL must be set');
const prisma = new PrismaClient({ datasources: { db: { url: connectionString } } });

const NHQS_TENANT_ID = '3ba9b02c-0339-49b8-8583-a06e05a32ac5';
const MARKER = 'ew-seed';

type Args = { tenantId: string };
function parseArgs(): Args {
  const args = process.argv.slice(2);
  const tArg = args.find((a) => a.startsWith('--tenant='));
  return { tenantId: tArg ? (tArg.split('=')[1] ?? NHQS_TENANT_ID) : NHQS_TENANT_ID };
}

function daysAgo(d: number): Date {
  const out = new Date();
  out.setDate(out.getDate() - d);
  out.setHours(9 + (d % 8), (d * 7) % 60, 0, 0);
  return out;
}

// ─── Pattern plans ──────────────────────────────────────────────────────────

type Plan = {
  categoryPolarityMin: number; // 1-10, matches against category.severity
  categoryPolarityMax: number;
  categoryPolarity: 'negative' | 'positive';
  daysAgoOccurred: number;
  description: string;
  parentDescription: string | null;
  contextType: ContextType;
  location: string | null;
  status: 'active' | 'resolved' | 'investigating' | 'under_review';
};

function negPlan(
  sevMin: number,
  sevMax: number,
  d: number,
  desc: string,
  parent: string | null,
  ctx: ContextType,
  loc: string | null,
  status: Plan['status'] = 'active',
): Plan {
  return {
    categoryPolarityMin: sevMin,
    categoryPolarityMax: sevMax,
    categoryPolarity: 'negative',
    daysAgoOccurred: d,
    description: desc,
    parentDescription: parent,
    contextType: ctx,
    location: loc,
    status,
  };
}

function posPlan(
  sevMin: number,
  sevMax: number,
  d: number,
  desc: string,
  parent: string | null,
  ctx: ContextType,
  loc: string | null,
): Plan {
  return {
    categoryPolarityMin: sevMin,
    categoryPolarityMax: sevMax,
    categoryPolarity: 'positive',
    daysAgoOccurred: d,
    description: desc,
    parentDescription: parent,
    contextType: ctx,
    location: loc,
    status: 'resolved',
  };
}

const SEVERE_NEG_PATTERNS: Plan[] = [
  negPlan(
    7,
    8,
    2,
    'Physical altercation during break — mediated by staff.',
    'Your child was involved in a physical altercation. A meeting is required.',
    'break_',
    'Courtyard',
    'investigating',
  ),
  negPlan(
    7,
    8,
    9,
    'Repeat fighting incident; pre-existing behaviour concern.',
    'Second physical incident this term.',
    'class_',
    'Room 4A',
    'under_review',
  ),
  negPlan(
    7,
    8,
    15,
    'Aggressive language toward a staff member.',
    'Disrespect to teacher documented.',
    'class_',
    'Room 3B',
    'resolved',
  ),
  negPlan(
    7,
    8,
    22,
    'Vandalism of school property.',
    'Damage to notice board — reparation agreed.',
    'break_',
    'Main hallway',
    'resolved',
  ),
  negPlan(
    7,
    8,
    28,
    'Serious disruption during assembly.',
    'Continuous disruption led to removal.',
    'other',
    'Assembly hall',
    'resolved',
  ),
  negPlan(
    7,
    8,
    34,
    'Third repeat offence this month — suspension issued.',
    'External suspension follows review meeting.',
    'class_',
    'Room 2A',
    'resolved',
  ),
  negPlan(
    4,
    6,
    4,
    'Persistent phone use after multiple warnings.',
    'Phone confiscated until parent collection.',
    'class_',
    'Room 5A',
    'resolved',
  ),
  negPlan(
    4,
    6,
    11,
    'Detention — missed homework 3rd time this fortnight.',
    null,
    'class_',
    'Room 4A',
    'resolved',
  ),
  negPlan(
    4,
    6,
    18,
    'Written warning for disruptive behaviour in group work.',
    'Disrupted peer learning.',
    'class_',
    'Room 6B',
    'resolved',
  ),
  negPlan(4, 6, 25, 'Detention for skipping PE.', null, 'class_', 'PE hall', 'resolved'),
  negPlan(
    4,
    6,
    32,
    'Written warning — uniform violations x3.',
    null,
    'before_school',
    'Entrance',
    'resolved',
  ),
  negPlan(
    4,
    6,
    40,
    'Detention — lateness to 4 consecutive lessons.',
    null,
    'class_',
    'Room 3A',
    'resolved',
  ),
  negPlan(2, 3, 3, 'Verbal warning — talking over teacher.', null, 'class_', 'Room 7A', 'resolved'),
  negPlan(2, 3, 13, 'Verbal warning — chewing gum.', null, 'class_', 'Room 4A', 'resolved'),
  negPlan(2, 3, 20, 'Verbal warning — late to lesson.', null, 'class_', 'Room 5B', 'resolved'),
  negPlan(2, 3, 27, 'Verbal warning — lost PE kit again.', null, 'class_', 'PE hall', 'resolved'),
  negPlan(
    2,
    3,
    37,
    'Verbal warning — forgot textbook twice in a week.',
    null,
    'class_',
    'Room 2B',
    'resolved',
  ),
];

const MODERATE_NEG_PATTERNS: Plan[] = [
  negPlan(
    4,
    6,
    6,
    'Written warning for disruptive behaviour.',
    'Disruptive behaviour in maths class.',
    'class_',
    'Room 4A',
    'resolved',
  ),
  negPlan(4, 6, 17, 'Detention — missed deadline twice.', null, 'class_', 'Room 5A', 'resolved'),
  negPlan(
    4,
    6,
    29,
    'Written warning — minor physical contact in corridor.',
    null,
    'break_',
    'Main corridor',
    'resolved',
  ),
  negPlan(2, 3, 8, 'Verbal warning — phone on desk.', null, 'class_', 'Room 3B', 'resolved'),
  negPlan(
    2,
    3,
    24,
    'Verbal warning — talking during silent reading.',
    null,
    'class_',
    'Library',
    'resolved',
  ),
];

const LIGHT_NEG_PATTERNS: Plan[] = [
  negPlan(
    2,
    3,
    10,
    'Verbal warning — forgot to sign in.',
    null,
    'before_school',
    'Reception',
    'resolved',
  ),
  negPlan(
    2,
    3,
    21,
    'Note to file — minor dress-code issue.',
    null,
    'before_school',
    'Entrance',
    'resolved',
  ),
];

const POSITIVE_PATTERNS: Plan[] = [
  posPlan(
    1,
    3,
    5,
    'Excellent class participation in science.',
    "Strong effort in today's experiment.",
    'class_',
    'Lab A',
  ),
  posPlan(
    3,
    5,
    12,
    'Helped a peer understand a maths concept.',
    'Kindness to a classmate recognised.',
    'class_',
    'Room 5A',
  ),
  posPlan(
    3,
    5,
    19,
    'Consistent homework effort for 4 weeks.',
    'Well done on consistent effort.',
    'class_',
    'Room 6B',
  ),
  posPlan(
    5,
    8,
    26,
    'Outstanding performance in debate competition.',
    'Represented the school with distinction.',
    'extra_curricular',
    'Debate hall',
  ),
  posPlan(1, 3, 33, 'Positive attitude throughout assembly.', null, 'other', 'Assembly hall'),
  posPlan(1, 3, 2, 'Tidy uniform and punctual all week.', null, 'class_', 'Room 2A'),
  posPlan(
    3,
    5,
    14,
    'Initiative in organising library display.',
    'Volunteer leadership noted.',
    'other',
    'Library',
  ),
  posPlan(
    5,
    8,
    30,
    "Principal's Award — sustained academic excellence.",
    'Awarded for sustained academic performance this term.',
    'class_',
    'Room 8A',
  ),
  posPlan(1, 3, 7, 'Active participation in PE lesson.', null, 'class_', 'PE hall'),
  posPlan(
    1,
    3,
    35,
    'Kind word to a new student on arrival.',
    'Welcoming behaviour to new classmate.',
    'before_school',
    'Reception',
  ),
];

async function pickCategory(
  tx: Prisma.TransactionClient,
  tenantId: string,
  polarity: 'negative' | 'positive',
  sevMin: number,
  sevMax: number,
): Promise<{
  id: string;
  severity: number;
  point_value: number;
  parent_visible: boolean;
  requires_follow_up: boolean;
} | null> {
  const match = await tx.behaviourCategory.findFirst({
    where: {
      tenant_id: tenantId,
      is_active: true,
      polarity,
      severity: { gte: sevMin, lte: sevMax },
    },
    orderBy: { severity: 'desc' },
    select: {
      id: true,
      severity: true,
      point_value: true,
      parent_visible: true,
      requires_follow_up: true,
    },
  });
  return match;
}

async function getAcademicYearId(tenantId: string): Promise<string | null> {
  const active = await prisma.academicYear.findFirst({
    where: { tenant_id: tenantId, status: 'active' },
    select: { id: true },
  });
  if (active) return active.id;
  const any = await prisma.academicYear.findFirst({
    where: { tenant_id: tenantId },
    orderBy: { start_date: 'desc' },
    select: { id: true },
  });
  return any?.id ?? null;
}

async function pickReporterUserId(tenantId: string): Promise<string> {
  const membership = await prisma.tenantMembership.findFirst({
    where: { tenant_id: tenantId, membership_status: 'active' },
    orderBy: { created_at: 'asc' },
    select: { user_id: true },
  });
  if (!membership) throw new Error(`No active membership for tenant ${tenantId}`);
  return membership.user_id;
}

async function pickStudents(tenantId: string): Promise<{
  redRisk: string[];
  amberRisk: string[];
  yellowWatch: string[];
  broad: string[];
}> {
  const students = await prisma.student.findMany({
    where: { tenant_id: tenantId, status: 'active' },
    orderBy: { created_at: 'asc' },
    select: { id: true, first_name: true, last_name: true },
    take: 60,
  });
  if (students.length < 20) {
    throw new Error(`Need at least 20 active students, found ${students.length}`);
  }
  // Deterministic pick so re-runs target the same cohort
  const redRisk = students.slice(0, 3).map((s) => s.id);
  const amberRisk = students.slice(3, 7).map((s) => s.id);
  const yellowWatch = students.slice(7, 12).map((s) => s.id);
  const broad = students.slice(12, 30).map((s) => s.id);
  return { redRisk, amberRisk, yellowWatch, broad };
}

async function pickStudentSnapshot(studentId: string) {
  const s = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      year_group: { select: { id: true, name: true } },
      class_enrolments: {
        where: { status: 'active' },
        take: 1,
        include: { class_entity: { select: { name: true } } },
      },
    },
  });
  if (!s) throw new Error(`Student ${studentId} not found`);
  return {
    student_name: `${s.first_name} ${s.last_name}`,
    year_group_id: s.year_group?.id ?? null,
    year_group_name: s.year_group?.name ?? null,
    class_name: s.class_enrolments?.[0]?.class_entity?.name ?? null,
    has_send: false,
    house_id: null,
    house_name: null,
    had_active_intervention: false,
    active_intervention_ids: [],
  };
}

async function seedOneIncident(
  tenantId: string,
  plan: Plan,
  studentId: string,
  reporterUserId: string,
  academicYearId: string,
  seq: number,
): Promise<'created' | 'skipped' | 'no-category'> {
  const idempotency_key = `${MARKER}-${seq.toString().padStart(3, '0')}`;

  // Idempotency: skip if incident with this key already present
  const existing = await prisma.behaviourIncident.findFirst({
    where: { tenant_id: tenantId, idempotency_key },
    select: { id: true },
  });
  if (existing) return 'skipped';

  return prisma.$transaction(async (tx) => {
    const category = await pickCategory(
      tx,
      tenantId,
      plan.categoryPolarity,
      plan.categoryPolarityMin,
      plan.categoryPolarityMax,
    );
    if (!category) return 'no-category' as const;

    const occurredAt = daysAgo(plan.daysAgoOccurred);

    // Allocate a unique incident_number by using the tenant_sequences-free fast path
    // — seed scripts bypass the sequence service; we stamp a sentinel-prefix number.
    const incidentNumber = `EW-${seq.toString().padStart(4, '0')}`;

    const incident = await tx.behaviourIncident.create({
      data: {
        tenant_id: tenantId,
        incident_number: incidentNumber,
        idempotency_key,
        category_id: category.id,
        polarity: plan.categoryPolarity,
        severity: category.severity,
        reported_by_id: reporterUserId,
        description: plan.description,
        parent_description: plan.parentDescription,
        context_notes: null,
        location: plan.location,
        context_type: plan.contextType,
        occurred_at: occurredAt,
        academic_year_id: academicYearId,
        status: plan.status,
        follow_up_required: category.requires_follow_up,
      },
    });

    const snapshot = await pickStudentSnapshot(studentId);
    const signedPoints =
      plan.categoryPolarity === 'negative' ? -category.point_value : category.point_value;

    await tx.behaviourIncidentParticipant.create({
      data: {
        tenant_id: tenantId,
        incident_id: incident.id,
        participant_type: 'student',
        student_id: studentId,
        role: 'subject',
        points_awarded: signedPoints,
        parent_visible: category.parent_visible,
        student_snapshot: snapshot as unknown as Prisma.InputJsonValue,
      },
    });

    return 'created' as const;
  });
}

async function main() {
  const { tenantId } = parseArgs();
  console.log(`Seeding 50 additional behaviour incidents for tenant ${tenantId} …`);

  const academicYearId = await getAcademicYearId(tenantId);
  if (!academicYearId) throw new Error(`No academic year found for tenant ${tenantId}`);
  const reporterUserId = await pickReporterUserId(tenantId);
  const cohort = await pickStudents(tenantId);

  console.log(
    `  Cohort sizes — red:${cohort.redRisk.length} amber:${cohort.amberRisk.length} yellow:${cohort.yellowWatch.length} broad:${cohort.broad.length}`,
  );

  let seq = 0;
  let created = 0;
  let skipped = 0;
  let missingCategory = 0;

  // Severe incidents across red-risk students (6 × 3 = 18, using first 18 SEVERE)
  for (let i = 0; i < 18 && i < SEVERE_NEG_PATTERNS.length; i++) {
    const plan = SEVERE_NEG_PATTERNS[i]!;
    const student = cohort.redRisk[i % cohort.redRisk.length]!;
    seq++;
    const r = await seedOneIncident(tenantId, plan, student, reporterUserId, academicYearId, seq);
    if (r === 'created') created++;
    else if (r === 'skipped') skipped++;
    else missingCategory++;
  }

  // Moderate across amber-risk (3 × 4 = 12)
  for (let i = 0; i < 12; i++) {
    const plan = MODERATE_NEG_PATTERNS[i % MODERATE_NEG_PATTERNS.length]!;
    const student = cohort.amberRisk[i % cohort.amberRisk.length]!;
    seq++;
    const r = await seedOneIncident(tenantId, plan, student, reporterUserId, academicYearId, seq);
    if (r === 'created') created++;
    else if (r === 'skipped') skipped++;
    else missingCategory++;
  }

  // Light across yellow-watch (2 × 5 = 10)
  for (let i = 0; i < 10; i++) {
    const plan = LIGHT_NEG_PATTERNS[i % LIGHT_NEG_PATTERNS.length]!;
    const student = cohort.yellowWatch[i % cohort.yellowWatch.length]!;
    seq++;
    const r = await seedOneIncident(tenantId, plan, student, reporterUserId, academicYearId, seq);
    if (r === 'created') created++;
    else if (r === 'skipped') skipped++;
    else missingCategory++;
  }

  // Positives across broad cohort (10)
  for (let i = 0; i < 10; i++) {
    const plan = POSITIVE_PATTERNS[i % POSITIVE_PATTERNS.length]!;
    const student = cohort.broad[i % cohort.broad.length]!;
    seq++;
    const r = await seedOneIncident(tenantId, plan, student, reporterUserId, academicYearId, seq);
    if (r === 'created') created++;
    else if (r === 'skipped') skipped++;
    else missingCategory++;
  }

  // ─── Sanctions for the 3 red-risk students ────────────────────────────────
  // Behaviour signal collector awards 30 points for an active suspension
  // sanction; this is the most reliable way to move a student past red.
  let sanctionsCreated = 0;
  for (let i = 0; i < cohort.redRisk.length; i++) {
    const studentId = cohort.redRisk[i]!;
    sanctionsCreated += (await seedActiveSanction(tenantId, studentId, reporterUserId, i)) ? 1 : 0;
  }

  // ─── Pastoral concerns for red + amber students ──────────────────────────
  // Active pastoral concern adds wellbeing-domain signal, giving multi-domain
  // coverage that crosses amber cleanly.
  let concernsCreated = 0;
  for (const studentId of [...cohort.redRisk, ...cohort.amberRisk]) {
    concernsCreated += (await seedActivePastoralConcern(tenantId, studentId, reporterUserId))
      ? 1
      : 0;
  }

  console.log(
    `Done. ${created} incidents created, ${skipped} skipped, ${missingCategory} missing-category; ${sanctionsCreated} sanctions, ${concernsCreated} pastoral concerns.`,
  );
}

async function seedActiveSanction(
  tenantId: string,
  studentId: string,
  issuerUserId: string,
  seq: number,
): Promise<boolean> {
  const sanctionNumber = `EW-SN-${seq.toString().padStart(3, '0')}`;
  const existing = await prisma.behaviourSanction.findFirst({
    where: { tenant_id: tenantId, sanction_number: sanctionNumber },
    select: { id: true },
  });
  if (existing) return false;

  // Link sanction to the student's most recent incident
  const anyIncident = await prisma.behaviourIncidentParticipant.findFirst({
    where: { tenant_id: tenantId, student_id: studentId, participant_type: 'student' },
    orderBy: { created_at: 'desc' },
    select: { incident_id: true },
  });
  if (!anyIncident) return false;

  const scheduledDate = new Date();
  scheduledDate.setDate(scheduledDate.getDate() + 3);
  const suspensionEnd = new Date(scheduledDate);
  suspensionEnd.setDate(suspensionEnd.getDate() + 2);

  await prisma.behaviourSanction.create({
    data: {
      tenant_id: tenantId,
      sanction_number: sanctionNumber,
      incident_id: anyIncident.incident_id,
      student_id: studentId,
      type: 'suspension_internal',
      status: 'scheduled',
      approval_status: 'not_required',
      scheduled_date: scheduledDate,
      supervised_by_id: issuerUserId,
      suspension_start_date: scheduledDate,
      suspension_end_date: suspensionEnd,
      suspension_days: 2,
      notes: `[${MARKER}] Internal suspension — concentrated pattern of negative incidents.`,
    },
  });
  return true;
}

async function seedActivePastoralConcern(
  tenantId: string,
  studentId: string,
  loggedByUserId: string,
): Promise<boolean> {
  const importHash = `${MARKER}-concern-${studentId.slice(0, 8)}`;
  const existing = await prisma.pastoralConcern.findFirst({
    where: { tenant_id: tenantId, import_hash: importHash },
    select: { id: true },
  });
  if (existing) return false;

  await prisma.pastoralConcern.create({
    data: {
      tenant_id: tenantId,
      student_id: studentId,
      logged_by_user_id: loggedByUserId,
      category: 'behavioural',
      severity: 'elevated',
      tier: 1,
      occurred_at: new Date(),
      location: 'Classroom',
      actions_taken: 'Pastoral lead engaged; reviewing support options with year head.',
      follow_up_needed: true,
      import_hash: importHash,
    },
  });
  return true;
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
