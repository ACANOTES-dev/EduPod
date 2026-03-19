/**
 * Comprehensive school data seed for RLS testing.
 *
 * Creates realistic data for ALL 4 schools with clearly distinct names
 * per school so RLS isolation can be visually verified.
 *
 * Run via: cd packages/prisma && npx tsx seed/school-data.ts
 */

import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();
const PASSWORD_HASH_PROMISE = hash('Password123!', 10);

// ─── School-specific data ────────────────────────────────────────────────────

interface SchoolSeedData {
  slug: string;
  teachers: Array<{ email: string; first_name: string; last_name: string; locale: string; job_title: string }>;
  parents: Array<{ first_name: string; last_name: string; email?: string; phone?: string; relationship: string }>;
  students: Array<{ first_name: string; last_name: string; dob: string; gender: 'male' | 'female'; year_group_idx: number; household_idx: number; parent_indices: number[] }>;
  households: Array<{ name: string; city: string; parent_indices: number[] }>;
}

const SCHOOL_DATA: SchoolSeedData[] = [
  // ── Al Noor Academy: Arabic-inspired names ────────────────────────────
  {
    slug: 'al-noor',
    teachers: [
      { email: 'math.teacher@alnoor.test', first_name: 'Saeed', last_name: 'Al-Mansoori', locale: 'ar', job_title: 'Mathematics Teacher' },
      { email: 'science.teacher@alnoor.test', first_name: 'Noura', last_name: 'Al-Hashimi', locale: 'ar', job_title: 'Science Teacher' },
      { email: 'arabic.teacher@alnoor.test', first_name: 'Abdulrahman', last_name: 'Al-Suwaidi', locale: 'ar', job_title: 'Arabic Language Teacher' },
      { email: 'islamic.teacher@alnoor.test', first_name: 'Hessa', last_name: 'Al-Mazrouei', locale: 'ar', job_title: 'Islamic Studies Teacher' },
      { email: 'pe.teacher@alnoor.test', first_name: 'Rashid', last_name: 'Al-Nuaimi', locale: 'ar', job_title: 'PE Teacher' },
    ],
    parents: [
      { first_name: 'Mohammed', last_name: 'Al-Zaabi', email: 'mohammed.alzaabi@email.test', phone: '+971501234001', relationship: 'father' },
      { first_name: 'Amal', last_name: 'Al-Zaabi', phone: '+971501234002', relationship: 'mother' },
      { first_name: 'Sultan', last_name: 'Al-Dhaheri', email: 'sultan.aldhaheri@email.test', phone: '+971501234003', relationship: 'father' },
      { first_name: 'Moza', last_name: 'Al-Dhaheri', phone: '+971501234004', relationship: 'mother' },
      { first_name: 'Hamad', last_name: 'Al-Ketbi', email: 'hamad.alketbi@email.test', phone: '+971501234005', relationship: 'father' },
      { first_name: 'Shamsa', last_name: 'Al-Ketbi', phone: '+971501234006', relationship: 'mother' },
      { first_name: 'Obaid', last_name: 'Al-Marri', email: 'obaid.almarri@email.test', phone: '+971501234007', relationship: 'father' },
      { first_name: 'Latifa', last_name: 'Al-Marri', phone: '+971501234008', relationship: 'mother' },
      { first_name: 'Khaled', last_name: 'Al-Falasi', email: 'khaled.alfalasi@email.test', phone: '+971501234009', relationship: 'father' },
      { first_name: 'Maitha', last_name: 'Al-Falasi', phone: '+971501234010', relationship: 'mother' },
    ],
    households: [
      { name: 'Al-Zaabi Family', city: 'Abu Dhabi', parent_indices: [0, 1] },
      { name: 'Al-Dhaheri Family', city: 'Abu Dhabi', parent_indices: [2, 3] },
      { name: 'Al-Ketbi Family', city: 'Al Ain', parent_indices: [4, 5] },
      { name: 'Al-Marri Family', city: 'Dubai', parent_indices: [6, 7] },
      { name: 'Al-Falasi Family', city: 'Sharjah', parent_indices: [8, 9] },
    ],
    students: [
      { first_name: 'Zayed', last_name: 'Al-Zaabi', dob: '2019-03-15', gender: 'male', year_group_idx: 0, household_idx: 0, parent_indices: [0, 1] },
      { first_name: 'Shamma', last_name: 'Al-Zaabi', dob: '2017-08-22', gender: 'female', year_group_idx: 2, household_idx: 0, parent_indices: [0, 1] },
      { first_name: 'Saif', last_name: 'Al-Dhaheri', dob: '2018-01-10', gender: 'male', year_group_idx: 1, household_idx: 1, parent_indices: [2, 3] },
      { first_name: 'Meera', last_name: 'Al-Dhaheri', dob: '2016-06-05', gender: 'female', year_group_idx: 3, household_idx: 1, parent_indices: [2, 3] },
      { first_name: 'Mansoor', last_name: 'Al-Dhaheri', dob: '2014-11-30', gender: 'male', year_group_idx: 5, household_idx: 1, parent_indices: [2, 3] },
      { first_name: 'Ahmad', last_name: 'Al-Ketbi', dob: '2015-04-18', gender: 'male', year_group_idx: 4, household_idx: 2, parent_indices: [4, 5] },
      { first_name: 'Hind', last_name: 'Al-Ketbi', dob: '2018-09-12', gender: 'female', year_group_idx: 1, household_idx: 2, parent_indices: [4, 5] },
      { first_name: 'Rashed', last_name: 'Al-Marri', dob: '2013-07-25', gender: 'male', year_group_idx: 6, household_idx: 3, parent_indices: [6, 7] },
      { first_name: 'Aysha', last_name: 'Al-Marri', dob: '2016-02-14', gender: 'female', year_group_idx: 3, household_idx: 3, parent_indices: [6, 7] },
      { first_name: 'Hamdan', last_name: 'Al-Marri', dob: '2019-05-20', gender: 'male', year_group_idx: 0, household_idx: 3, parent_indices: [6, 7] },
      { first_name: 'Nasser', last_name: 'Al-Falasi', dob: '2014-10-08', gender: 'male', year_group_idx: 5, household_idx: 4, parent_indices: [8, 9] },
      { first_name: 'Fatima', last_name: 'Al-Falasi', dob: '2017-12-01', gender: 'female', year_group_idx: 2, household_idx: 4, parent_indices: [8, 9] },
      { first_name: 'Khalifa', last_name: 'Al-Falasi', dob: '2012-03-22', gender: 'male', year_group_idx: 7, household_idx: 4, parent_indices: [8, 9] },
      { first_name: 'Dana', last_name: 'Al-Zaabi', dob: '2015-07-09', gender: 'female', year_group_idx: 4, household_idx: 0, parent_indices: [0, 1] },
      { first_name: 'Ali', last_name: 'Al-Ketbi', dob: '2013-01-17', gender: 'male', year_group_idx: 6, household_idx: 2, parent_indices: [4, 5] },
    ],
  },

  // ── Cedar International: Western/diverse names ────────────────────────
  {
    slug: 'cedar',
    teachers: [
      { email: 'math.teacher@cedar.test', first_name: 'Michael', last_name: 'Anderson', locale: 'en', job_title: 'Mathematics Teacher' },
      { email: 'science.teacher@cedar.test', first_name: 'Jessica', last_name: 'Taylor', locale: 'en', job_title: 'Science Teacher' },
      { email: 'english.teacher@cedar.test', first_name: 'Robert', last_name: 'Williams', locale: 'en', job_title: 'English Teacher' },
      { email: 'art.teacher@cedar.test', first_name: 'Sophie', last_name: 'Martin', locale: 'en', job_title: 'Art Teacher' },
      { email: 'pe.teacher@cedar.test', first_name: 'Daniel', last_name: 'Thompson', locale: 'en', job_title: 'PE Teacher' },
    ],
    parents: [
      { first_name: 'Richard', last_name: 'Wilson', email: 'richard.wilson@email.test', phone: '+971502345001', relationship: 'father' },
      { first_name: 'Catherine', last_name: 'Wilson', phone: '+971502345002', relationship: 'mother' },
      { first_name: 'Thomas', last_name: 'Garcia', email: 'thomas.garcia@email.test', phone: '+971502345003', relationship: 'father' },
      { first_name: 'Maria', last_name: 'Garcia', phone: '+971502345004', relationship: 'mother' },
      { first_name: 'William', last_name: 'Lee', email: 'william.lee@email.test', phone: '+971502345005', relationship: 'father' },
      { first_name: 'Jennifer', last_name: 'Lee', phone: '+971502345006', relationship: 'mother' },
      { first_name: 'Andrew', last_name: 'Moore', email: 'andrew.moore@email.test', phone: '+971502345007', relationship: 'father' },
      { first_name: 'Lisa', last_name: 'Moore', phone: '+971502345008', relationship: 'mother' },
      { first_name: 'Christopher', last_name: 'Clark', email: 'chris.clark@email.test', phone: '+971502345009', relationship: 'father' },
      { first_name: 'Amanda', last_name: 'Clark', phone: '+971502345010', relationship: 'mother' },
    ],
    households: [
      { name: 'Wilson Family', city: 'Dubai Marina', parent_indices: [0, 1] },
      { name: 'Garcia Family', city: 'JBR', parent_indices: [2, 3] },
      { name: 'Lee Family', city: 'Downtown Dubai', parent_indices: [4, 5] },
      { name: 'Moore Family', city: 'Business Bay', parent_indices: [6, 7] },
      { name: 'Clark Family', city: 'Arabian Ranches', parent_indices: [8, 9] },
    ],
    students: [
      { first_name: 'Emma', last_name: 'Wilson', dob: '2019-05-12', gender: 'female', year_group_idx: 0, household_idx: 0, parent_indices: [0, 1] },
      { first_name: 'Jack', last_name: 'Wilson', dob: '2017-02-28', gender: 'male', year_group_idx: 2, household_idx: 0, parent_indices: [0, 1] },
      { first_name: 'Sofia', last_name: 'Garcia', dob: '2018-11-15', gender: 'female', year_group_idx: 1, household_idx: 1, parent_indices: [2, 3] },
      { first_name: 'Lucas', last_name: 'Garcia', dob: '2015-07-03', gender: 'male', year_group_idx: 4, household_idx: 1, parent_indices: [2, 3] },
      { first_name: 'Ethan', last_name: 'Lee', dob: '2016-09-20', gender: 'male', year_group_idx: 3, household_idx: 2, parent_indices: [4, 5] },
      { first_name: 'Olivia', last_name: 'Lee', dob: '2014-04-10', gender: 'female', year_group_idx: 5, household_idx: 2, parent_indices: [4, 5] },
      { first_name: 'Noah', last_name: 'Lee', dob: '2019-01-08', gender: 'male', year_group_idx: 0, household_idx: 2, parent_indices: [4, 5] },
      { first_name: 'Ava', last_name: 'Moore', dob: '2013-12-30', gender: 'female', year_group_idx: 6, household_idx: 3, parent_indices: [6, 7] },
      { first_name: 'Liam', last_name: 'Moore', dob: '2016-06-18', gender: 'male', year_group_idx: 3, household_idx: 3, parent_indices: [6, 7] },
      { first_name: 'Isabella', last_name: 'Clark', dob: '2015-03-25', gender: 'female', year_group_idx: 4, household_idx: 4, parent_indices: [8, 9] },
      { first_name: 'Mason', last_name: 'Clark', dob: '2012-08-14', gender: 'male', year_group_idx: 7, household_idx: 4, parent_indices: [8, 9] },
      { first_name: 'Mia', last_name: 'Wilson', dob: '2014-10-05', gender: 'female', year_group_idx: 5, household_idx: 0, parent_indices: [0, 1] },
      { first_name: 'Charlotte', last_name: 'Garcia', dob: '2013-06-22', gender: 'female', year_group_idx: 6, household_idx: 1, parent_indices: [2, 3] },
      { first_name: 'Oliver', last_name: 'Moore', dob: '2018-04-15', gender: 'male', year_group_idx: 1, household_idx: 3, parent_indices: [6, 7] },
      { first_name: 'Henry', last_name: 'Clark', dob: '2017-09-08', gender: 'male', year_group_idx: 2, household_idx: 4, parent_indices: [8, 9] },
    ],
  },

  // ── Nurul Huda School: South Asian names ──────────────────────────────
  {
    slug: 'nhqs',
    teachers: [
      { email: 'math.teacher@nhqs.test', first_name: 'Rajesh', last_name: 'Sharma', locale: 'en', job_title: 'Mathematics Teacher' },
      { email: 'science.teacher@nhqs.test', first_name: 'Priya', last_name: 'Nair', locale: 'en', job_title: 'Science Teacher' },
      { email: 'english.teacher@nhqs.test', first_name: 'Vikram', last_name: 'Patel', locale: 'en', job_title: 'English Teacher' },
      { email: 'arabic.teacher@nhqs.test', first_name: 'Samira', last_name: 'Hussain', locale: 'en', job_title: 'Arabic Language Teacher' },
      { email: 'pe.teacher@nhqs.test', first_name: 'Arjun', last_name: 'Reddy', locale: 'en', job_title: 'PE Teacher' },
    ],
    parents: [
      { first_name: 'Sanjay', last_name: 'Gupta', email: 'sanjay.gupta@email.test', phone: '+971503456001', relationship: 'father' },
      { first_name: 'Meena', last_name: 'Gupta', phone: '+971503456002', relationship: 'mother' },
      { first_name: 'Ravi', last_name: 'Kumar', email: 'ravi.kumar@email.test', phone: '+971503456003', relationship: 'father' },
      { first_name: 'Anita', last_name: 'Kumar', phone: '+971503456004', relationship: 'mother' },
      { first_name: 'Amit', last_name: 'Singh', email: 'amit.singh@email.test', phone: '+971503456005', relationship: 'father' },
      { first_name: 'Pooja', last_name: 'Singh', phone: '+971503456006', relationship: 'mother' },
      { first_name: 'Deepak', last_name: 'Verma', email: 'deepak.verma@email.test', phone: '+971503456007', relationship: 'father' },
      { first_name: 'Sunita', last_name: 'Verma', phone: '+971503456008', relationship: 'mother' },
      { first_name: 'Suresh', last_name: 'Joshi', email: 'suresh.joshi@email.test', phone: '+971503456009', relationship: 'father' },
      { first_name: 'Kavita', last_name: 'Joshi', phone: '+971503456010', relationship: 'mother' },
    ],
    households: [
      { name: 'Gupta Family', city: 'Deira', parent_indices: [0, 1] },
      { name: 'Kumar Family', city: 'Karama', parent_indices: [2, 3] },
      { name: 'Singh Family', city: 'Bur Dubai', parent_indices: [4, 5] },
      { name: 'Verma Family', city: 'Al Nahda', parent_indices: [6, 7] },
      { name: 'Joshi Family', city: 'Al Qusais', parent_indices: [8, 9] },
    ],
    students: [
      { first_name: 'Aryan', last_name: 'Gupta', dob: '2019-02-18', gender: 'male', year_group_idx: 0, household_idx: 0, parent_indices: [0, 1] },
      { first_name: 'Ananya', last_name: 'Gupta', dob: '2016-11-25', gender: 'female', year_group_idx: 3, household_idx: 0, parent_indices: [0, 1] },
      { first_name: 'Rohan', last_name: 'Kumar', dob: '2018-06-30', gender: 'male', year_group_idx: 1, household_idx: 1, parent_indices: [2, 3] },
      { first_name: 'Ishita', last_name: 'Kumar', dob: '2015-01-14', gender: 'female', year_group_idx: 4, household_idx: 1, parent_indices: [2, 3] },
      { first_name: 'Kabir', last_name: 'Singh', dob: '2014-08-07', gender: 'male', year_group_idx: 5, household_idx: 2, parent_indices: [4, 5] },
      { first_name: 'Diya', last_name: 'Singh', dob: '2017-03-19', gender: 'female', year_group_idx: 2, household_idx: 2, parent_indices: [4, 5] },
      { first_name: 'Vihaan', last_name: 'Singh', dob: '2019-09-05', gender: 'male', year_group_idx: 0, household_idx: 2, parent_indices: [4, 5] },
      { first_name: 'Anika', last_name: 'Verma', dob: '2013-05-12', gender: 'female', year_group_idx: 6, household_idx: 3, parent_indices: [6, 7] },
      { first_name: 'Aarav', last_name: 'Verma', dob: '2016-10-28', gender: 'male', year_group_idx: 3, household_idx: 3, parent_indices: [6, 7] },
      { first_name: 'Myra', last_name: 'Joshi', dob: '2012-12-03', gender: 'female', year_group_idx: 7, household_idx: 4, parent_indices: [8, 9] },
      { first_name: 'Advait', last_name: 'Joshi', dob: '2015-04-22', gender: 'male', year_group_idx: 4, household_idx: 4, parent_indices: [8, 9] },
      { first_name: 'Sara', last_name: 'Gupta', dob: '2014-07-16', gender: 'female', year_group_idx: 5, household_idx: 0, parent_indices: [0, 1] },
      { first_name: 'Dev', last_name: 'Kumar', dob: '2013-10-09', gender: 'male', year_group_idx: 6, household_idx: 1, parent_indices: [2, 3] },
      { first_name: 'Kiara', last_name: 'Verma', dob: '2018-02-20', gender: 'female', year_group_idx: 1, household_idx: 3, parent_indices: [6, 7] },
      { first_name: 'Reyansh', last_name: 'Joshi', dob: '2017-08-11', gender: 'male', year_group_idx: 2, household_idx: 4, parent_indices: [8, 9] },
    ],
  },

  // ── Midaad Ul Qalam: Arabic names (different set) ────────────────────
  {
    slug: 'mdad',
    teachers: [
      { email: 'math.teacher@mdad.test', first_name: 'Tariq', last_name: 'Al-Ameri', locale: 'ar', job_title: 'Mathematics Teacher' },
      { email: 'science.teacher@mdad.test', first_name: 'Salwa', last_name: 'Al-Shamsi', locale: 'ar', job_title: 'Science Teacher' },
      { email: 'arabic.teacher@mdad.test', first_name: 'Faisal', last_name: 'Al-Blooshi', locale: 'ar', job_title: 'Arabic Language Teacher' },
      { email: 'islamic.teacher@mdad.test', first_name: 'Wafa', last_name: 'Al-Qubaisi', locale: 'ar', job_title: 'Islamic Studies Teacher' },
      { email: 'pe.teacher@mdad.test', first_name: 'Majid', last_name: 'Al-Kaabi', locale: 'ar', job_title: 'PE Teacher' },
    ],
    parents: [
      { first_name: 'Youssef', last_name: 'Al-Mulla', email: 'youssef.almulla@email.test', phone: '+971504567001', relationship: 'father' },
      { first_name: 'Mariam', last_name: 'Al-Mulla', phone: '+971504567002', relationship: 'mother' },
      { first_name: 'Saeed', last_name: 'Al-Rumaithi', email: 'saeed.alrumaithi@email.test', phone: '+971504567003', relationship: 'father' },
      { first_name: 'Hala', last_name: 'Al-Rumaithi', phone: '+971504567004', relationship: 'mother' },
      { first_name: 'Jasem', last_name: 'Al-Junaibi', email: 'jasem.aljunaibi@email.test', phone: '+971504567005', relationship: 'father' },
      { first_name: 'Reem', last_name: 'Al-Junaibi', phone: '+971504567006', relationship: 'mother' },
      { first_name: 'Bader', last_name: 'Al-Shehi', email: 'bader.alshehi@email.test', phone: '+971504567007', relationship: 'father' },
      { first_name: 'Mouza', last_name: 'Al-Shehi', phone: '+971504567008', relationship: 'mother' },
      { first_name: 'Thani', last_name: 'Al-Tayer', email: 'thani.altayer@email.test', phone: '+971504567009', relationship: 'father' },
      { first_name: 'Asma', last_name: 'Al-Tayer', phone: '+971504567010', relationship: 'mother' },
    ],
    households: [
      { name: 'Al-Mulla Family', city: 'Fujairah', parent_indices: [0, 1] },
      { name: 'Al-Rumaithi Family', city: 'Ras Al Khaimah', parent_indices: [2, 3] },
      { name: 'Al-Junaibi Family', city: 'Ajman', parent_indices: [4, 5] },
      { name: 'Al-Shehi Family', city: 'Umm Al Quwain', parent_indices: [6, 7] },
      { name: 'Al-Tayer Family', city: 'Abu Dhabi', parent_indices: [8, 9] },
    ],
    students: [
      { first_name: 'Salem', last_name: 'Al-Mulla', dob: '2019-04-10', gender: 'male', year_group_idx: 0, household_idx: 0, parent_indices: [0, 1] },
      { first_name: 'Noora', last_name: 'Al-Mulla', dob: '2017-01-18', gender: 'female', year_group_idx: 2, household_idx: 0, parent_indices: [0, 1] },
      { first_name: 'Turki', last_name: 'Al-Rumaithi', dob: '2018-08-25', gender: 'male', year_group_idx: 1, household_idx: 1, parent_indices: [2, 3] },
      { first_name: 'Lulwa', last_name: 'Al-Rumaithi', dob: '2015-12-07', gender: 'female', year_group_idx: 4, household_idx: 1, parent_indices: [2, 3] },
      { first_name: 'Humaid', last_name: 'Al-Rumaithi', dob: '2013-03-14', gender: 'male', year_group_idx: 6, household_idx: 1, parent_indices: [2, 3] },
      { first_name: 'Mayed', last_name: 'Al-Junaibi', dob: '2016-07-21', gender: 'male', year_group_idx: 3, household_idx: 2, parent_indices: [4, 5] },
      { first_name: 'Wadha', last_name: 'Al-Junaibi', dob: '2019-02-03', gender: 'female', year_group_idx: 0, household_idx: 2, parent_indices: [4, 5] },
      { first_name: 'Abdulla', last_name: 'Al-Shehi', dob: '2014-09-28', gender: 'male', year_group_idx: 5, household_idx: 3, parent_indices: [6, 7] },
      { first_name: 'Shaikha', last_name: 'Al-Shehi', dob: '2017-05-15', gender: 'female', year_group_idx: 2, household_idx: 3, parent_indices: [6, 7] },
      { first_name: 'Saoud', last_name: 'Al-Shehi', dob: '2012-11-09', gender: 'male', year_group_idx: 7, household_idx: 3, parent_indices: [6, 7] },
      { first_name: 'Hamda', last_name: 'Al-Tayer', dob: '2016-01-30', gender: 'female', year_group_idx: 3, household_idx: 4, parent_indices: [8, 9] },
      { first_name: 'Rashid', last_name: 'Al-Tayer', dob: '2014-06-17', gender: 'male', year_group_idx: 5, household_idx: 4, parent_indices: [8, 9] },
      { first_name: 'Alia', last_name: 'Al-Mulla', dob: '2015-10-24', gender: 'female', year_group_idx: 4, household_idx: 0, parent_indices: [0, 1] },
      { first_name: 'Omar', last_name: 'Al-Junaibi', dob: '2013-08-12', gender: 'male', year_group_idx: 6, household_idx: 2, parent_indices: [4, 5] },
      { first_name: 'Jawaher', last_name: 'Al-Tayer', dob: '2018-12-05', gender: 'female', year_group_idx: 1, household_idx: 4, parent_indices: [8, 9] },
    ],
  },
];

