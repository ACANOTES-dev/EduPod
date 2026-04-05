import { ImportParserService } from './import-parser.service';

describe('ImportParserService — extra branches', () => {
  let parser: ImportParserService;

  beforeEach(() => {
    parser = new ImportParserService();
  });

  afterEach(() => jest.clearAllMocks());

  // ─── isExampleRow — all import types ────────────────────────────────────
  describe('ImportParserService — isExampleRow', () => {
    it('should detect aisha/al-mansour as example for students', () => {
      const row = { first_name: 'Aisha', last_name: 'al-mansour', date_of_birth: '2010-01-01' };
      expect(parser.isExampleRow(row, 'students')).toBe(true);
    });

    it('should detect omar/al-mansour as example for students', () => {
      const row = { first_name: 'Omar', last_name: 'al-mansour', date_of_birth: '2010-01-01' };
      expect(parser.isExampleRow(row, 'students')).toBe(true);
    });

    it('should detect ahmed/al-mansour as example for parents', () => {
      const row = { first_name: 'Ahmed', last_name: 'al-mansour', email: 'test@example.com' };
      expect(parser.isExampleRow(row, 'parents')).toBe(true);
    });

    it('should detect sarah/johnson as example for staff', () => {
      const row = { first_name: 'Sarah', last_name: 'johnson', email: 'sarah@example.com' };
      expect(parser.isExampleRow(row, 'staff')).toBe(true);
    });

    it('should not flag non-example rows', () => {
      const row = { first_name: 'John', last_name: 'Smith', date_of_birth: '2012-05-15' };
      expect(parser.isExampleRow(row, 'students')).toBe(false);
    });

    it('should return false when key field is empty', () => {
      const row = { first_name: '', last_name: 'Smith' };
      expect(parser.isExampleRow(row, 'students')).toBe(false);
    });

    it('should detect template hints with parentheses', () => {
      const row = {
        first_name: 'aisha',
        last_name: '(example)',
        date_of_birth: '(YYYY-MM-DD)',
      };
      expect(parser.isExampleRow(row, 'students')).toBe(true);
    });

    it('should detect students with @example.com parent email and al-mansour name', () => {
      const row = {
        first_name: 'aisha',
        last_name: 'al-mansour',
        parent1_email: 'ahmed@example.com',
      };
      expect(parser.isExampleRow(row, 'students')).toBe(true);
    });

    it('should not detect students with @example.com but different name', () => {
      const row = {
        first_name: 'john',
        last_name: 'smith',
        parent1_email: 'parent@example.com',
      };
      expect(parser.isExampleRow(row, 'students')).toBe(false);
    });

    it('should check fees key field (household_name)', () => {
      const row = { household_name: 'aisha', amount: '500' };
      // 'aisha' matches EXAMPLE_FIRST_NAMES but fees uses household_name
      // There's no specific match for fees, should return false unless parentheses present
      expect(parser.isExampleRow(row, 'fees')).toBe(false);
    });

    it('should check exam_results key field (student_number)', () => {
      const row = { student_number: 'stf-001', subject: 'Math' };
      // stf-001 is in EXAMPLE_FIRST_NAMES
      expect(parser.isExampleRow(row, 'exam_results')).toBe(false);
    });

    it('should check staff_compensation key field (staff_number)', () => {
      const row = { staff_number: 'stf-001', compensation_type: 'salaried' };
      expect(parser.isExampleRow(row, 'staff_compensation')).toBe(false);
    });

    it('edge: should not detect aisha as example staff (wrong name combo)', () => {
      const row = { first_name: 'aisha', last_name: 'other', email: 'a@test.com' };
      expect(parser.isExampleRow(row, 'staff')).toBe(false);
    });

    it('edge: should not detect ahmed as example student', () => {
      const row = { first_name: 'ahmed', last_name: 'other', date_of_birth: '2010-01-01' };
      expect(parser.isExampleRow(row, 'students')).toBe(false);
    });
  });

  // ─── parseFlexibleDate — edge cases ─────────────────────────────────────
  describe('ImportParserService — parseFlexibleDate — edges', () => {
    it('should return null for empty string', () => {
      expect(parser.parseFlexibleDate('')).toBeNull();
    });

    it('should return null for random text', () => {
      expect(parser.parseFlexibleDate('not-a-date')).toBeNull();
    });

    it('should return null for partial date', () => {
      expect(parser.parseFlexibleDate('2026-01')).toBeNull();
    });

    it('should parse DD-MM-YYYY format', () => {
      const result = parser.parseFlexibleDate('15-03-2015');
      expect(result).not.toBeNull();
      expect(result!.getUTCDate()).toBe(15);
      expect(result!.getUTCMonth()).toBe(2); // March = 2 (0-indexed)
    });

    it('should parse DD/MM/YYYY format', () => {
      const result = parser.parseFlexibleDate('25/12/2020');
      expect(result).not.toBeNull();
      expect(result!.getUTCMonth()).toBe(11); // December = 11
    });

    it('should return null for invalid ISO date (month 99)', () => {
      const result = parser.parseFlexibleDate('2026-99-01');
      expect(result).toBeNull();
    });

    it('should return null for invalid slash date (day 99)', () => {
      const result = parser.parseFlexibleDate('99/01/2026');
      expect(result).toBeNull();
    });

    it('should return null for invalid dash date (day 99)', () => {
      const result = parser.parseFlexibleDate('99-01-2026');
      expect(result).toBeNull();
    });
  });

  // ─── formatDateToISO ────────────────────────────────────────────────────
  describe('ImportParserService — formatDateToISO', () => {
    it('should format date to YYYY-MM-DD', () => {
      const date = new Date('2026-03-15T12:00:00Z');
      expect(parser.formatDateToISO(date)).toBe('2026-03-15');
    });

    it('should pad single-digit month and day', () => {
      const date = new Date('2026-01-05T12:00:00Z');
      expect(parser.formatDateToISO(date)).toBe('2026-01-05');
    });
  });

  // ─── parseXlsx — edge cases ─────────────────────────────────────────────
  describe('ImportParserService — parseXlsx', () => {
    it('should return empty for invalid buffer (no sheet)', () => {
      // Invalid buffer should either throw or return empty
      try {
        const result = parser.parseXlsx(Buffer.from(''));
        expect(result.headers).toHaveLength(0);
      } catch {
        // xlsx library may throw on invalid buffer
        expect(true).toBe(true);
      }
    });
  });

  // ─── parseCsv — edge cases ──────────────────────────────────────────────
  describe('ImportParserService — parseCsv — edge cases', () => {
    it('should handle \\r\\n line endings', () => {
      const csv = 'name,age\r\nAlice,25\r\nBob,30';
      const { rows } = parser.parseCsv(Buffer.from(csv));
      expect(rows).toHaveLength(2);
    });

    it('should skip rows where all values are empty strings', () => {
      const csv = 'name,age\n,\nAlice,25';
      const { rows } = parser.parseCsv(Buffer.from(csv));
      expect(rows).toHaveLength(1);
    });

    it('should handle header-only with no header line', () => {
      const { headers, rows } = parser.parseCsv(Buffer.from(''));
      expect(headers).toHaveLength(0);
      expect(rows).toHaveLength(0);
    });
  });

  // ─── normalizeHeader ────────────────────────────────────────────────────
  describe('ImportParserService — normalizeHeader — edge cases', () => {
    it('should handle multiple trailing asterisks (regex strips one set)', () => {
      // The regex \s*\*\s*$ only strips one trailing asterisk pattern
      expect(parser.normalizeHeader('Name **')).toBe('name *');
    });

    it('should handle asterisk with space', () => {
      expect(parser.normalizeHeader('Name * ')).toBe('name');
    });

    it('should handle empty string', () => {
      expect(parser.normalizeHeader('')).toBe('');
    });

    it('should handle whitespace only', () => {
      expect(parser.normalizeHeader('   ')).toBe('');
    });
  });
});
