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
  });
});