// ─── Academic structure (same for all schools) ───────────────────────────────

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

const SUBJECTS = [
  { name: 'Mathematics', name_ar: 'الرياضيات', type: 'academic' as const },
  { name: 'English Language', name_ar: 'اللغة الإنجليزية', type: 'academic' as const },
  { name: 'Arabic Language', name_ar: 'اللغة العربية', type: 'academic' as const },
  { name: 'Science', name_ar: 'العلوم', type: 'academic' as const },
  { name: 'Social Studies', name_ar: 'الدراسات الاجتماعية', type: 'academic' as const },
  { name: 'Islamic Studies', name_ar: 'التربية الإسلامية', type: 'academic' as const },
  { name: 'Physical Education', name_ar: 'التربية البدنية', type: 'supervision' as const },
  { name: 'Art', name_ar: 'الفنون', type: 'academic' as const },
];

// ─── Main seed function ──────────────────────────────────────────────────────

async function seedSchoolData(): Promise<void> {
  console.log('=== Seeding comprehensive school data for RLS testing ===\n');

  const passwordHash = await PASSWORD_HASH_PROMISE;

  for (const school of SCHOOL_DATA) {
    const tenant = await prisma.tenant.findUnique({ where: { slug: school.slug } });
    if (!tenant) {
      console.error(`  Tenant "${school.slug}" not found. Run base seed first.`);
      continue;
    }

    console.log(`\n── ${tenant.name} (${school.slug}) ──`);

    // 1. Ensure academic structure
    const { academicYear, yearGroups, subjects } = await ensureAcademicStructure(tenant.id);
    console.log(`  Academic structure: 1 year, ${yearGroups.length} year groups, ${subjects.length} subjects`);

    // 2. Create teacher users + staff profiles
    const staffProfiles = await createTeachersAndStaff(tenant.id, school, passwordHash);
    console.log(`  Staff profiles: ${staffProfiles.length} (including existing teacher user)`);

    // 3. Create parents
    const parents = await createParents(tenant.id, school, passwordHash);
    console.log(`  Parents: ${parents.length}`);

    // 4. Create households and link parents
    const households = await createHouseholds(tenant.id, school, parents);
    console.log(`  Households: ${households.length}`);

    // 5. Create students and link to households + parents + year groups
    const students = await createStudents(tenant.id, school, households, parents, yearGroups);
    console.log(`  Students: ${students.length}`);

    // 6. Create classes per year group (Math + English for each)
    const classes = await createClasses(tenant.id, academicYear.id, yearGroups, subjects, staffProfiles);
    console.log(`  Classes: ${classes.length}`);

    // 7. Enrol students in classes
    const enrolments = await enrolStudents(tenant.id, students, classes, yearGroups);
    console.log(`  Class enrolments: ${enrolments}`);
  }

  console.log('\n=== School data seeding complete ===');
  console.log('\nAll new teacher accounts use password: Password123!');
  console.log('Example: math.teacher@alnoor.test / Password123!');
}

