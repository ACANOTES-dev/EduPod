import { BadRequestException } from '@nestjs/common';

import { AttendanceFileParserService } from './attendance-file-parser.service';

describe('AttendanceFileParserService — branches', () => {
  let parser: AttendanceFileParserService;

  beforeEach(() => {
    parser = new AttendanceFileParserService();
  });

  afterEach(() => jest.clearAllMocks());

  // ─── parseQuickMarkText ─────────────────────────────────────────────────
  describe('AttendanceFileParserService — parseQuickMarkText', () => {
    it('should parse valid entries with status codes', () => {
      const text = 'STU-001 A\nSTU-002 AE\nSTU-003 L\nSTU-004 LE';
      const result = parser.parseQuickMarkText(text);
      expect(result).toHaveLength(4);
      expect(result[0]!.status).toBe('absent_unexcused');
      expect(result[1]!.status).toBe('absent_excused');
      expect(result[2]!.status).toBe('late');
      expect(result[3]!.status).toBe('left_early');
    });

    it('should parse entries with reason text', () => {
      const text = 'STU-001 A sick with flu';
      const result = parser.parseQuickMarkText(text);
      expect(result[0]!.reason).toBe('sick with flu');
    });

    it('should handle case-insensitive status codes', () => {
      const text = 'STU-001 a\nSTU-002 Ae';
      const result = parser.parseQuickMarkText(text);
      expect(result[0]!.status).toBe('absent_unexcused');
      expect(result[1]!.status).toBe('absent_excused');
    });

    it('should return empty array for empty text', () => {
      expect(parser.parseQuickMarkText('')).toEqual([]);
    });

    it('should skip blank lines', () => {
      const text = 'STU-001 A\n\n\nSTU-002 L';
      const result = parser.parseQuickMarkText(text);
      expect(result).toHaveLength(2);
    });

    it('should throw on line with only student number (no status)', () => {
      expect(() => parser.parseQuickMarkText('STU-001')).toThrow(BadRequestException);
    });

    it('should throw on invalid status code', () => {
      expect(() => parser.parseQuickMarkText('STU-001 X')).toThrow(BadRequestException);
    });

    it('should handle \\r\\n line endings', () => {
      const text = 'STU-001 A\r\nSTU-002 L';
      const result = parser.parseQuickMarkText(text);
      expect(result).toHaveLength(2);
    });

    it('should not include reason when only 2 parts', () => {
      const text = 'STU-001 A';
      const result = parser.parseQuickMarkText(text);
      expect(result[0]!.reason).toBeUndefined();
    });
  });

  // ─── parseCsv ───────────────────────────────────────────────────────────
  describe('AttendanceFileParserService — parseCsv', () => {
    it('should parse a valid CSV with expected headers', () => {
      const csv = 'student_number,student_name,class_name,status\nSTU-001,John Doe,8A,P';
      const result = parser.parseCsv(Buffer.from(csv));
      expect(result).toHaveLength(1);
      expect(result[0]!.student_number).toBe('STU-001');
    });

    it('should skip empty lines', () => {
      const csv = 'student_number,student_name,class_name,status\n\nSTU-001,John,8A,P\n\n';
      const result = parser.parseCsv(Buffer.from(csv));
      expect(result).toHaveLength(1);
    });

    it('should skip comment lines starting with #', () => {
      const csv =
        '# This is a comment\nstudent_number,student_name,class_name,status\nSTU-001,John,8A,P';
      const result = parser.parseCsv(Buffer.from(csv));
      expect(result).toHaveLength(1);
    });

    it('should throw when required headers are missing', () => {
      const csv = 'name,grade\nJohn,8';
      expect(() => parser.parseCsv(Buffer.from(csv))).toThrow(BadRequestException);
    });

    it('should throw when file has no header row', () => {
      expect(() => parser.parseCsv(Buffer.from(''))).toThrow(BadRequestException);
    });

    it('should handle quoted fields with commas', () => {
      const csv = 'student_number,student_name,class_name,status\nSTU-001,"Doe, John",8A,P';
      const result = parser.parseCsv(Buffer.from(csv));
      expect(result[0]!.student_name).toBe('Doe, John');
    });

    it('should handle escaped double quotes in CSV', () => {
      const csv = 'student_number,student_name,class_name,status\nSTU-001,"John ""JD"" Doe",8A,P';
      const result = parser.parseCsv(Buffer.from(csv));
      expect(result[0]!.student_name).toBe('John "JD" Doe');
    });
  });

  // ─── parseCsvLine ───────────────────────────────────────────────────────
  describe('AttendanceFileParserService — parseCsvLine', () => {
    it('should handle empty line', () => {
      expect(parser.parseCsvLine('')).toEqual(['']);
    });

    it('should handle single field', () => {
      expect(parser.parseCsvLine('hello')).toEqual(['hello']);
    });

    it('should split on commas', () => {
      expect(parser.parseCsvLine('a,b,c')).toEqual(['a', 'b', 'c']);
    });

    it('should handle quoted field with comma inside', () => {
      expect(parser.parseCsvLine('"a,b",c')).toEqual(['a,b', 'c']);
    });

    it('should handle escaped double quotes', () => {
      expect(parser.parseCsvLine('"a""b",c')).toEqual(['a"b', 'c']);
    });
  });

  // ─── escapeCsvField ─────────────────────────────────────────────────────
  describe('AttendanceFileParserService — escapeCsvField', () => {
    it('should return plain value when no special chars', () => {
      expect(parser.escapeCsvField('hello')).toBe('hello');
    });

    it('should wrap and escape commas', () => {
      expect(parser.escapeCsvField('hello, world')).toBe('"hello, world"');
    });

    it('should wrap and escape quotes', () => {
      expect(parser.escapeCsvField('say "hi"')).toBe('"say ""hi"""');
    });

    it('should wrap and escape newlines', () => {
      expect(parser.escapeCsvField('line1\nline2')).toBe('"line1\nline2"');
    });

    it('should handle field with all special chars', () => {
      const result = parser.escapeCsvField('a,"b\nc');
      expect(result.startsWith('"')).toBe(true);
      expect(result.endsWith('"')).toBe(true);
    });
  });
});
