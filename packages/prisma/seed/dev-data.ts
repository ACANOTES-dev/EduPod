/**
 * Development seed data: 2 school tenants with users.
 * Only used in local/staging environments.
 */

import { hash } from 'bcryptjs';

const DEV_PASSWORD = 'Password123!';
const BCRYPT_ROUNDS = 10;

export interface DevTenant {
  name: string;
  slug: string;
  default_locale: string;
  timezone: string;
  date_format: string;
  currency_code: string;
  academic_year_start_month: number;
  domain: string;
}

export interface DevUser {
  email: string;
  first_name: string;
  last_name: string;
  phone?: string;
  preferred_locale?: string;
  role_key: string;
  tenant_slug: string;
}

export const DEV_TENANTS: DevTenant[] = [
  {
    name: 'Al Noor Academy',
    slug: 'al-noor',
    default_locale: 'ar',
    timezone: 'Asia/Dubai',
    date_format: 'DD-MM-YYYY',
    currency_code: 'AED',
    academic_year_start_month: 9,
    domain: 'al-noor.edupod.app',
  },
  {
    name: 'Cedar International School',
    slug: 'cedar',
    default_locale: 'en',
    timezone: 'Asia/Dubai',
    date_format: 'DD-MM-YYYY',
    currency_code: 'AED',
    academic_year_start_month: 9,
    domain: 'cedar.edupod.app',
  },
  {
    name: 'Nurul Huda School',
    slug: 'nhqs',
    default_locale: 'en',
    timezone: 'Asia/Dubai',
    date_format: 'DD-MM-YYYY',
    currency_code: 'AED',
    academic_year_start_month: 9,
    domain: 'nhqs.edupod.app',
  },
  {
    name: 'Midaad Ul Qalam',
    slug: 'mdad',
    default_locale: 'ar',
    timezone: 'Asia/Dubai',
    date_format: 'DD-MM-YYYY',
    currency_code: 'AED',
    academic_year_start_month: 9,
    domain: 'mdad.edupod.app',
  },
];

export const DEV_PLATFORM_USER = {
  email: 'admin@edupod.app',
  first_name: 'Platform',
  last_name: 'Admin',
  preferred_locale: 'en',
};

export const DEV_USERS: DevUser[] = [
  // Al Noor
  { email: 'owner@alnoor.test', first_name: 'Fatima', last_name: 'Al-Rashid', preferred_locale: 'ar', role_key: 'school_principal', tenant_slug: 'al-noor' },
  { email: 'admin@alnoor.test', first_name: 'Ahmed', last_name: 'Hassan', preferred_locale: 'ar', role_key: 'admin', tenant_slug: 'al-noor' },
  { email: 'teacher@alnoor.test', first_name: 'Layla', last_name: 'Ibrahim', preferred_locale: 'ar', role_key: 'teacher', tenant_slug: 'al-noor' },
  { email: 'parent@alnoor.test', first_name: 'Omar', last_name: 'Khalil', preferred_locale: 'ar', role_key: 'parent', tenant_slug: 'al-noor' },
  // Cedar
  { email: 'owner@cedar.test', first_name: 'Sarah', last_name: 'Mitchell', preferred_locale: 'en', role_key: 'school_principal', tenant_slug: 'cedar' },
  { email: 'admin@cedar.test', first_name: 'James', last_name: 'Cooper', preferred_locale: 'en', role_key: 'admin', tenant_slug: 'cedar' },
  { email: 'teacher@cedar.test', first_name: 'Emily', last_name: 'Chen', preferred_locale: 'en', role_key: 'teacher', tenant_slug: 'cedar' },
  { email: 'parent@cedar.test', first_name: 'David', last_name: 'Brown', preferred_locale: 'en', role_key: 'parent', tenant_slug: 'cedar' },
  // Nurul Huda
  { email: 'owner@nhqs.test', first_name: 'Yusuf', last_name: 'Rahman', preferred_locale: 'en', role_key: 'school_principal', tenant_slug: 'nhqs' },
  { email: 'admin@nhqs.test', first_name: 'Aisha', last_name: 'Patel', preferred_locale: 'en', role_key: 'admin', tenant_slug: 'nhqs' },
  { email: 'teacher@nhqs.test', first_name: 'Hamza', last_name: 'Khan', preferred_locale: 'en', role_key: 'teacher', tenant_slug: 'nhqs' },
  { email: 'parent@nhqs.test', first_name: 'Zainab', last_name: 'Ali', preferred_locale: 'en', role_key: 'parent', tenant_slug: 'nhqs' },
  // Midaad Ul Qalam
  { email: 'owner@mdad.test', first_name: 'Abdullah', last_name: 'Al-Farsi', preferred_locale: 'ar', role_key: 'school_principal', tenant_slug: 'mdad' },
  { email: 'admin@mdad.test', first_name: 'Maryam', last_name: 'Al-Sayed', preferred_locale: 'ar', role_key: 'admin', tenant_slug: 'mdad' },
  { email: 'teacher@mdad.test', first_name: 'Ibrahim', last_name: 'Nasser', preferred_locale: 'ar', role_key: 'teacher', tenant_slug: 'mdad' },
  { email: 'parent@mdad.test', first_name: 'Khadija', last_name: 'Mahmoud', preferred_locale: 'ar', role_key: 'parent', tenant_slug: 'mdad' },
];

export async function hashPassword(password: string): Promise<string> {
  return hash(password, BCRYPT_ROUNDS);
}

export { DEV_PASSWORD };