// ─── Academic structure ──────────────────────────────────────────────────────

async function ensureAcademicStructure(tenantId: string) {
  const tid = tenantId.substring(0, 8);

  // Academic year
  const academicYear = await prisma.academicYear.upsert({
    where: { id: `demo-ay-${tid}` },
    update: {},
    create: {
      id: `demo-ay-${tid}`,
      tenant_id: tenantId,
      name: '2025-2026',
      start_date: new Date('2025-09-01'),
      end_date: new Date('2026-06-30'),
      status: 'active',
    },
  });

  // Academic periods
  const periods = [
    { name: 'Term 1', name_ar: 'الفصل الأول', start: '2025-09-01', end: '2025-12-15' },
    { name: 'Term 2', name_ar: 'الفصل الثاني', start: '2026-01-05', end: '2026-03-20' },
    { name: 'Term 3', name_ar: 'الفصل الثالث', start: '2026-04-01', end: '2026-06-30' },
  ];
  for (let i = 0; i < periods.length; i++) {
    await prisma.academicPeriod.upsert({
      where: { id: `demo-ap-${tid}-${i}` },
      update: {},
      create: {
        id: `demo-ap-${tid}-${i}`,
        tenant_id: tenantId,
        academic_year_id: academicYear.id,
        name: periods[i]!.name,
        period_type: 'term',
        start_date: new Date(periods[i]!.start),
        end_date: new Date(periods[i]!.end),
        status: 'active',
      },
    });
  }

  // Year groups
  const yearGroups: Array<{ id: string; name: string }> = [];
  for (let i = 0; i < YEAR_GROUP_NAMES.length; i++) {
    const yg = await prisma.yearGroup.upsert({
      where: { id: `demo-yg-${tid}-${i}` },
      update: {},
      create: {
        id: `demo-yg-${tid}-${i}`,
        tenant_id: tenantId,
        name: YEAR_GROUP_NAMES[i]!.name,
        display_order: i + 1,
      },
    });
    yearGroups.push(yg);
  }

  // Subjects
  const subjects: Array<{ id: string; name: string }> = [];
  for (let i = 0; i < SUBJECTS.length; i++) {
    const subj = await prisma.subject.upsert({
      where: { id: `demo-subj-${tid}-${i}` },
      update: {},
      create: {
        id: `demo-subj-${tid}-${i}`,
        tenant_id: tenantId,
        name: SUBJECTS[i]!.name,
        subject_type: SUBJECTS[i]!.type,
      },
    });
    subjects.push(subj);
  }

  return { academicYear, yearGroups, subjects };
}

