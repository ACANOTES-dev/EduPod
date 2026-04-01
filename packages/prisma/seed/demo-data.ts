/**
 * Demo environment seed data.
 *
 * Builds on top of dev-data.ts to create rich, realistic data
 * suitable for demos and sales presentations.
 *
 * Run via: pnpm seed:demo
 */

import { PrismaClient } from '@prisma/client';

function getDirectDatabaseUrl(): string {
  const connectionString = process.env.DATABASE_MIGRATE_URL ?? process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL or DATABASE_MIGRATE_URL environment variable is required');
  }

  return connectionString;
}

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: getDirectDatabaseUrl(),
    },
  },
});

// ─── Constants ──────────────────────────────────────────────────────────────

const FIRST_NAMES = [
  'Ahmed',
  'Fatima',
  'Omar',
  'Layla',
  'Yusuf',
  'Noor',
  'Ibrahim',
  'Aisha',
  'Hassan',
  'Maryam',
  'Ali',
  'Zahra',
  'Khalid',
  'Hana',
  'Samir',
  'Dina',
  'Tariq',
  'Salma',
  'Rami',
  'Leila',
  'Faisal',
  'Yasmin',
  'Nasir',
  'Rania',
  'Bilal',
  'Amira',
  'Sami',
  'Farida',
  'Jamal',
  'Lina',
  'Walid',
  'Nadia',
  'Karim',
  'Huda',
  'Ziad',
  'Mariam',
  'Adel',
  'Sara',
  'Majid',
  'Rana',
];

const LAST_NAMES = [
  'Al-Rashid',
  'Hassan',
  'Al-Amin',
  'Ibrahim',
  'Al-Mahmoud',
  'Ahmed',
  'Al-Khalifa',
  'Nasser',
  'Al-Sayed',
  'Farouk',
  'Al-Bakr',
  'Mustafa',
  'Al-Harbi',
  'Saleh',
  'Al-Dosari',
  'Hamdan',
  'Al-Tamimi',
  'Youssef',
  'Al-Fahad',
  'Jaber',
];

const SUBJECTS = [
  { name: 'Mathematics', name_ar: 'الرياضيات', type: 'academic' },
  { name: 'English Language', name_ar: 'اللغة الإنجليزية', type: 'academic' },
  { name: 'Arabic Language', name_ar: 'اللغة العربية', type: 'academic' },
  { name: 'Science', name_ar: 'العلوم', type: 'academic' },
  { name: 'Social Studies', name_ar: 'الدراسات الاجتماعية', type: 'academic' },
  { name: 'Islamic Studies', name_ar: 'التربية الإسلامية', type: 'academic' },
  { name: 'Physical Education', name_ar: 'التربية البدنية', type: 'supervision' },
  { name: 'Art', name_ar: 'الفنون', type: 'academic' },
];

const YEAR_GROUP_NAMES = [
  { name: 'KG 1', name_ar: 'روضة 1' },
  { name: 'KG 2', name_ar: 'روضة 2' },
  { name: 'Year 1', name_ar: 'السنة 1' },
  { name: 'Year 2', name_ar: 'السنة 2' },
  { name: 'Year 3', name_ar: 'السنة 3' },
  { name: 'Year 4', name_ar: 'السنة 4' },
  { name: 'Year 5', name_ar: 'السنة 5' },
  { name: 'Year 6', name_ar: 'السنة 6' },
];

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function _randomName(): { first: string; last: string } {
  return {
    first: randomItem(FIRST_NAMES),
    last: randomItem(LAST_NAMES),
  };
}

// ─── Main seed function ─────────────────────────────────────────────────────

