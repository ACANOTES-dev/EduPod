/**
 * Wellbeing E2E walkthrough seed (S0 of the ship-gate review).
 *
 * Tenant: NHQS (3ba9b02c-0339-49b8-8583-a06e05a32ac5)
 *
 * Seeds:
 *   - 4 behaviour house teams + memberships for active students
 *   - 3 behaviour award types (bronze / silver / gold)
 *   - 50 behaviour incidents (varied categories, 6-week date spread, with
 *     participants + some sanctions + some recognition awards)
 *   - 5 pastoral concerns (mix of severities, some linked to behaviour)
 *   - 3 pastoral cases + 1 pastoral intervention + 3 pastoral referrals
 *   - 4 safeguarding concerns (mix of severities, one sealed)
 *   - 2 safeguarding actions
 *   - 1 expired break-glass grant
 *   - 1 early-warning config (enabled)
 *   - 1 active staff wellbeing survey + 5 responses
 *   - 1 closed staff wellbeing survey + 15 responses
 *
 * Modes:
 *   --mode seed        (default) Seed everything; idempotent via teardown+reseed on marked rows.
 *   --mode teardown    Delete all seeded rows (marked via s0-wbr-* prefixes / import_hash).
 *
 * Idempotency:
 *   Every seeded row carries a recognisable marker:
 *     - BehaviourIncident.idempotency_key      starts with 's0-wbr-'
 *     - BehaviourSanction.sanction_number      starts with 'SN-S0-'
 *     - BehaviourRecognitionAward.notes        starts with '[s0-wbr]'
 *     - BehaviourHouseTeam.name                one of four sentinel names
 *     - BehaviourAwardType.name                starts with 'S0-WBR '
 *     - PastoralConcern.import_hash            starts with 's0-wbr-'
 *     - PastoralCase.case_number               starts with 'PC-S0-'
 *     - PastoralIntervention.outcome_notes     starts with '[s0-wbr]'
 *     - PastoralReferral.recommendation        starts with '[s0-wbr]'  (via referral notes)
 *     - SafeguardingConcern.concern_number     starts with 'SG-S0-'
 *     - SafeguardingBreakGlassGrant.reason     starts with '[s0-wbr]'
 *     - StaffSurvey.title                      starts with 'S0-WBR '
 *     - EarlyWarningConfig                     upserted on (tenant_id) — one row per tenant anyway
 *
 * Run on server:
 *   cd /opt/edupod/app && \
 *     set -a; source /opt/edupod/app/.env; set +a && \
 *     npx tsx packages/prisma/scripts/seed-wellbeing-walkthrough.ts --mode seed
 */
/* eslint-disable no-console -- seed script uses console for progress */
import {
  PrismaClient,
  Prisma,
  ContextType,
  PastoralConcernSeverity,
  PastoralCaseStatus,
  PastoralReferralStatus,
  SafeguardingConcernType,
  SafeguardingSeverity,
  SafeguardingStatus,
  SafeguardingActionType,
} from '@prisma/client';

const connectionString = process.env.DATABASE_MIGRATE_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_MIGRATE_URL or DATABASE_URL must be set');
const prisma = new PrismaClient({ datasources: { db: { url: connectionString } } });

const NHQS_TENANT_ID = '3ba9b02c-0339-49b8-8583-a06e05a32ac5';
const MARKER = 's0-wbr';

// ─── Helpers ─────────────────────────────────────────────────────────────────

type Args = { mode: 'seed' | 'teardown' };

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const modeIdx = args.indexOf('--mode');
  const modeVal = modeIdx >= 0 ? args[modeIdx + 1] : 'seed';
  if (modeVal !== 'seed' && modeVal !== 'teardown') {
    throw new Error(`--mode must be 'seed' or 'teardown', got '${modeVal ?? ''}'`);
  }
  return { mode: modeVal };
}

function daysAgo(d: number): Date {
  const now = new Date();
  const out = new Date(now);
  out.setDate(out.getDate() - d);
  return out;
}

function pick<T>(arr: readonly T[], i: number): T {
  const v = arr[i % arr.length];
  if (v === undefined) throw new Error('pick: empty array');
  return v;
}

// ─── House teams ─────────────────────────────────────────────────────────────

const HOUSES = [
  { name: 'Aqila', color: '#e11d48' },
  { name: 'Furqan', color: '#2563eb' },
  { name: 'Hikma', color: '#16a34a' },
  { name: 'Siraj', color: '#f59e0b' },
] as const;

// ─── Incident plan — 50 varied records ───────────────────────────────────────

type IncidentPlan = {
  key: string; // s0-wbr-XXX (fits in 36 char idempotency_key)
  categoryName: string;
  daysAgoOccurred: number;
  description: string;
  parentDescription: string | null;
  contextType: ContextType;
  location: string | null;
  status: 'active' | 'resolved' | 'investigating' | 'under_review' | 'draft';
  attachSanction?: {
    type:
      | 'detention'
      | 'suspension_internal'
      | 'suspension_external'
      | 'community_service'
      | 'loss_of_privilege'
      | 'restorative_meeting';
    daysAgoScheduled: number;
  };
  attachRecognition?: 'bronze' | 'silver' | 'gold';
};