// ─── Teachers & Staff ────────────────────────────────────────────────────────

async function createTeachersAndStaff(
  tenantId: string,
  school: SchoolSeedData,
  passwordHash: string,
): Promise<Array<{ id: string; user_id: string }>> {
  const staffProfiles: Array<{ id: string; user_id: string }> = [];

  // Get the existing teacher user for this tenant
  const existingTeacherEmail = `teacher@${school.slug === 'al-noor' ? 'alnoor' : school.slug}.test`;
  const existingTeacher = await prisma.user.findUnique({ where: { email: existingTeacherEmail } });

  if (existingTeacher) {
    // Create or find staff profile for existing teacher
    const existingProfile = await prisma.staffProfile.upsert({
      where: { idx_staff_profiles_tenant_user: { tenant_id: tenantId, user_id: existingTeacher.id } },
      update: {},
      create: {
        tenant_id: tenantId,
        user_id: existingTeacher.id,
        job_title: 'Head Teacher',
        employment_status: 'active',
        employment_type: 'full_time',
      },
    });
    staffProfiles.push({ id: existingProfile.id, user_id: existingTeacher.id });
  }

  // Get the teacher role for this tenant
  const teacherRole = await prisma.role.findFirst({
    where: { tenant_id: tenantId, role_key: 'teacher' },
  });

  // Create new teacher users + staff profiles
  for (const teacher of school.teachers) {
    // Upsert user
    const user = await prisma.user.upsert({
      where: { email: teacher.email },
      update: {},
      create: {
        email: teacher.email,
        first_name: teacher.first_name,
        last_name: teacher.last_name,
        password_hash: passwordHash,
        preferred_locale: teacher.locale,
        global_status: 'active',
        email_verified_at: new Date(),
      },
    });

    // Create tenant membership
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

    // Assign teacher role
    if (teacherRole) {
      await prisma.membershipRole.upsert({
        where: { membership_id_role_id: { membership_id: membership.id, role_id: teacherRole.id } },
        update: {},
        create: {
          membership_id: membership.id,
          role_id: teacherRole.id,
          tenant_id: tenantId,
        },
      });
    }

    // Create staff profile
    const profile = await prisma.staffProfile.upsert({
      where: { idx_staff_profiles_tenant_user: { tenant_id: tenantId, user_id: user.id } },
      update: {},
      create: {
        tenant_id: tenantId,
        user_id: user.id,
        job_title: teacher.job_title,
        employment_status: 'active',
        employment_type: 'full_time',
      },
    });

    staffProfiles.push({ id: profile.id, user_id: user.id });
  }

  return staffProfiles;
}