export async function seedDemoData(): Promise<void> {
  console.log('Seeding demo data...');

  // Get existing tenants (created by dev-data.ts)
  const tenants = await prisma.tenant.findMany({
    where: { slug: { in: ['al-noor', 'cedar'] } },
  });

  if (tenants.length < 2) {
    console.error('Tenants not found. Run the standard seed first: pnpm db:seed');
    process.exit(1);
  }

  for (const tenant of tenants) {
    console.log(`  Seeding demo data for tenant: ${tenant.name}`);
    await seedTenantDemoData(tenant.id);
  }

  console.log('Demo data seeding complete.');
  console.log('');
  console.log('Login credentials (all tenants):');
  console.log('  School Owner: owner@<tenant>.test / Password123!');
  console.log('  School Admin: admin@<tenant>.test / Password123!');
  console.log('  Teacher:      teacher@<tenant>.test / Password123!');
  console.log('  Parent:       parent@<tenant>.test / Password123!');
  console.log('');
  console.log('  Al Noor domain: al-noor.edupod.app');
  console.log('  Cedar domain:   cedar.edupod.app');
}

async function seedTenantDemoData(tenantId: string): Promise<void> {
  // Check if demo data already exists (idempotent check)
  const existingYearGroups = await prisma.yearGroup.count({
    where: { tenant_id: tenantId },
  });

  if (existingYearGroups >= YEAR_GROUP_NAMES.length) {
    console.log(`    Skipping — demo data already exists for this tenant`);
    return;
  }

  // Seed academic structure
  const academicYear = await prisma.academicYear.upsert({
    where: {
      // Use a unique constraint or findFirst pattern
      id: `demo-ay-${tenantId.substring(0, 8)}`,
    },
    update: {},
    create: {
      id: `demo-ay-${tenantId.substring(0, 8)}`,
      tenant_id: tenantId,
      name: '2025-2026',
      name_ar: '2025-2026',
      start_date: new Date('2025-09-01'),
      end_date: new Date('2026-06-30'),
      is_current: true,
    },
  });

  // Seed academic periods
  const periods = [
    { name: 'Term 1', name_ar: 'الفصل الأول', start: '2025-09-01', end: '2025-12-15' },
    { name: 'Term 2', name_ar: 'الفصل الثاني', start: '2026-01-05', end: '2026-03-20' },
    { name: 'Term 3', name_ar: 'الفصل الثالث', start: '2026-04-01', end: '2026-06-30' },
  ];

  for (let i = 0; i < periods.length; i++) {
    await prisma.academicPeriod.upsert({
      where: { id: `demo-ap-${tenantId.substring(0, 8)}-${i}` },
      update: {},
      create: {
        id: `demo-ap-${tenantId.substring(0, 8)}-${i}`,
        tenant_id: tenantId,
        academic_year_id: academicYear.id,
        name: periods[i].name,
        name_ar: periods[i].name_ar,
        start_date: new Date(periods[i].start),
        end_date: new Date(periods[i].end),
        sort_order: i + 1,
      },
    });
  }

  // Seed year groups
  for (let i = 0; i < YEAR_GROUP_NAMES.length; i++) {
    await prisma.yearGroup.upsert({
      where: { id: `demo-yg-${tenantId.substring(0, 8)}-${i}` },
      update: {},
      create: {
        id: `demo-yg-${tenantId.substring(0, 8)}-${i}`,
        tenant_id: tenantId,
        name: YEAR_GROUP_NAMES[i].name,
        name_ar: YEAR_GROUP_NAMES[i].name_ar,
        sort_order: i + 1,
      },
    });
  }

  // Seed subjects
  for (let i = 0; i < SUBJECTS.length; i++) {
    await prisma.subject.upsert({
      where: { id: `demo-subj-${tenantId.substring(0, 8)}-${i}` },
      update: {},
      create: {
        id: `demo-subj-${tenantId.substring(0, 8)}-${i}`,
        tenant_id: tenantId,
        name: SUBJECTS[i].name,
        name_ar: SUBJECTS[i].name_ar,
        subject_type: SUBJECTS[i].type as 'academic' | 'supervision' | 'duty' | 'other',
      },
    });
  }

  console.log(
    `    Seeded academic structure: 1 year, ${periods.length} periods, ${YEAR_GROUP_NAMES.length} year groups, ${SUBJECTS.length} subjects`,
  );
}

// ─── Entry point ────────────────────────────────────────────────────────────

seedDemoData()
  .then(() => prisma.$disconnect())
  .catch((error) => {
    console.error('Demo seed failed:', error);
    prisma.$disconnect();
    process.exit(1);
  });