const PLAN: IncidentPlan[] = [
  // Lateness x 8
  {
    key: 's0-wbr-001',
    categoryName: 'Lateness',
    daysAgoOccurred: 38,
    description: 'Arrived 12 minutes late to morning assembly.',
    parentDescription: 'Late to school this morning.',
    contextType: ContextType.before_school,
    location: 'Main entrance',
    status: 'resolved',
  },
  {
    key: 's0-wbr-002',
    categoryName: 'Lateness',
    daysAgoOccurred: 31,
    description: 'Late to maths class, no reason given.',
    parentDescription: 'Late to first period.',
    contextType: ContextType.class_,
    location: 'Room M3',
    status: 'resolved',
  },
  {
    key: 's0-wbr-003',
    categoryName: 'Lateness',
    daysAgoOccurred: 26,
    description: 'Late returning from break.',
    parentDescription: 'Late from break.',
    contextType: ContextType.break_,
    location: 'Yard',
    status: 'active',
  },
  {
    key: 's0-wbr-004',
    categoryName: 'Lateness',
    daysAgoOccurred: 21,
    description: 'Late to school after missing the bus.',
    parentDescription: 'Missed the bus today.',
    contextType: ContextType.before_school,
    location: null,
    status: 'resolved',
  },
  {
    key: 's0-wbr-005',
    categoryName: 'Lateness',
    daysAgoOccurred: 15,
    description: 'Late returning from lunch, third time this month.',
    parentDescription: 'Pattern of lateness developing.',
    contextType: ContextType.lunch,
    location: 'Yard',
    status: 'active',
    attachSanction: { type: 'detention', daysAgoScheduled: -2 },
  },
  {
    key: 's0-wbr-006',
    categoryName: 'Lateness',
    daysAgoOccurred: 10,
    description: 'Late to English.',
    parentDescription: 'Late to English class.',
    contextType: ContextType.class_,
    location: 'Room E1',
    status: 'resolved',
  },
  {
    key: 's0-wbr-007',
    categoryName: 'Lateness',
    daysAgoOccurred: 6,
    description: 'Late to school.',
    parentDescription: 'Late again.',
    contextType: ContextType.before_school,
    location: null,
    status: 'active',
  },
  {
    key: 's0-wbr-008',
    categoryName: 'Lateness',
    daysAgoOccurred: 2,
    description: 'Late arriving to science lab.',
    parentDescription: null,
    contextType: ContextType.class_,
    location: 'Science Lab 2',
    status: 'active',
  },

  // Uniform x 6
  {
    key: 's0-wbr-009',
    categoryName: 'Uniform infringement',
    daysAgoOccurred: 35,
    description: 'Non-uniform shoes.',
    parentDescription: 'Shoes not to uniform standard.',
    contextType: ContextType.class_,
    location: null,
    status: 'resolved',
  },
  {
    key: 's0-wbr-010',
    categoryName: 'Uniform infringement',
    daysAgoOccurred: 28,
    description: 'Hoodie worn over uniform.',
    parentDescription: null,
    contextType: ContextType.break_,
    location: 'Yard',
    status: 'resolved',
  },
  {
    key: 's0-wbr-011',
    categoryName: 'Uniform infringement',
    daysAgoOccurred: 22,
    description: 'No tie.',
    parentDescription: 'No school tie today.',
    contextType: ContextType.class_,
    location: null,
    status: 'resolved',
  },
  {
    key: 's0-wbr-012',
    categoryName: 'Uniform infringement',
    daysAgoOccurred: 14,
    description: 'Visible jewellery and nail polish.',
    parentDescription: 'Please review uniform policy.',
    contextType: ContextType.class_,
    location: null,
    status: 'active',
  },
  {
    key: 's0-wbr-013',
    categoryName: 'Uniform infringement',
    daysAgoOccurred: 8,
    description: 'Non-uniform jumper.',
    parentDescription: null,
    contextType: ContextType.class_,
    location: null,
    status: 'active',
  },
  {
    key: 's0-wbr-014',
    categoryName: 'Uniform infringement',
    daysAgoOccurred: 3,
    description: 'Tracksuit worn on non-PE day.',
    parentDescription: 'Tracksuit not permitted today.',
    contextType: ContextType.before_school,
    location: null,
    status: 'active',
  },

  // Disruption x 6  (mix of low + sustained)
  {
    key: 's0-wbr-015',
    categoryName: 'Disruption (low)',
    daysAgoOccurred: 40,
    description: 'Talking during quiet work.',
    parentDescription: 'Disruptive in class.',
    contextType: ContextType.class_,
    location: 'Room H2',
    status: 'resolved',
  },
  {
    key: 's0-wbr-016',
    categoryName: 'Disruption (low)',
    daysAgoOccurred: 32,
    description: 'Tapping desk loudly during instruction.',
    parentDescription: null,
    contextType: ContextType.class_,
    location: 'Room M1',
    status: 'resolved',
  },
  {
    key: 's0-wbr-017',
    categoryName: 'Disruption (sustained)',
    daysAgoOccurred: 24,
    description: 'Repeatedly calling out despite two warnings.',
    parentDescription: 'Sustained disruption over the lesson.',
    contextType: ContextType.class_,
    location: 'Room E2',
    status: 'active',
    attachSanction: { type: 'detention', daysAgoScheduled: -1 },
  },
  {
    key: 's0-wbr-018',
    categoryName: 'Disruption (sustained)',
    daysAgoOccurred: 17,
    description: 'Wandering around the class, throwing paper.',
    parentDescription: 'Please talk to Ciara about classroom behaviour.',
    contextType: ContextType.class_,
    location: 'Room A1',
    status: 'active',
  },
  {
    key: 's0-wbr-019',
    categoryName: 'Disruption (low)',
    daysAgoOccurred: 9,
    description: 'Shouting across the room.',
    parentDescription: null,
    contextType: ContextType.class_,
    location: null,
    status: 'active',
  },
  {
    key: 's0-wbr-020',
    categoryName: 'Disruption (low)',
    daysAgoOccurred: 4,
    description: 'Off-task, distracting others.',
    parentDescription: 'Please encourage focus at home.',
    contextType: ContextType.class_,
    location: null,
    status: 'active',
  },

  // Fighting x 3 (high severity)
  {
    key: 's0-wbr-021',
    categoryName: 'Fighting',
    daysAgoOccurred: 36,
    description: 'Physical altercation in the yard. Separated by staff. No injuries.',
    parentDescription: 'Physical incident between two students — please come in to discuss.',
    contextType: ContextType.break_,
    location: 'Yard',
    status: 'resolved',
    attachSanction: { type: 'suspension_internal', daysAgoScheduled: -34 },
  },
  {
    key: 's0-wbr-022',
    categoryName: 'Fighting',
    daysAgoOccurred: 20,
    description: 'Pushing and shoving in the corridor escalating to blows.',
    parentDescription: 'Serious fight today — meeting required.',
    contextType: ContextType.other,
    location: 'Corridor C2',
    status: 'investigating',
    attachSanction: { type: 'suspension_internal', daysAgoScheduled: -18 },
  },
  {
    key: 's0-wbr-023',
    categoryName: 'Fighting',
    daysAgoOccurred: 5,
    description: 'Fight during lunch, minor bruising to one student.',
    parentDescription: 'Fight at lunchtime — please collect today.',
    contextType: ContextType.lunch,
    location: 'Canteen',
    status: 'under_review',
    attachSanction: { type: 'suspension_external', daysAgoScheduled: -3 },
  },

  // Weapons-related x 1 (highest)
  {
    key: 's0-wbr-024',
    categoryName: 'Weapons-related concern',
    daysAgoOccurred: 12,
    description:
      'Pocket knife found in bag during random search. Taken into custody, police contacted per policy.',
    parentDescription:
      'Urgent — immediate collection required. Senior leadership meeting to follow.',
    contextType: ContextType.other,
    location: "Student's locker area",
    status: 'investigating',
    attachSanction: { type: 'suspension_external', daysAgoScheduled: -10 },
  },

  // Bullying x 3  (one repeat to drive pattern)
  {
    key: 's0-wbr-025',
    categoryName: 'Bullying (verbal)',
    daysAgoOccurred: 34,
    description: 'Repeated name-calling directed at one classmate.',
    parentDescription: 'Verbal bullying concern raised today — investigation underway.',
    contextType: ContextType.break_,
    location: 'Yard',
    status: 'under_review',
  },
  {
    key: 's0-wbr-026',
    categoryName: 'Bullying (verbal)',
    daysAgoOccurred: 19,
    description:
      'Continued verbal targeting of the same classmate despite prior intervention. REPEAT OFFENCE.',
    parentDescription: 'Continued bullying — serious follow-up now needed.',
    contextType: ContextType.class_,
    location: 'Room E1',
    status: 'active',
    attachSanction: { type: 'restorative_meeting', daysAgoScheduled: -15 },
  },
  {
    key: 's0-wbr-027',
    categoryName: 'Bullying (physical/cyber)',
    daysAgoOccurred: 7,
    description: 'Reported online bullying via group chat. Screenshots reviewed.',
    parentDescription: 'Online bullying raised — investigating with safeguarding.',
    contextType: ContextType.online,
    location: null,
    status: 'investigating',
  },

  // Effort x 6 (positive)
  {
    key: 's0-wbr-028',
    categoryName: 'Effort',
    daysAgoOccurred: 41,
    description: 'Sustained excellent effort in maths all week.',
    parentDescription: 'Keep going — great effort.',
    contextType: ContextType.class_,
    location: null,
    status: 'resolved',
    attachRecognition: 'bronze',
  },
  {
    key: 's0-wbr-029',
    categoryName: 'Effort',
    daysAgoOccurred: 33,
    description: 'Outstanding effort on the science project.',
    parentDescription: 'Thrilled with the effort shown.',
    contextType: ContextType.class_,
    location: null,
    status: 'resolved',
    attachRecognition: 'silver',
  },
  {
    key: 's0-wbr-030',
    categoryName: 'Effort',
    daysAgoOccurred: 27,
    description: 'Exceptional effort revising for the assessment.',
    parentDescription: null,
    contextType: ContextType.class_,
    location: null,
    status: 'resolved',
    attachRecognition: 'bronze',
  },
  {
    key: 's0-wbr-031',
    categoryName: 'Effort',
    daysAgoOccurred: 18,
    description: 'Remarkable effort in maths despite challenging material.',
    parentDescription: 'Excellent effort.',
    contextType: ContextType.class_,
    location: null,
    status: 'resolved',
  },
  {
    key: 's0-wbr-032',
    categoryName: 'Effort',
    daysAgoOccurred: 11,
    description: 'Great effort in PE lesson.',
    parentDescription: null,
    contextType: ContextType.class_,
    location: 'Sports Hall',
    status: 'resolved',
  },
  {
    key: 's0-wbr-033',
    categoryName: 'Effort',
    daysAgoOccurred: 4,
    description: 'Kept working through the end of the lesson when others gave up.',
    parentDescription: 'Well done today.',
    contextType: ContextType.class_,
    location: null,
    status: 'resolved',
    attachRecognition: 'bronze',
  },

  // Helpfulness x 4 (positive)
  {
    key: 's0-wbr-034',
    categoryName: 'Helpfulness',
    daysAgoOccurred: 39,
    description: 'Helped a new student find their classroom.',
    parentDescription: 'Thank you for being welcoming.',
    contextType: ContextType.before_school,
    location: null,
    status: 'resolved',
  },
  {
    key: 's0-wbr-035',
    categoryName: 'Helpfulness',
    daysAgoOccurred: 25,
    description: 'Volunteered to tidy the library without being asked.',
    parentDescription: null,
    contextType: ContextType.lunch,
    location: 'Library',
    status: 'resolved',
    attachRecognition: 'bronze',
  },
  {
    key: 's0-wbr-036',
    categoryName: 'Helpfulness',
    daysAgoOccurred: 13,
    description: 'Supported a classmate who was struggling with a problem.',
    parentDescription: 'Great kindness shown today.',
    contextType: ContextType.class_,
    location: null,
    status: 'resolved',
  },
  {
    key: 's0-wbr-037',
    categoryName: 'Helpfulness',
    daysAgoOccurred: 1,
    description: 'Helped carry materials for a teacher.',
    parentDescription: null,
    contextType: ContextType.class_,
    location: null,
    status: 'resolved',
  },

  // Kindness x 4 (positive)
  {
    key: 's0-wbr-038',
    categoryName: 'Kindness',
    daysAgoOccurred: 37,
    description: 'Sat with a classmate who was eating alone.',
    parentDescription: 'Such a kind gesture.',
    contextType: ContextType.lunch,
    location: 'Canteen',
    status: 'resolved',
    attachRecognition: 'silver',
  },
  {
    key: 's0-wbr-039',
    categoryName: 'Kindness',
    daysAgoOccurred: 23,
    description: 'Stood up for a younger student being teased.',
    parentDescription: 'Very proud of this.',
    contextType: ContextType.break_,
    location: 'Yard',
    status: 'resolved',
    attachRecognition: 'silver',
  },
  {
    key: 's0-wbr-040',
    categoryName: 'Kindness',
    daysAgoOccurred: 16,
    description: 'Shared lunch with classmate who had forgotten theirs.',
    parentDescription: 'Thank you.',
    contextType: ContextType.lunch,
    location: 'Canteen',
    status: 'resolved',
  },
  {
    key: 's0-wbr-041',
    categoryName: 'Kindness',
    daysAgoOccurred: 6,
    description: 'Helped a younger student after they fell in the playground.',
    parentDescription: 'Wonderful kindness today.',
    contextType: ContextType.break_,
    location: 'Playground',
    status: 'resolved',
    attachRecognition: 'gold',
  },

  // Community contribution x 3 (positive)
  {
    key: 's0-wbr-042',
    categoryName: 'Community contribution',
    daysAgoOccurred: 29,
    description: 'Organised the charity bake sale.',
    parentDescription: 'Great community spirit.',
    contextType: ContextType.lunch,
    location: null,
    status: 'resolved',
    attachRecognition: 'gold',
  },
  {
    key: 's0-wbr-043',
    categoryName: 'Community contribution',
    daysAgoOccurred: 14,
    description: 'Led peer-reading session for infants.',
    parentDescription: null,
    contextType: ContextType.class_,
    location: 'Library',
    status: 'resolved',
    attachRecognition: 'silver',
  },
  {
    key: 's0-wbr-044',
    categoryName: 'Community contribution',
    daysAgoOccurred: 3,
    description: 'Represented the school at a debating competition.',
    parentDescription: 'So proud.',
    contextType: ContextType.off_site,
    location: null,
    status: 'resolved',
  },

  // Lying / dishonesty x 2
  {
    key: 's0-wbr-045',
    categoryName: 'Lying / dishonesty',
    daysAgoOccurred: 30,
    description: 'Gave a false reason for missing homework.',
    parentDescription: null,
    contextType: ContextType.class_,
    location: null,
    status: 'resolved',
  },
  {
    key: 's0-wbr-046',
    categoryName: 'Lying / dishonesty',
    daysAgoOccurred: 12,
    description: 'Claimed someone else did the writing in their workbook.',
    parentDescription: 'Honesty discussed.',
    contextType: ContextType.class_,
    location: null,
    status: 'active',
  },

  // Phone / device misuse x 4
  {
    key: 's0-wbr-047',
    categoryName: 'Phone use',
    daysAgoOccurred: 42,
    description: 'Phone out during maths.',
    parentDescription: null,
    contextType: ContextType.class_,
    location: 'Room M2',
    status: 'resolved',
  },
  {
    key: 's0-wbr-048',
    categoryName: 'Phone use',
    daysAgoOccurred: 28,
    description: 'Phone out during assembly.',
    parentDescription: 'Phone kept at home tomorrow.',
    contextType: ContextType.other,
    location: 'Hall',
    status: 'resolved',
  },
  {
    key: 's0-wbr-049',
    categoryName: 'Phone use',
    daysAgoOccurred: 13,
    description: 'Phone confiscated, second offence this term.',
    parentDescription: 'Second phone incident — collection at reception.',
    contextType: ContextType.class_,
    location: null,
    status: 'resolved',
    attachSanction: { type: 'detention', daysAgoScheduled: -11 },
  },
  {
    key: 's0-wbr-050',
    categoryName: 'Phone use',
    daysAgoOccurred: 2,
    description: 'Phone use in corridor. Third incident this term — REPEAT.',
    parentDescription: 'Third phone incident — parent meeting required.',
    contextType: ContextType.other,
    location: 'Corridor C1',
    status: 'active',
    attachSanction: { type: 'detention', daysAgoScheduled: 1 },
  },
];

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { mode } = parseArgs();
  console.log(`[seed-wellbeing-walkthrough] mode=${mode} tenant=${NHQS_TENANT_ID}`);

  if (mode === 'teardown') {
    await teardown();
    return;
  }

  await teardown(); // always clean prior run first for idempotency
  await seed();
  console.log('[seed-wellbeing-walkthrough] done.');
}