// ─── Parents ─────────────────────────────────────────────────────────────────

async function createParents(
  tenantId: string,
  school: SchoolSeedData,
  passwordHash: string,
): Promise<Array<{ id: string; user_id: string | null }>> {
  const parentRecords: Array<{ id: string; user_id: string | null }> = [];

  // Get the existing parent user for this tenant
  const existingParentEmail = `parent@${school.slug === 'al-noor' ? 'alnoor' : school.slug}.test`;
  const existingParentUser = await prisma.user.findUnique({ where: { email: existingParentEmail } });

  // Get the parent role
  const parentRole = await prisma.role.findFirst({
    where: { tenant_id: tenantId, role_key: 'parent' },
  });

  for (let i = 0; i < school.parents.length; i++) {
    const p = school.parents[i]!;
    let userId: string | null = null;

    // Link the first parent to the existing parent user account
    if (i === 0 && existingParentUser) {
      userId = existingParentUser.id;
    }

    // For parents with emails, create user accounts (gives them login access)
    if (p.email && !userId) {
      const user = await prisma.user.upsert({
        where: { email: p.email },
        update: {},
        create: {
          email: p.email,
          first_name: p.first_name,
          last_name: p.last_name,
          password_hash: passwordHash,
          preferred_locale: school.slug === 'al-noor' || school.slug === 'mdad' ? 'ar' : 'en',
          global_status: 'active',
          email_verified_at: new Date(),
        },
      });
      userId = user.id;

      // Create membership + role
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

      if (parentRole) {
        await prisma.membershipRole.upsert({
          where: { membership_id_role_id: { membership_id: membership.id, role_id: parentRole.id } },
          update: {},
          create: { membership_id: membership.id, role_id: parentRole.id, tenant_id: tenantId },
        });
      }
    }

    // Create the parent record (tenant-scoped)
    const parent = await prisma.parent.create({
      data: {
        tenant_id: tenantId,
        user_id: userId,
        first_name: p.first_name,
        last_name: p.last_name,
        email: p.email ?? null,
        phone: p.phone ?? null,
        relationship_label: p.relationship,
        is_primary_contact: i % 2 === 0, // fathers are primary
        is_billing_contact: i % 2 === 0,
        preferred_contact_channels: ['email'],
        status: 'active',
      },
    });

    parentRecords.push({ id: parent.id, user_id: userId });
  }

  return parentRecords;
}

