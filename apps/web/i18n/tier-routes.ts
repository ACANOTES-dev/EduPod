import { REGISTERED_LOCALE_CODES } from './registry';

const IN_SCOPE_PREFIXES = [
  '/',
  '/announcements',
  '/apply',
  '/behaviour/parent-portal',
  '/contact',
  '/dashboard/parent',
  '/dashboard/student',
  '/engagement/parent',
  '/forgot-password',
  '/homework/parent',
  '/inbox',
  '/inquiries',
  '/legal',
  '/login',
  '/logout',
  '/mfa',
  '/mfa-verify',
  '/parent',
  '/payment-cancelled',
  '/payment-success',
  '/privacy-consent',
  '/privacy-notice',
  '/profile',
  '/register',
  '/reset-password',
  '/select-school',
  '/student',
  '/sub-processors',
  '/verify',
  '/wellbeing/survey',
] as const;

const OUT_OF_SCOPE_PREFIXES = [
  '/admin',
  '/admissions',
  '/assessments',
  '/attendance',
  '/behaviour',
  '/class-assignments',
  '/classes',
  '/communications',
  '/curriculum-matrix',
  '/early-warnings',
  '/finance',
  '/gradebook',
  '/households',
  '/imports',
  '/leave',
  '/learning',
  '/operations',
  '/pastoral',
  '/payroll',
  '/people',
  '/platform',
  '/promotion',
  '/regulatory',
  '/reports',
  '/safeguarding',
  '/schedules',
  '/scheduling',
  '/settings',
  '/staff',
  '/students',
  '/subjects',
  '/teacher',
  '/timetables',
  '/website',
  '/wellbeing',
] as const;

function pathMatchesPrefix(path: string, prefix: string): boolean {
  if (prefix === '/') {
    return path === '/';
  }

  return path === prefix || path.startsWith(`${prefix}/`);
}

export function stripLocalePrefix(path: string): string {
  const segments = path.split('/');
  const maybeLocale = segments[1];

  if (maybeLocale && REGISTERED_LOCALE_CODES.includes(maybeLocale)) {
    const stripped = `/${segments.slice(2).join('/')}`;
    return stripped === '/' ? '/' : stripped.replace(/\/+$/, '');
  }

  return path === '/' ? '/' : path.replace(/\/+$/, '');
}

export function isPathInTier2Scope(path: string): boolean {
  const stripped = stripLocalePrefix(path);

  if (stripped === '/dashboard/teacher' || stripped.startsWith('/dashboard/teacher/')) {
    return false;
  }

  if (stripped === '/inbox/audiences' || stripped.startsWith('/inbox/audiences/')) {
    return false;
  }

  if (stripped === '/inbox/oversight' || stripped.startsWith('/inbox/oversight/')) {
    return false;
  }

  if (
    OUT_OF_SCOPE_PREFIXES.some((prefix) => pathMatchesPrefix(stripped, prefix)) &&
    !IN_SCOPE_PREFIXES.some((prefix) => pathMatchesPrefix(stripped, prefix))
  ) {
    return false;
  }

  if (IN_SCOPE_PREFIXES.some((prefix) => pathMatchesPrefix(stripped, prefix))) {
    return true;
  }

  return false;
}
