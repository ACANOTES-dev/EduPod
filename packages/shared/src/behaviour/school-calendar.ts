/**
 * School calendar utilities for behaviour module.
 * These functions need a database client to check school closures,
 * so they accept a closure checker function rather than importing Prisma directly.
 */

export type ClosureChecker = (date: Date) => Promise<boolean>;

const DEFAULT_WEEKEND_DAYS = [0, 6]; // Sunday, Saturday

export function isWeekend(date: Date, weekendDays: number[] = DEFAULT_WEEKEND_DAYS): boolean {
  return weekendDays.includes(date.getDay());
}

export async function isSchoolDay(
  date: Date,
  isClosureDate: ClosureChecker,
  weekendDays: number[] = DEFAULT_WEEKEND_DAYS,
): Promise<boolean> {
  if (isWeekend(date, weekendDays)) return false;
  const isClosure = await isClosureDate(date);
  return !isClosure;
}

export async function addSchoolDays(
  fromDate: Date,
  days: number,
  isClosureDate: ClosureChecker,
  weekendDays: number[] = DEFAULT_WEEKEND_DAYS,
): Promise<Date> {
  const result = new Date(fromDate);
  let remaining = days;

  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    const schoolDay = await isSchoolDay(result, isClosureDate, weekendDays);
    if (schoolDay) {
      remaining--;
    }
  }

  return result;
}

export async function getNextSchoolDay(
  fromDate: Date,
  isClosureDate: ClosureChecker,
  weekendDays: number[] = DEFAULT_WEEKEND_DAYS,
): Promise<Date> {
  return addSchoolDays(fromDate, 1, isClosureDate, weekendDays);
}