// ─── Households ──────────────────────────────────────────────────────────────

async function createHouseholds(
  tenantId: string,
  school: SchoolSeedData,
  parents: Array<{ id: string; user_id: string | null }>,
): Promise<Array<{ id: string }>> {
  const householdRecords: Array<{ id: string }> = [];

  for (const h of school.households) {
    const billingParentId = parents[h.parent_indices[0]!]?.id ?? null;

    const household = await prisma.household.create({
      data: {
        tenant_id: tenantId,
        household_name: h.name,
        primary_billing_parent_id: billingParentId,
        city: h.city,
        country: 'UAE',
        status: 'active',
        needs_completion: false,
      },
    });

    // Link parents to household
    for (const pi of h.parent_indices) {
      const parent = parents[pi];
      if (parent) {
        await prisma.householdParent.create({
          data: {
            household_id: household.id,
            parent_id: parent.id,
            tenant_id: tenantId,
            role_label: school.parents[pi]?.relationship ?? null,
          },
        });
      }
    }

    householdRecords.push({ id: household.id });
  }

  return householdRecords;
}

// ─── Students ────────────────────────────────────────────────────────────────

async function createStudents(
  tenantId: string,
  school: SchoolSeedData,
  households: Array<{ id: string }>,
  parents: Array<{ id: string; user_id: string | null }>,
  yearGroups: Array<{ id: string; name: string }>,
): Promise<Array<{ id: string; year_group_idx: number }>> {
  const studentRecords: Array<{ id: string; year_group_idx: number }> = [];
  let studentNum = 1;

  for (const s of school.students) {
    const household = households[s.household_idx];
    const yearGroup = yearGroups[s.year_group_idx];
    if (!household || !yearGroup) continue;

    const student = await prisma.student.create({
      data: {
        tenant_id: tenantId,
        household_id: household.id,
        student_number: `${school.slug.toUpperCase()}-${String(studentNum++).padStart(4, '0')}`,
        first_name: s.first_name,
        last_name: s.last_name,
        date_of_birth: new Date(s.dob),
        gender: s.gender,
        status: 'active',
        entry_date: new Date('2025-09-01'),
        year_group_id: yearGroup.id,
      },
    });

    // Link student to parents
    for (const pi of s.parent_indices) {
      const parent = parents[pi];
      if (parent) {
        await prisma.studentParent.create({
          data: {
            student_id: student.id,
            parent_id: parent.id,
            tenant_id: tenantId,
            relationship_label: school.parents[pi]?.relationship ?? null,
          },
        });
      }
    }

    studentRecords.push({ id: student.id, year_group_idx: s.year_group_idx });
  }

  return studentRecords;
}