async function teardown(): Promise<void> {
  console.log('  · Teardown prior seed …');
  // Order matters — FK cascades handle most, but some require manual order.

  // Recognition awards (notes-marked)
  const awardsDel = await prisma.behaviourRecognitionAward.deleteMany({
    where: { tenant_id: NHQS_TENANT_ID, notes: { startsWith: '[s0-wbr]' } },
  });
  console.log(`    - recognition awards: ${awardsDel.count}`);

  // Award types (name-marked) — must follow awards deletion
  const awardTypesDel = await prisma.behaviourAwardType.deleteMany({
    where: { tenant_id: NHQS_TENANT_ID, name: { startsWith: 'S0-WBR ' } },
  });
  console.log(`    - award types: ${awardTypesDel.count}`);

  // Sanctions (number-marked)
  const sanctionsDel = await prisma.behaviourSanction.deleteMany({
    where: { tenant_id: NHQS_TENANT_ID, sanction_number: { startsWith: 'SN-S0-' } },
  });
  console.log(`    - sanctions: ${sanctionsDel.count}`);

  // Incidents (idempotency_key-marked). Cascades to participants.
  const incDel = await prisma.behaviourIncident.deleteMany({
    where: { tenant_id: NHQS_TENANT_ID, idempotency_key: { startsWith: `${MARKER}-` } },
  });
  console.log(`    - incidents: ${incDel.count}`);

  // House memberships + teams
  const memDel = await prisma.behaviourHouseMembership.deleteMany({
    where: {
      tenant_id: NHQS_TENANT_ID,
      house: { name: { in: HOUSES.map((h) => h.name) } },
    },
  });
  const teamsDel = await prisma.behaviourHouseTeam.deleteMany({
    where: { tenant_id: NHQS_TENANT_ID, name: { in: HOUSES.map((h) => h.name) } },
  });
  console.log(`    - house memberships: ${memDel.count}, teams: ${teamsDel.count}`);

  // Pastoral referrals (recommendations can't be marked directly — match via case/concern)
  // We handle referral cleanup via case cleanup below.

  // Pastoral interventions (outcome_notes-marked)
  const pIntDel = await prisma.pastoralIntervention.deleteMany({
    where: { tenant_id: NHQS_TENANT_ID, outcome_notes: { startsWith: '[s0-wbr]' } },
  });
  console.log(`    - pastoral interventions: ${pIntDel.count}`);

  // Pastoral cases (number-marked)
  const pCaseDel = await prisma.pastoralCase.deleteMany({
    where: { tenant_id: NHQS_TENANT_ID, case_number: { startsWith: 'PC-S0-' } },
  });
  console.log(`    - pastoral cases: ${pCaseDel.count}`);

  // Pastoral concerns (import_hash-marked)
  const pConcDel = await prisma.pastoralConcern.deleteMany({
    where: { tenant_id: NHQS_TENANT_ID, import_hash: { startsWith: `${MARKER}-` } },
  });
  console.log(`    - pastoral concerns: ${pConcDel.count}`);

  // Safeguarding actions (deleted via concern cascade)
  // Safeguarding concerns (number-marked)
  const sgDel = await prisma.safeguardingConcern.deleteMany({
    where: { tenant_id: NHQS_TENANT_ID, concern_number: { startsWith: 'SG-S0-' } },
  });
  console.log(`    - safeguarding concerns: ${sgDel.count}`);

  // Break-glass grants (reason-marked)
  const bgDel = await prisma.safeguardingBreakGlassGrant.deleteMany({
    where: { tenant_id: NHQS_TENANT_ID, reason: { startsWith: '[s0-wbr]' } },
  });
  console.log(`    - break-glass grants: ${bgDel.count}`);

  // Staff surveys (title-marked, cascades to questions + responses + tokens)
  const surveysDel = await prisma.staffSurvey.deleteMany({
    where: { tenant_id: NHQS_TENANT_ID, title: { startsWith: 'S0-WBR ' } },
  });
  console.log(`    - staff surveys: ${surveysDel.count}`);

  console.log('  · Teardown complete.');
}

