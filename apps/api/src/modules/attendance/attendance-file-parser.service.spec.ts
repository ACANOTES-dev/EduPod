import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AttendanceFileParserService } from './attendance-file-parser.service';

describe('AttendanceFileParserService', () => {
  let service: AttendanceFileParserService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AttendanceFileParserService],
    }).compile();

    service = module.get<AttendanceFileParserService>(AttendanceFileParserService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── parseQuickMarkText ──────────────────────────────────────────────────

  describe('AttendanceFileParserService — parseQuickMarkText', () => {
    it('should parse a single absent entry', () => {
      const entries = service.parseQuickMarkText('STU001 A');

      expect(entries).toHaveLength(1);
      expect(entries[0]).toEqual({
        student_number: 'STU001',
        status: 'absent_unexcused',
        reason: undefined,
      });
    });

    it('should parse absent_excused (AE) status', () => {
      const entries = service.parseQuickMarkText('STU002 AE');

      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        student_number: 'STU002',
        status: 'absent_excused',
      });
    });

    it('should parse late (L) and left_early (LE) entries together', () => {
      const entries = service.parseQuickMarkText('STU001 L\nSTU002 LE');

      expect(entries).toHaveLength(2);
      expect(entries[0]).toMatchObject({ student_number: 'STU001', status: 'late' });
      expect(entries[1]).toMatchObject({ student_number: 'STU002', status: 'left_early' });
    });

    it('should capture an optional reason after the status code', () => {
      const entries = service.parseQuickMarkText('STU003 AE medical appointment');

      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        student_number: 'STU003',
        status: 'absent_excused',
        reason: 'medical appointment',
      });
    });

    it('should be case-insensitive for status codes', () => {
      const entries = service.parseQuickMarkText('STU001 ae');

      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ status: 'absent_excused' });
    });

    it('should skip blank lines and parse remaining entries', () => {
      const entries = service.parseQuickMarkText('STU001 A\n\nSTU002 L');

      expect(entries).toHaveLength(2);
    });

    it('should handle \\r\\n line endings', () => {
      const entries = service.parseQuickMarkText('STU001 A\r\nSTU002 L');

      expect(entries).toHaveLength(2);
    });

    it('should throw BadRequestException for a line missing the status code', () => {
      expect(() => service.parseQuickMarkText('STU001')).toThrow(BadRequestException);
    });

    it('should throw BadRequestException for an unrecognised status code', () => {
      expect(() => service.parseQuickMarkText('STU001 P')).toThrow(BadRequestException);
    });

    it('edge: should throw BadRequestException with line number context for invalid status mid-file', () => {
      try {
        service.parseQuickMarkText('STU001 A\nSTU002 INVALID\nSTU003 L');
        fail('Expected BadRequestException');
      } catch (err) {
        expect(err).toBeInstanceOf(BadRequestException);
        const response = (err as BadRequestException).getResponse() as Record<string, unknown>;
        expect(response['message']).toContain('Line 2');
      }
    });

    it('should return empty array for empty text (only whitespace)', () => {
      const entries = service.parseQuickMarkText('  \n  \n  ');

      expect(entries).toHaveLength(0);
    });
  });

  // ─── parseCsv ────────────────────────────────────────────────────────────

  describe('AttendanceFileParserService — parseCsv', () => {
    it('should parse valid CSV content with headers', () => {
      const csv = [
        'student_number,student_name,class_name,status',
        'STU001,John Doe,Grade 1A,P',
        'STU002,Jane Doe,Grade 1A,A',
      ].join('\n');

      const rows = service.parseCsv(Buffer.from(csv, 'utf-8'));

      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual({
        student_number: 'STU001',
        student_name: 'John Doe',
        class_name: 'Grade 1A',
        status: 'P',
      });
    });

    it('should skip comment lines starting with #', () => {
      const csv = [
        '# This is a comment',
        '# Attendance Template',
        'student_number,student_name,class_name,status',
        'STU001,John Doe,Grade 1A,P',
      ].join('\n');

      const rows = service.parseCsv(Buffer.from(csv, 'utf-8'));

      expect(rows).toHaveLength(1);
    });

    it('should skip empty lines', () => {
      const csv = [
        'student_number,student_name,class_name,status',
        '',
        'STU001,John Doe,Grade 1A,P',
        '',
        'STU002,Jane Doe,Grade 1A,A',
      ].join('\n');

      const rows = service.parseCsv(Buffer.from(csv, 'utf-8'));

      expect(rows).toHaveLength(2);
    });

    it('should throw BadRequestException when headers are missing required columns', () => {
      const csv = 'student_number,student_name\nSTU001,John Doe';

      expect(() => service.parseCsv(Buffer.from(csv, 'utf-8'))).toThrow(BadRequestException);
    });

    it('should throw BadRequestException when no header row is found (all comments)', () => {
      const csv = '# comment 1\n# comment 2';

      expect(() => service.parseCsv(Buffer.from(csv, 'utf-8'))).toThrow(BadRequestException);
    });

    it('should throw BadRequestException when file is entirely empty', () => {
      expect(() => service.parseCsv(Buffer.from('', 'utf-8'))).toThrow(BadRequestException);
    });

    it('should handle quoted fields correctly', () => {
      const csv = [
        'student_number,student_name,class_name,status',
        '"STU001","Doe, John","Grade 1A","P"',
      ].join('\n');

      const rows = service.parseCsv(Buffer.from(csv, 'utf-8'));

      expect(rows).toHaveLength(1);
      expect(rows[0]).toEqual({
        student_number: 'STU001',
        student_name: 'Doe, John',
        class_name: 'Grade 1A',
        status: 'P',
      });
    });

    it('should handle escaped double quotes within quoted fields', () => {
      const csv = [
        'student_number,student_name,class_name,status',
        '"STU001","O""Brien, John","Grade 1A","P"',
      ].join('\n');

      const rows = service.parseCsv(Buffer.from(csv, 'utf-8'));

      expect(rows).toHaveLength(1);
      expect(rows[0]?.student_name).toBe('O"Brien, John');
    });

    it('should be case-insensitive for header names', () => {
      const csv = [
        'Student_Number,Student_Name,Class_Name,Status',
        'STU001,John Doe,Grade 1A,P',
      ].join('\n');

      const rows = service.parseCsv(Buffer.from(csv, 'utf-8'));

      expect(rows).toHaveLength(1);
      expect(rows[0]?.student_number).toBe('STU001');
    });

    it('should return empty string for missing values at the end of a row', () => {
      const csv = [
        'student_number,student_name,class_name,status',
        'STU001,John Doe,Grade 1A,',
      ].join('\n');

      const rows = service.parseCsv(Buffer.from(csv, 'utf-8'));

      expect(rows).toHaveLength(1);
      expect(rows[0]?.status).toBe('');
    });
  });

  // ─── parseCsvLine ────────────────────────────────────────────────────────

  describe('AttendanceFileParserService — parseCsvLine', () => {
    it('should parse a simple CSV line without quotes', () => {
      const fields = service.parseCsvLine('a,b,c');
      expect(fields).toEqual(['a', 'b', 'c']);
    });

    it('should parse a line with quoted fields containing commas', () => {
      const fields = service.parseCsvLine('"hello, world",b,c');
      expect(fields).toEqual(['hello, world', 'b', 'c']);
    });

    it('should handle escaped double quotes', () => {
      const fields = service.parseCsvLine('"he said ""hello""",b');
      expect(fields).toEqual(['he said "hello"', 'b']);
    });

    it('should handle empty fields', () => {
      const fields = service.parseCsvLine('a,,c,');
      expect(fields).toEqual(['a', '', 'c', '']);
    });

    it('should handle a single field', () => {
      const fields = service.parseCsvLine('value');
      expect(fields).toEqual(['value']);
    });

    it('should handle entirely empty string', () => {
      const fields = service.parseCsvLine('');
      expect(fields).toEqual(['']);
    });
  });

  // ─── parseXlsx ───────────────────────────────────────────────────────────

  describe('AttendanceFileParserService — parseXlsx', () => {
    // We can't easily create real XLSX buffers without the xlsx library,
    // but we can test the error paths with invalid/empty data.

    it('should throw BadRequestException for an empty XLSX file (no sheets)', () => {
      // An XLSX with no sheets — this will throw from the xlsx library or from our guard
      // Using a minimal valid xlsx buffer that has no real data is impractical,
      // so we test with an invalid buffer that will throw
      const emptyBuffer = Buffer.alloc(0);

      expect(() => service.parseXlsx(emptyBuffer)).toThrow();
    });
  });

  // ─── escapeCsvField ──────────────────────────────────────────────────────

  describe('AttendanceFileParserService — escapeCsvField', () => {
    it('should return the value unchanged when it contains no special characters', () => {
      expect(service.escapeCsvField('hello')).toBe('hello');
    });

    it('should wrap in quotes and escape when value contains commas', () => {
      expect(service.escapeCsvField('hello, world')).toBe('"hello, world"');
    });

    it('should wrap in quotes and escape when value contains double quotes', () => {
      expect(service.escapeCsvField('say "hi"')).toBe('"say ""hi"""');
    });

    it('should wrap in quotes when value contains newlines', () => {
      expect(service.escapeCsvField('line1\nline2')).toBe('"line1\nline2"');
    });

    it('should handle value with commas and quotes simultaneously', () => {
      expect(service.escapeCsvField('a "b", c')).toBe('"a ""b"", c"');
    });

    it('should return empty string unchanged', () => {
      expect(service.escapeCsvField('')).toBe('');
    });
  });
});