// ─── Classes ─────────────────────────────────────────────────────────────────

async function createClasses(
  tenantId: string,
  academicYearId: string,
  yearGroups: Array<{ id: string; name: string }>,
  subjects: Array<{ id: string; name: string }>,
  staffProfiles: Array<{ id: string; user_id: string }>,
): Promise<Array<{ id: string; year_group_id: string; subject_id: string | null }>> {
  const classRecords: Array<{ id: string; year_group_id: string; subject_id: string | null }> = [];

  // Create 2 classes per year group: Math and English
  const mathSubject = subjects.find((s) => s.name === 'Mathematics');
  const englishSubject = subjects.find((s) => s.name === 'English Language');

  for (let ygIdx = 0; ygIdx < yearGroups.length; ygIdx++) {
    const yg = yearGroups[ygIdx]!;

    for (const subj of [mathSubject, englishSubject]) {
      if (!subj) continue;

      const shortSubj = subj.name === 'Mathematics' ? 'Math' : 'English';
      const className = `${yg.name} - ${shortSubj}`;

      // Assign a teacher (round-robin)
      const teacherIdx = (ygIdx * 2 + classRecords.length) % staffProfiles.length;
      const teacher = staffProfiles[teacherIdx];

      const existingClass = await prisma.class.findFirst({
        where: { tenant_id: tenantId, name: className, academic_year_id: academicYearId },
      });

      if (existingClass) {
        classRecords.push({ id: existingClass.id, year_group_id: yg.id, subject_id: subj.id });
        continue;
      }

      const cls = await prisma.class.create({
        data: {
          tenant_id: tenantId,
          academic_year_id: academicYearId,
          year_group_id: yg.id,
          subject_id: subj.id,
          homeroom_teacher_staff_id: teacher?.id ?? null,
          name: className,
          status: 'active',
        },
      });

      // Assign teacher to class
      if (teacher) {
        await prisma.classStaff.upsert({
          where: {
            class_id_staff_profile_id_assignment_role: {
              class_id: cls.id,
              staff_profile_id: teacher.id,
              assignment_role: 'teacher',
            },
          },
          update: {},
          create: {
            class_id: cls.id,
            staff_profile_id: teacher.id,
            assignment_role: 'teacher',
            tenant_id: tenantId,
          },
        });
      }

      classRecords.push({ id: cls.id, year_group_id: yg.id, subject_id: subj.id });
    }
  }

  return classRecords;
}

// ─── Enrolments ──────────────────────────────────────────────────────────────

async function enrolStudents(
  tenantId: string,
  students: Array<{ id: string; year_group_idx: number }>,
  classes: Array<{ id: string; year_group_id: string; subject_id: string | null }>,
  yearGroups: Array<{ id: string; name: string }>,
): Promise<number> {
  let count = 0;

  for (const student of students) {
    const yg = yearGroups[student.year_group_idx];
    if (!yg) continue;

    // Find all classes for this student's year group
    const matchingClasses = classes.filter((c) => c.year_group_id === yg.id);

    for (const cls of matchingClasses) {
      await prisma.classEnrolment.create({
        data: {
          tenant_id: tenantId,
          class_id: cls.id,
          student_id: student.id,
          status: 'active',
          start_date: new Date('2025-09-01'),
        },
      });
      count++;
    }
  }

  return count;
}

// ─── Entry point ─────────────────────────────────────────────────────────────

seedSchoolData()
  .then(() => prisma.$disconnect())
  .catch((error) => {
    console.error('School data seed failed:', error);
    prisma.$disconnect();
    process.exit(1);
  });