async function seed(): Promise<void> {
  console.log('  · Looking up NHQS context …');
  const [owner, teacher, academicYear, categories, students] = await Promise.all([
    prisma.user.findFirst({ where: { email: 'owner@nhqs.test' } }),
    prisma.user.findFirst({
      where: { email: { equals: 'sarah.daly@nhqs.test', mode: 'insensitive' } },
    }),
    prisma.academicYear.findFirst({ where: { tenant_id: NHQS_TENANT_ID, status: 'active' } }),
    prisma.behaviourCategory.findMany({ where: { tenant_id: NHQS_TENANT_ID } }),
    prisma.student.findMany({
      where: { tenant_id: NHQS_TENANT_ID, status: 'active' },
      select: { id: true, first_name: true, last_name: true, year_group_id: true },
      orderBy: { last_name: 'asc' },
      take: 60,
    }),
  ]);

  if (!owner) throw new Error('owner@nhqs.test user not found');
  if (!teacher) throw new Error('sarah.daly@nhqs.test user not found');
  if (!academicYear) throw new Error('active academic year not found for NHQS');
  if (categories.length === 0) throw new Error('no behaviour categories seeded for NHQS');
  if (students.length < 30) throw new Error(`need ≥30 active students, got ${students.length}`);

  const categoryByName = new Map(categories.map((c) => [c.name, c]));
  const reporters = [owner.id, teacher.id];

  // 1) Houses + memberships -------------------------------------------------
  console.log('  · Seeding 4 houses + memberships …');
  const houseRows = await Promise.all(
    HOUSES.map((h, idx) =>
      prisma.behaviourHouseTeam.create({
        data: {
          tenant_id: NHQS_TENANT_ID,
          name: h.name,
          color: h.color,
          display_order: idx,
          is_active: true,
        },
      }),
    ),
  );
  // Distribute active students across houses
  const allActive = await prisma.student.findMany({
    where: { tenant_id: NHQS_TENANT_ID, status: 'active' },
    select: { id: true },
  });
  await prisma.behaviourHouseMembership.createMany({
    data: allActive.map((s, i) => {
      const house = houseRows[i % houseRows.length];
      if (!house) throw new Error('house allocation failed');
      return {
        tenant_id: NHQS_TENANT_ID,
        student_id: s.id,
        house_id: house.id,
        academic_year_id: academicYear.id,
      };
    }),
    skipDuplicates: true,
  });
  console.log(`    · ${houseRows.length} houses, ${allActive.length} memberships`);

  // 2) Award types ----------------------------------------------------------
  console.log('  · Seeding 3 award types …');
  const awardBronze = await prisma.behaviourAwardType.create({
    data: {
      tenant_id: NHQS_TENANT_ID,
      name: 'S0-WBR Bronze Star',
      points_threshold: 5,
      repeat_mode: 'unlimited',
      tier_group: 'walkthrough',
      tier_level: 1,
      color: '#cd7f32',
      is_active: true,
      display_order: 1,
    },
  });
  const awardSilver = await prisma.behaviourAwardType.create({
    data: {
      tenant_id: NHQS_TENANT_ID,
      name: 'S0-WBR Silver Star',
      points_threshold: 15,
      repeat_mode: 'unlimited',
      tier_group: 'walkthrough',
      tier_level: 2,
      color: '#c0c0c0',
      is_active: true,
      display_order: 2,
    },
  });
  const awardGold = await prisma.behaviourAwardType.create({
    data: {
      tenant_id: NHQS_TENANT_ID,
      name: 'S0-WBR Gold Star',
      points_threshold: 30,
      repeat_mode: 'unlimited',
      tier_group: 'walkthrough',
      tier_level: 3,
      color: '#ffd700',
      is_active: true,
      display_order: 3,
    },
  });
  const awardTypeId = { bronze: awardBronze.id, silver: awardSilver.id, gold: awardGold.id };

  // 3) Behaviour incidents ---------------------------------------------------
  console.log(
    `  · Seeding ${PLAN.length} behaviour incidents (with participants + sanctions + awards) …`,
  );
  let sanctionCounter = 1;
  let incidentCounter = 1;
  const studentPoolCycle = (i: number) => pick(students, i * 7 + 3).id;

  for (let i = 0; i < PLAN.length; i++) {
    const plan = PLAN[i];
    if (!plan) continue;
    const cat = categoryByName.get(plan.categoryName);
    if (!cat) {
      console.warn(`    ! skipping ${plan.key}: category '${plan.categoryName}' not found on NHQS`);
      continue;
    }
    const studentId = studentPoolCycle(i);
    const reporterId = reporters[i % reporters.length] ?? owner.id;
    const occurredAt = daysAgo(plan.daysAgoOccurred);
    const incidentNumber = `INC-S0-${String(incidentCounter++).padStart(3, '0')}`;

    const incident = await prisma.behaviourIncident.create({
      data: {
        tenant_id: NHQS_TENANT_ID,
        incident_number: incidentNumber,
        idempotency_key: plan.key,
        category_id: cat.id,
        polarity: cat.polarity,
        severity: cat.severity,
        reported_by_id: reporterId,
        description: plan.description,
        parent_description: plan.parentDescription,
        context_type: plan.contextType,
        location: plan.location,
        occurred_at: occurredAt,
        logged_at: occurredAt,
        academic_year_id: academicYear.id,
        status: plan.status,
        approval_status: 'not_required',
        parent_notification_status: plan.parentDescription ? 'sent' : 'not_required',
        follow_up_required: plan.status === 'active' || plan.status === 'investigating',
        context_snapshot: { seeded_by: 'wellbeing-walkthrough-S0' } as Prisma.InputJsonValue,
      },
    });

    // Participant (subject student)
    await prisma.behaviourIncidentParticipant.create({
      data: {
        tenant_id: NHQS_TENANT_ID,
        incident_id: incident.id,
        participant_type: 'student',
        student_id: studentId,
        role: 'subject',
        points_awarded: cat.polarity === 'positive' ? cat.severity : -cat.severity,
        parent_visible: true,
      },
    });

    // Attach a sanction if the plan says so
    if (plan.attachSanction && cat.polarity === 'negative') {
      const sanctionNumber = `SN-S0-${String(sanctionCounter++).padStart(3, '0')}`;
      const scheduled = daysAgo(plan.attachSanction.daysAgoScheduled);
      await prisma.behaviourSanction.create({
        data: {
          tenant_id: NHQS_TENANT_ID,
          sanction_number: sanctionNumber,
          incident_id: incident.id,
          student_id: studentId,
          type: plan.attachSanction.type,
          status: plan.attachSanction.daysAgoScheduled >= 0 ? 'served' : 'scheduled',
          approval_status: 'not_required',
          scheduled_date: scheduled,
          supervised_by_id: reporterId,
          notes:
            plan.attachSanction.type === 'suspension_internal' ||
            plan.attachSanction.type === 'suspension_external'
              ? 'Suspension served per school behaviour policy.'
              : null,
          suspension_start_date:
            plan.attachSanction.type === 'suspension_internal' ||
            plan.attachSanction.type === 'suspension_external'
              ? scheduled
              : null,
          suspension_end_date:
            plan.attachSanction.type === 'suspension_internal' ||
            plan.attachSanction.type === 'suspension_external'
              ? daysAgo(plan.attachSanction.daysAgoScheduled - 2)
              : null,
          suspension_days:
            plan.attachSanction.type === 'suspension_internal' ||
            plan.attachSanction.type === 'suspension_external'
              ? 2
              : null,
        },
      });
    }

    // Attach recognition if positive + recognition specified
    if (plan.attachRecognition && cat.polarity === 'positive') {
      await prisma.behaviourRecognitionAward.create({
        data: {
          tenant_id: NHQS_TENANT_ID,
          student_id: studentId,
          award_type_id: awardTypeId[plan.attachRecognition],
          points_at_award:
            plan.attachRecognition === 'gold' ? 30 : plan.attachRecognition === 'silver' ? 15 : 5,
          awarded_by_id: reporterId,
          awarded_at: occurredAt,
          academic_year_id: academicYear.id,
          triggered_by_incident_id: incident.id,
          notes: `[s0-wbr] ${plan.attachRecognition} star for ${plan.categoryName}`,
        },
      });
    }
  }
  console.log(`    · ${PLAN.length} incidents + ${sanctionCounter - 1} sanctions seeded`);

  // 4) Pastoral concerns + cases --------------------------------------------
  console.log('  · Seeding pastoral concerns + cases …');
  const concernPlans: Array<{
    hashSuffix: string;
    studentIdx: number;
    category: string;
    severity: PastoralConcernSeverity;
    daysAgo: number;
    location: string;
    actionsTaken: string | null;
    followUpNeeded: boolean;
  }> = [
    {
      hashSuffix: 'pc001',
      studentIdx: 0,
      category: 'engagement',
      severity: PastoralConcernSeverity.routine,
      daysAgo: 30,
      location: 'Room M2',
      actionsTaken: 'Brief chat with student, parent informed.',
      followUpNeeded: false,
    },
    {
      hashSuffix: 'pc002',
      studentIdx: 5,
      category: 'peer_relations',
      severity: PastoralConcernSeverity.elevated,
      daysAgo: 22,
      location: 'Yard',
      actionsTaken: 'Mediation session scheduled.',
      followUpNeeded: true,
    },
    {
      hashSuffix: 'pc003',
      studentIdx: 12,
      category: 'home_circumstances',
      severity: PastoralConcernSeverity.urgent,
      daysAgo: 14,
      location: 'Office',
      actionsTaken: 'Escalated to pastoral lead.',
      followUpNeeded: true,
    },
    {
      hashSuffix: 'pc004',
      studentIdx: 18,
      category: 'mental_health',
      severity: PastoralConcernSeverity.urgent,
      daysAgo: 9,
      location: 'Counselling room',
      actionsTaken: 'Counsellor appointment booked.',
      followUpNeeded: true,
    },
    {
      hashSuffix: 'pc005',
      studentIdx: 25,
      category: 'attendance',
      severity: PastoralConcernSeverity.elevated,
      daysAgo: 4,
      location: 'Attendance office',
      actionsTaken: null,
      followUpNeeded: true,
    },
  ];
  const createdConcerns: { id: string; student_id: string }[] = [];
  for (const p of concernPlans) {
    const student = students[p.studentIdx];
    if (!student) continue;
    const concern = await prisma.pastoralConcern.create({
      data: {
        tenant_id: NHQS_TENANT_ID,
        student_id: student.id,
        logged_by_user_id: owner.id,
        category: p.category,
        severity: p.severity,
        tier:
          p.severity === PastoralConcernSeverity.critical
            ? 3
            : p.severity === PastoralConcernSeverity.urgent
              ? 2
              : 1,
        occurred_at: daysAgo(p.daysAgo),
        location: p.location,
        actions_taken: p.actionsTaken,
        follow_up_needed: p.followUpNeeded,
        import_hash: `${MARKER}-${p.hashSuffix}`,
      },
    });
    createdConcerns.push({ id: concern.id, student_id: student.id });
  }
  console.log(`    · ${createdConcerns.length} pastoral concerns`);

  // Pastoral cases — 3, linked to some concerns
  let caseCounter = 1;
  const createdCases: { id: string; student_id: string }[] = [];
  for (const seed of createdConcerns.slice(0, 3)) {
    const pcase = await prisma.pastoralCase.create({
      data: {
        tenant_id: NHQS_TENANT_ID,
        student_id: seed.student_id,
        case_number: `PC-S0-${String(caseCounter++).padStart(3, '0')}`,
        status:
          caseCounter === 2
            ? PastoralCaseStatus.open
            : caseCounter === 3
              ? PastoralCaseStatus.active
              : PastoralCaseStatus.monitoring,
        owner_user_id: owner.id,
        opened_by_user_id: owner.id,
        opened_reason: 'Opened from seeded pastoral concern (S0 walkthrough).',
        tier: 2,
        next_review_date: daysAgo(-14),
      },
    });
    createdCases.push({ id: pcase.id, student_id: seed.student_id });
    // Link the concern to the case
    await prisma.pastoralConcern.update({ where: { id: seed.id }, data: { case_id: pcase.id } });
  }
  console.log(`    · ${createdCases.length} pastoral cases`);

  // One pastoral intervention
  if (createdCases[0]) {
    await prisma.pastoralIntervention.create({
      data: {
        tenant_id: NHQS_TENANT_ID,
        case_id: createdCases[0].id,
        student_id: createdCases[0].student_id,
        intervention_type: 'mentoring',
        continuum_level: 2,
        target_outcomes: {
          goals: ['Re-engage in class', 'Build peer connection'],
        } as Prisma.InputJsonValue,
        next_review_date: daysAgo(-21),
        parent_informed: true,
        parent_consented: true,
        created_by_user_id: owner.id,
        outcome_notes: '[s0-wbr] Initial session complete.',
      },
    });
    console.log('    · 1 pastoral intervention');
  }

  // Pastoral referrals — 3
  const referralCase = createdCases[0];
  if (referralCase) {
    for (let i = 0; i < 3; i++) {
      await prisma.pastoralReferral.create({
        data: {
          tenant_id: NHQS_TENANT_ID,
          case_id: referralCase.id,
          student_id: referralCase.student_id,
          referral_type:
            i === 0 ? 'internal_counsellor' : i === 1 ? 'external_camhs' : 'sen_coordinator',
          referral_body_name:
            i === 0 ? 'School counsellor' : i === 1 ? 'Community CAMHS team' : 'SEN coordinator',
          reason: '[s0-wbr] Referral generated during S0 walkthrough seed.',
          submitted_by_user_id: owner.id,
          created_by_user_id: owner.id,
          submitted_at: daysAgo(5 - i),
          status:
            i === 0
              ? PastoralReferralStatus.acknowledged
              : i === 1
                ? PastoralReferralStatus.submitted
                : PastoralReferralStatus.draft,
        },
      });
    }
    console.log('    · 3 pastoral referrals');
  }

  // 5) Safeguarding concerns ------------------------------------------------
  console.log('  · Seeding 4 safeguarding concerns (1 sealed) + actions …');
  const sgPlans: Array<{
    num: string;
    studentIdx: number;
    type: SafeguardingConcernType;
    severity: SafeguardingSeverity;
    status: SafeguardingStatus;
    description: string;
    sealed: boolean;
  }> = [
    {
      num: 'SG-S0-001',
      studentIdx: 2,
      type: SafeguardingConcernType.bullying,
      severity: SafeguardingSeverity.medium_sev,
      status: SafeguardingStatus.under_investigation,
      description: 'Repeat verbal bullying reported by class teacher; pattern confirmed.',
      sealed: false,
    },
    {
      num: 'SG-S0-002',
      studentIdx: 7,
      type: SafeguardingConcernType.emotional_abuse,
      severity: SafeguardingSeverity.high_sev,
      status: SafeguardingStatus.sg_monitoring,
      description: 'Disclosures suggesting emotional abuse at home; liaison with Tusla notified.',
      sealed: false,
    },
    {
      num: 'SG-S0-003',
      studentIdx: 14,
      type: SafeguardingConcernType.online_safety,
      severity: SafeguardingSeverity.medium_sev,
      status: SafeguardingStatus.reported,
      description:
        'Inappropriate contact from unknown adult via school chat — investigating device use.',
      sealed: false,
    },
    {
      num: 'SG-S0-004',
      studentIdx: 21,
      type: SafeguardingConcernType.neglect,
      severity: SafeguardingSeverity.high_sev,
      status: SafeguardingStatus.sealed,
      description: 'Sealed concern — confidential details retained under restricted access.',
      sealed: true,
    },
  ];
  const createdSgConcerns: string[] = [];
  for (const p of sgPlans) {
    const student = students[p.studentIdx];
    if (!student) continue;
    const concern = await prisma.safeguardingConcern.create({
      data: {
        tenant_id: NHQS_TENANT_ID,
        concern_number: p.num,
        student_id: student.id,
        reported_by_id: owner.id,
        concern_type: p.type,
        severity: p.severity,
        status: p.status,
        description: p.description,
        immediate_actions_taken: 'Student supported; class teacher informed; incident log opened.',
        designated_liaison_id: owner.id,
        assigned_to_id: owner.id,
        is_tusla_referral: p.type === 'emotional_abuse' || p.type === 'neglect',
        sla_first_response_due: daysAgo(-2),
        sla_first_response_met_at: daysAgo(1),
        sealed_at: p.sealed ? daysAgo(5) : null,
        sealed_by_id: p.sealed ? owner.id : null,
        sealed_reason: p.sealed ? 'Highly sensitive — restricted to DSL access only.' : null,
        seal_approved_by_id: p.sealed ? owner.id : null,
      },
    });
    createdSgConcerns.push(concern.id);

    // One action per non-sealed concern
    if (!p.sealed) {
      await prisma.safeguardingAction.create({
        data: {
          tenant_id: NHQS_TENANT_ID,
          concern_id: concern.id,
          action_by_id: owner.id,
          action_type:
            p.type === SafeguardingConcernType.emotional_abuse
              ? SafeguardingActionType.tusla_referred
              : p.type === SafeguardingConcernType.online_safety
                ? SafeguardingActionType.agency_contacted
                : SafeguardingActionType.assigned,
          description: 'Initial action recorded during seeded walkthrough.',
          due_date: daysAgo(-7),
        },
      });
    }
  }
  console.log(`    · ${createdSgConcerns.length} safeguarding concerns`);

  // 6) Break-glass grant (expired) ------------------------------------------
  console.log('  · Seeding 1 expired break-glass grant …');
  await prisma.safeguardingBreakGlassGrant.create({
    data: {
      tenant_id: NHQS_TENANT_ID,
      granted_to_id: teacher.id,
      granted_by_id: owner.id,
      reason: '[s0-wbr] Historical break-glass grant for covering DSL during leave.',
      scope: 'all_concerns',
      scoped_concern_ids: [],
      granted_at: daysAgo(30),
      expires_at: daysAgo(27),
      after_action_review_required: true,
      after_action_review_completed_at: daysAgo(25),
      after_action_review_by_id: owner.id,
      after_action_review_notes: 'Grant used for one concern during DSL absence; closed cleanly.',
    },
  });

  // 7) Early-warning config --------------------------------------------------
  console.log('  · Upserting early-warning config (enabled) …');
  await prisma.earlyWarningConfig.upsert({
    where: { tenant_id: NHQS_TENANT_ID },
    update: { is_enabled: true },
    create: {
      tenant_id: NHQS_TENANT_ID,
      is_enabled: true,
    },
  });

  // 8) Staff wellbeing surveys ----------------------------------------------
  console.log('  · Seeding 1 active + 1 closed staff wellbeing survey with responses …');
  const activeSurvey = await prisma.staffSurvey.create({
    data: {
      tenant_id: NHQS_TENANT_ID,
      title: 'S0-WBR Fortnightly Pulse (Active)',
      description: 'How is this fortnight feeling? 2-minute check-in.',
      status: 'active',
      frequency: 'fortnightly',
      window_opens_at: daysAgo(7),
      window_closes_at: daysAgo(-7),
      results_released: false,
      min_response_threshold: 5,
      dept_drill_down_threshold: 10,
      moderation_enabled: true,
      created_by: owner.id,
    },
  });
  const activeQuestion = await prisma.surveyQuestion.create({
    data: {
      tenant_id: NHQS_TENANT_ID,
      survey_id: activeSurvey.id,
      question_text: 'How would you rate your workload this fortnight?',
      question_type: 'likert_5',
      display_order: 1,
      is_required: true,
    },
  });
  for (let i = 0; i < 5; i++) {
    await prisma.surveyResponse.create({
      data: {
        survey_id: activeSurvey.id,
        question_id: activeQuestion.id,
        answer_value: [3, 4, 3, 2, 5][i] ?? 3,
        submitted_date: daysAgo(5 - i),
        moderation_status: 'approved',
      },
    });
  }

  const closedSurvey = await prisma.staffSurvey.create({
    data: {
      tenant_id: NHQS_TENANT_ID,
      title: 'S0-WBR Term Review (Closed)',
      description: 'End-of-term wellbeing snapshot.',
      status: 'closed',
      frequency: 'termly',
      window_opens_at: daysAgo(45),
      window_closes_at: daysAgo(30),
      results_released: true,
      min_response_threshold: 5,
      dept_drill_down_threshold: 10,
      moderation_enabled: true,
      created_by: owner.id,
    },
  });
  const closedQuestion = await prisma.surveyQuestion.create({
    data: {
      tenant_id: NHQS_TENANT_ID,
      survey_id: closedSurvey.id,
      question_text: 'Overall, how supported did you feel this term?',
      question_type: 'likert_5',
      display_order: 1,
      is_required: true,
    },
  });
  for (let i = 0; i < 15; i++) {
    await prisma.surveyResponse.create({
      data: {
        survey_id: closedSurvey.id,
        question_id: closedQuestion.id,
        answer_value: [4, 5, 3, 4, 4, 3, 5, 4, 2, 4, 5, 3, 4, 4, 5][i] ?? 4,
        submitted_date: daysAgo(40 - i),
        moderation_status: 'approved',
      },
    });
  }
  console.log('    · 2 surveys seeded (5 + 15 responses)');
}

main()
  .catch((e) => {
    console.error('[seed-wellbeing-walkthrough] FAILED:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
