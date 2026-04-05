import { Test, TestingModule } from '@nestjs/testing';

import { ImportParserService } from './import-parser.service';

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ImportParserService', () => {
  let service: ImportParserService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ImportParserService],
    }).compile();

    service = module.get<ImportParserService>(ImportParserService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── normalizeHeader ──────────────────────────────────────────────────────

  describe('ImportParserService — normalizeHeader', () => {
    it('should lowercase and trim a header', () => {
      expect(service.normalizeHeader('  First Name  ')).toBe('first name');
    });

    it('should strip trailing asterisks (required field markers)', () => {
      expect(service.normalizeHeader('Email *')).toBe('email');
      expect(service.normalizeHeader('Phone*')).toBe('phone');
    });

    it('should handle already-normalized headers', () => {
      expect(service.normalizeHeader('date_of_birth')).toBe('date_of_birth');
    });
  });

  // ─── parseCsvLine ─────────────────────────────────────────────────────────

  describe('ImportParserService — parseCsvLine', () => {
    it('should split a simple CSV line', () => {
      expect(service.parseCsvLine('a,b,c')).toEqual(['a', 'b', 'c']);
    });

    it('should handle quoted fields', () => {
      expect(service.parseCsvLine('"hello, world",b,c')).toEqual(['hello, world', 'b', 'c']);
    });

    it('should handle escaped quotes inside quoted fields', () => {
      expect(service.parseCsvLine('"He said ""hi""",b')).toEqual(['He said "hi"', 'b']);
    });

    it('should handle empty fields', () => {
      expect(service.parseCsvLine('a,,c,')).toEqual(['a', '', 'c', '']);
    });
  });

  // ─── parseCsv ─────────────────────────────────────────────────────────────

  describe('ImportParserService — parseCsv', () => {
    it('should return empty headers and rows when buffer has only a header line', () => {
      // parseCsv filters empty lines, so "header\n" yields 1 line which is < 2 -> empty result
      const buffer = Buffer.from('first_name,last_name\n', 'utf-8');
      const result = service.parseCsv(buffer);

      expect(result.headers).toEqual([]);
      expect(result.rows).toEqual([]);
    });

    it('should parse CSV with data rows', () => {
      const csv = 'First Name *,Last Name\nAisha,Al-Mansour\nOmar,Al-Mansour';
      const buffer = Buffer.from(csv, 'utf-8');
      const result = service.parseCsv(buffer);

      expect(result.headers).toEqual(['first name', 'last name']);
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]).toEqual({ 'first name': 'Aisha', 'last name': 'Al-Mansour' });
    });

    it('should skip empty rows', () => {
      const csv = 'name\nAisha\n\n\nOmar';
      const buffer = Buffer.from(csv, 'utf-8');
      const result = service.parseCsv(buffer);

      expect(result.rows).toHaveLength(2);
    });

    it('should return empty headers and rows for empty buffer', () => {
      const buffer = Buffer.from('', 'utf-8');
      const result = service.parseCsv(buffer);

      expect(result.headers).toEqual([]);
      expect(result.rows).toEqual([]);
    });

    it('should handle Windows-style line endings (CRLF)', () => {
      const csv = 'name\r\nAisha\r\nOmar';
      const buffer = Buffer.from(csv, 'utf-8');
      const result = service.parseCsv(buffer);

      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]).toEqual({ name: 'Aisha' });
    });
  });

  // ─── parseFlexibleDate ────────────────────────────────────────────────────

  describe('ImportParserService — parseFlexibleDate', () => {
    it('should parse ISO format YYYY-MM-DD', () => {
      const result = service.parseFlexibleDate('2026-03-15');
      expect(result).toBeInstanceOf(Date);
      expect(result?.toISOString().slice(0, 10)).toBe('2026-03-15');
    });

    it('should parse DD/MM/YYYY format', () => {
      const result = service.parseFlexibleDate('15/03/2026');
      expect(result).toBeInstanceOf(Date);
      expect(result?.toISOString().slice(0, 10)).toBe('2026-03-15');
    });

    it('should parse DD-MM-YYYY format', () => {
      const result = service.parseFlexibleDate('15-03-2026');
      expect(result).toBeInstanceOf(Date);
      expect(result?.toISOString().slice(0, 10)).toBe('2026-03-15');
    });

    it('should return null for unrecognised formats', () => {
      expect(service.parseFlexibleDate('March 15, 2026')).toBeNull();
      expect(service.parseFlexibleDate('not-a-date')).toBeNull();
      expect(service.parseFlexibleDate('')).toBeNull();
    });

    it('should return null for invalid date values', () => {
      // Invalid month 99
      expect(service.parseFlexibleDate('2026-99-15')).toBeNull();
    });
  });

  // ─── formatDateToISO ──────────────────────────────────────────────────────

  describe('ImportParserService — formatDateToISO', () => {
    it('should format a Date to YYYY-MM-DD', () => {
      const date = new Date(2026, 2, 15); // March 15, 2026
      expect(service.formatDateToISO(date)).toBe('2026-03-15');
    });

    it('should zero-pad month and day', () => {
      const date = new Date(2026, 0, 5); // January 5, 2026
      expect(service.formatDateToISO(date)).toBe('2026-01-05');
    });
  });

  // ─── isExampleRow ─────────────────────────────────────────────────────────

  describe('ImportParserService — isExampleRow', () => {
    it('should detect student example row with Aisha Al-Mansour', () => {
      const row = {
        first_name: 'Aisha',
        last_name: 'Al-Mansour',
        parent1_email: 'parent@example.com',
      };
      expect(service.isExampleRow(row, 'students')).toBe(true);
    });

    it('should detect student example row with Omar Al-Mansour via email check', () => {
      const row = {
        first_name: 'Omar',
        last_name: 'Al-Mansour',
        parent1_email: 'father@example.com',
      };
      expect(service.isExampleRow(row, 'students')).toBe(true);
    });

    it('should detect parent example row with Ahmed Al-Mansour', () => {
      const row = { first_name: 'Ahmed', last_name: 'Al-Mansour' };
      expect(service.isExampleRow(row, 'parents')).toBe(true);
    });

    it('should detect staff example row with Sarah Johnson', () => {
      const row = { first_name: 'Sarah', last_name: 'Johnson' };
      expect(service.isExampleRow(row, 'staff')).toBe(true);
    });

    it('should not flag a real student as an example row', () => {
      const row = {
        first_name: 'Fatima',
        last_name: 'Hassan',
        parent1_email: 'fatima.parent@school.edu',
      };
      expect(service.isExampleRow(row, 'students')).toBe(false);
    });

    it('should return false when the key field is empty', () => {
      const row = { first_name: '', last_name: 'Al-Mansour' };
      expect(service.isExampleRow(row, 'students')).toBe(false);
    });

    it('should detect rows with template hint patterns (parentheses)', () => {
      const row = { first_name: 'Aisha', last_name: '(example)' };
      expect(service.isExampleRow(row, 'students')).toBe(true);
    });

    it('should not detect non-example row for fees type', () => {
      const row = { fee_structure_name: 'Tuition', household_name: 'Real Family', amount: '5000' };
      expect(service.isExampleRow(row, 'fees')).toBe(false);
    });

    it('should not detect non-example row for exam_results type', () => {
      const row = { student_number: 'STU001', subject: 'Math', score: '85' };
      expect(service.isExampleRow(row, 'exam_results')).toBe(false);
    });

    it('should not detect non-example row for staff_compensation type', () => {
      const row = { staff_number: 'STF100', compensation_type: 'salaried', amount: '50000' };
      expect(service.isExampleRow(row, 'staff_compensation')).toBe(false);
    });

    it('should detect staff_compensation example with stf-001 and parentheses', () => {
      const row = {
        staff_number: 'stf-001',
        compensation_type: 'salaried (example)',
        amount: '50000',
      };
      expect(service.isExampleRow(row, 'staff_compensation')).toBe(true);
    });

    it('should detect student Omar Al-Mansour with @example.com email', () => {
      const row = {
        first_name: 'Omar',
        last_name: 'Al-Mansour',
        parent1_email: 'father@example.com',
      };
      expect(service.isExampleRow(row, 'students')).toBe(true);
    });

    it('should not detect student with example first name but different last name', () => {
      const row = { first_name: 'Aisha', last_name: 'Khan', parent1_email: 'parent@school.edu' };
      expect(service.isExampleRow(row, 'students')).toBe(false);
    });

    it('should not detect parent example when first_name is Ahmed but last_name differs', () => {
      const row = { first_name: 'Ahmed', last_name: 'Khan' };
      expect(service.isExampleRow(row, 'parents')).toBe(false);
    });

    it('should not detect staff example when first_name is Sarah but last_name differs', () => {
      const row = { first_name: 'Sarah', last_name: 'Smith' };
      expect(service.isExampleRow(row, 'staff')).toBe(false);
    });

    it('should return false when key field value is not in EXAMPLE_FIRST_NAMES', () => {
      const row = { first_name: 'Fatima', last_name: 'Al-Mansour' };
      expect(service.isExampleRow(row, 'students')).toBe(false);
    });

    it('should return false when key field is missing entirely', () => {
      const row = { last_name: 'Al-Mansour' };
      expect(service.isExampleRow(row, 'students')).toBe(false);
    });
  });

  // ─── parseXlsx ────────────────────────────────────────────────────────────

  describe('ImportParserService — parseXlsx', () => {
    it('should parse a valid XLSX buffer with data rows', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const XLSX = require('xlsx');
      const ws = XLSX.utils.aoa_to_sheet([
        ['first_name', 'last_name', 'email'],
        ['John', 'Doe', 'john@test.com'],
        ['Jane', 'Smith', 'jane@test.com'],
      ]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      const buffer = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));

      const result = service.parseXlsx(buffer);

      expect(result.headers).toEqual(['first_name', 'last_name', 'email']);
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]).toEqual({
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@test.com',
      });
    });

    it('should return empty headers and rows for empty XLSX', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const XLSX = require('xlsx');
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([]), 'Sheet1');
      const buffer = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));

      const result = service.parseXlsx(buffer);

      expect(result.headers).toEqual([]);
      expect(result.rows).toEqual([]);
    });

    it('should return empty for XLSX with single empty sheet (no rows at all)', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const XLSX = require('xlsx');
      // Create a sheet with nothing in it (no cells)
      const ws: Record<string, unknown> = {};
      ws['!ref'] = undefined; // No cells at all
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Empty');
      const buffer = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));

      const result = service.parseXlsx(buffer);

      expect(result.headers).toEqual([]);
      expect(result.rows).toEqual([]);
    });

    it('should handle XLSX with header row only (no data rows)', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const XLSX = require('xlsx');
      const ws = XLSX.utils.aoa_to_sheet([['first_name', 'last_name']]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      const buffer = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));

      const result = service.parseXlsx(buffer);

      // Only 1 row (header) which is < 2 -> empty result
      expect(result.headers).toEqual([]);
      expect(result.rows).toEqual([]);
    });

    it('should handle XLSX cells with Date objects', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const XLSX = require('xlsx');
      const ws = XLSX.utils.aoa_to_sheet([
        ['name', 'date_of_birth'],
        ['John', new Date('2010-05-15T00:00:00Z')],
      ]);
      // Force cell to be date type
      ws['B2'] = { t: 'd', v: new Date('2010-05-15T00:00:00Z') };
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      const buffer = Buffer.from(
        XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', cellDates: true }),
      );

      const result = service.parseXlsx(buffer);

      expect(result.rows).toHaveLength(1);
      // The date should be formatted to ISO
      expect(result.rows[0]!['date_of_birth']).toBeDefined();
    });

    it('should skip empty rows in XLSX', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const XLSX = require('xlsx');
      const ws = XLSX.utils.aoa_to_sheet([
        ['name', 'email'],
        ['John', 'john@test.com'],
        ['', ''],
        ['Jane', 'jane@test.com'],
      ]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      const buffer = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));

      const result = service.parseXlsx(buffer);

      expect(result.rows).toHaveLength(2);
    });

    it('should normalize XLSX headers (trim, lowercase, strip asterisks)', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const XLSX = require('xlsx');
      const ws = XLSX.utils.aoa_to_sheet([
        ['First Name *', '  Last Name  ', 'Email*'],
        ['John', 'Doe', 'john@test.com'],
      ]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      const buffer = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));

      const result = service.parseXlsx(buffer);

      expect(result.headers).toEqual(['first name', 'last name', 'email']);
    });
  });

  // ─── parseFlexibleDate — additional branches ──────────────────────────────

  describe('ImportParserService — parseFlexibleDate additional', () => {
    it('should return null for invalid DD/MM/YYYY with bad month', () => {
      expect(service.parseFlexibleDate('15/99/2010')).toBeNull();
    });

    it('should return null for invalid DD-MM-YYYY with bad month', () => {
      expect(service.parseFlexibleDate('15-99-2010')).toBeNull();
    });

    it('should parse valid DD/MM/YYYY date', () => {
      const result = service.parseFlexibleDate('15/03/2010');
      expect(result).toBeInstanceOf(Date);
      expect(result?.toISOString().slice(0, 10)).toBe('2010-03-15');
    });

    it('should parse valid DD-MM-YYYY date', () => {
      const result = service.parseFlexibleDate('15-03-2010');
      expect(result).toBeInstanceOf(Date);
      expect(result?.toISOString().slice(0, 10)).toBe('2010-03-15');
    });

    it('should return null for empty string', () => {
      expect(service.parseFlexibleDate('')).toBeNull();
    });

    it('should return null for partial date string', () => {
      expect(service.parseFlexibleDate('2010-05')).toBeNull();
    });
  });

  // ─── parseCsv — additional branches ───────────────────────────────────────

  describe('ImportParserService — parseCsv additional', () => {
    it('should handle CSV with carriage returns in quoted fields', () => {
      // Quoted fields may contain commas but not newlines in this simple parser
      const csv = 'name,note\n"John","Hello, World"\n"Jane","Test"';
      const buffer = Buffer.from(csv, 'utf-8');
      const result = service.parseCsv(buffer);

      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]!['note']).toBe('Hello, World');
    });

    it('should handle single-character field values', () => {
      const csv = 'a,b\n1,2\n3,4';
      const buffer = Buffer.from(csv, 'utf-8');
      const result = service.parseCsv(buffer);

      expect(result.headers).toEqual(['a', 'b']);
      expect(result.rows).toHaveLength(2);
    });
  });

  // ─── parseCsvLine — additional branches ───────────────────────────────────

  describe('ImportParserService — parseCsvLine additional', () => {
    it('should handle line with only quotes', () => {
      const result = service.parseCsvLine('""');
      expect(result).toEqual(['']);
    });

    it('should handle adjacent commas', () => {
      const result = service.parseCsvLine(',,,');
      expect(result).toEqual(['', '', '', '']);
    });

    it('should handle quoted field at end of line', () => {
      const result = service.parseCsvLine('a,"b c"');
      expect(result).toEqual(['a', 'b c']);
    });

    it('should handle single value (no commas)', () => {
      const result = service.parseCsvLine('hello');
      expect(result).toEqual(['hello']);
    });
  });
});
