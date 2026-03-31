/**
 * Unit tests for TimetableGrid — pure helper functions.
 *
 * TimetableGrid contains three private helpers that hold all the testable logic:
 *   - formatTime: converts HH:MM string to 12-hour display format
 *   - getTimeSlots: extracts and sorts unique start times from entries
 *   - getSubjectColor: assigns deterministic color classes from a rotating palette
 *
 * We replicate these functions here so they can be tested without mounting
 * React or importing the component (which depends on next-intl).
 */

// ─── Types ─────────────────────────────────────────────────────────────────────

interface TimetableEntry {
  id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  class_name: string;
  room_name?: string;
  teacher_name?: string;
  subject_name?: string;
}

// ─── Pure helpers (mirrored from timetable-grid.tsx) ─────────────────────────

const SUBJECT_COLORS = [
  'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300',
  'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300',
  'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
];

const FALLBACK_COLOR = 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300';

function getSubjectColor(subjectName: string | undefined, colorMap: Map<string, string>): string {
  if (!subjectName) return FALLBACK_COLOR;
  if (!colorMap.has(subjectName)) {
    colorMap.set(
      subjectName,
      SUBJECT_COLORS[colorMap.size % SUBJECT_COLORS.length] ?? SUBJECT_COLORS[0] ?? '',
    );
  }
  return colorMap.get(subjectName)!;
}

function formatTime(time: string): string {
  const parts = time.split(':');
  const hours = parts[0] ?? '0';
  const minutes = parts[1] ?? '00';
  const h = parseInt(hours, 10);
  const period = h >= 12 ? 'PM' : 'AM';
  const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${displayHour}:${minutes} ${period}`;
}

function getTimeSlots(entries: TimetableEntry[]): string[] {
  const slots = new Set<string>();
  for (const entry of entries) {
    slots.add(entry.start_time);
  }
  return Array.from(slots).sort();
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('TimetableGrid — helper functions', () => {
  afterEach(() => jest.clearAllMocks());

  // ─── formatTime ────────────────────────────────────────────────────────────

  describe('formatTime', () => {
    it('should format a morning hour correctly', () => {
      expect(formatTime('08:30')).toBe('8:30 AM');
    });

    it('should format noon as 12:00 PM', () => {
      expect(formatTime('12:00')).toBe('12:00 PM');
    });

    it('should format an afternoon hour correctly', () => {
      expect(formatTime('13:45')).toBe('1:45 PM');
    });

    it('should format midnight (00:00) as 12:00 AM', () => {
      expect(formatTime('00:00')).toBe('12:00 AM');
    });

    it('should format 23:59 as 11:59 PM', () => {
      expect(formatTime('23:59')).toBe('11:59 PM');
    });

    it('should preserve leading zeros in minutes', () => {
      expect(formatTime('09:05')).toBe('9:05 AM');
    });
  });

  // ─── getTimeSlots ──────────────────────────────────────────────────────────

  describe('getTimeSlots', () => {
    it('should return an empty array for no entries', () => {
      expect(getTimeSlots([])).toEqual([]);
    });

    it('should return deduplicated sorted time slots', () => {
      const entries: TimetableEntry[] = [
        { id: '1', weekday: 1, start_time: '10:00', end_time: '11:00', class_name: 'A' },
        { id: '2', weekday: 2, start_time: '08:00', end_time: '09:00', class_name: 'B' },
        { id: '3', weekday: 1, start_time: '10:00', end_time: '11:00', class_name: 'C' },
      ];
      expect(getTimeSlots(entries)).toEqual(['08:00', '10:00']);
    });

    it('should sort slots in ascending order', () => {
      const entries: TimetableEntry[] = [
        { id: '1', weekday: 1, start_time: '14:00', end_time: '15:00', class_name: 'A' },
        { id: '2', weekday: 2, start_time: '08:00', end_time: '09:00', class_name: 'B' },
        { id: '3', weekday: 3, start_time: '11:00', end_time: '12:00', class_name: 'C' },
      ];
      expect(getTimeSlots(entries)).toEqual(['08:00', '11:00', '14:00']);
    });

    it('should handle a single entry', () => {
      const entries: TimetableEntry[] = [
        { id: '1', weekday: 3, start_time: '09:00', end_time: '10:00', class_name: 'Maths' },
      ];
      expect(getTimeSlots(entries)).toEqual(['09:00']);
    });
  });

  // ─── getSubjectColor ───────────────────────────────────────────────────────

  describe('getSubjectColor', () => {
    it('should return the fallback color for undefined subject', () => {
      const colorMap = new Map<string, string>();
      expect(getSubjectColor(undefined, colorMap)).toBe(FALLBACK_COLOR);
    });

    it('should return the fallback color for empty string subject', () => {
      const colorMap = new Map<string, string>();
      expect(getSubjectColor('', colorMap)).toBe(FALLBACK_COLOR);
    });

    it('should assign the first palette color to the first subject', () => {
      const colorMap = new Map<string, string>();
      expect(getSubjectColor('Maths', colorMap)).toBe(SUBJECT_COLORS[0]);
    });

    it('should assign the second palette color to a new distinct subject', () => {
      const colorMap = new Map<string, string>();
      getSubjectColor('Maths', colorMap);
      expect(getSubjectColor('English', colorMap)).toBe(SUBJECT_COLORS[1]);
    });

    it('should return the same color for the same subject on repeated calls', () => {
      const colorMap = new Map<string, string>();
      const first = getSubjectColor('Science', colorMap);
      const second = getSubjectColor('Science', colorMap);
      expect(first).toBe(second);
    });

    it('should wrap around to the first color after exhausting the palette', () => {
      const colorMap = new Map<string, string>();
      const subjects = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
      subjects.forEach((s) => getSubjectColor(s, colorMap));
      // 9th subject wraps to index 0
      expect(getSubjectColor('I', colorMap)).toBe(SUBJECT_COLORS[0]);
    });
  });
});
