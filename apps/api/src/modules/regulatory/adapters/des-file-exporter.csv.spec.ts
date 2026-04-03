import type { DesFileType } from '@school/shared/regulatory';

import { DesFileExporterCsv } from './des-file-exporter.csv';
import type { DesColumnDef, DesFileRow } from './des-file-exporter.interface';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const FILE_A_COLUMNS: DesColumnDef[] = [
  { header: 'Teacher Number', field: 'teacher_number' },
  { header: 'First Name', field: 'first_name' },
  { header: 'Last Name', field: 'last_name' },
  { header: 'Employment Type', field: 'employment_type' },
  { header: 'Job Title', field: 'job_title' },
];

const FILE_E_COLUMNS: DesColumnDef[] = [
  { header: 'PPSN', field: 'ppsn' },
  { header: 'First Name', field: 'first_name' },
  { header: 'Last Name', field: 'last_name' },
  { header: 'Date of Birth', field: 'date_of_birth' },
  { header: 'Gender', field: 'gender' },
  { header: 'Nationality', field: 'nationality' },
  { header: 'Entry Date', field: 'entry_date' },
];

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('DesFileExporterCsv', () => {
  let exporter: DesFileExporterCsv;

  beforeEach(() => {
    exporter = new DesFileExporterCsv();
  });

  // ─── export — output structure ───────────────────────────────────────────

  describe('DesFileExporterCsv — export', () => {
    it('should produce a result with correct content_type and record_count', () => {
      const rows: DesFileRow[] = [
        {
          teacher_number: 'T001',
          first_name: 'John',
          last_name: 'Smith',
          employment_type: 'full_time',
          job_title: 'Teacher',
        },
      ];

      const result = exporter.export('file_a' as DesFileType, rows, FILE_A_COLUMNS);

      expect(result.content_type).toBe('text/csv');
      expect(result.record_count).toBe(1);
      expect(result.filename).toMatch(/^des_file_a_\d{8}_\d{6}\.csv$/);
      expect(Buffer.isBuffer(result.content)).toBe(true);
    });

    it('should include UTF-8 BOM at the start of content', () => {
      const rows: DesFileRow[] = [
        {
          teacher_number: 'T001',
          first_name: 'John',
          last_name: 'Smith',
          employment_type: 'full_time',
          job_title: 'Teacher',
        },
      ];

      const result = exporter.export('file_a' as DesFileType, rows, FILE_A_COLUMNS);

      const bom = result.content.subarray(0, 3);
      expect(bom.equals(UTF8_BOM)).toBe(true);
    });

    it('should produce correct CSV header row from column definitions', () => {
      const rows: DesFileRow[] = [];

      const result = exporter.export('file_a' as DesFileType, rows, FILE_A_COLUMNS);

      const csvText = result.content.subarray(3).toString('utf-8');
      const headerLine = csvText.split('\r\n')[0];
      expect(headerLine).toBe('Teacher Number,First Name,Last Name,Employment Type,Job Title');
    });

    it('should map row fields to columns in correct order', () => {
      const rows: DesFileRow[] = [
        {
          teacher_number: 'T001',
          first_name: 'Alice',
          last_name: 'Murphy',
          employment_type: 'permanent',
          job_title: 'Principal',
        },
      ];

      const result = exporter.export('file_a' as DesFileType, rows, FILE_A_COLUMNS);

      const csvText = result.content.subarray(3).toString('utf-8');
      const lines = csvText.split('\r\n');
      expect(lines[1]).toBe('T001,Alice,Murphy,permanent,Principal');
    });

    it('should handle multiple rows correctly', () => {
      const rows: DesFileRow[] = [
        {
          teacher_number: 'T001',
          first_name: 'Alice',
          last_name: 'Murphy',
          employment_type: 'permanent',
          job_title: 'Principal',
        },
        {
          teacher_number: 'T002',
          first_name: 'Brian',
          last_name: 'Walsh',
          employment_type: 'contract',
          job_title: 'Teacher',
        },
      ];

      const result = exporter.export('file_a' as DesFileType, rows, FILE_A_COLUMNS);

      expect(result.record_count).toBe(2);

      const csvText = result.content.subarray(3).toString('utf-8');
      const lines = csvText.split('\r\n');
      expect(lines).toHaveLength(3); // header + 2 data rows
      expect(lines[1]).toBe('T001,Alice,Murphy,permanent,Principal');
      expect(lines[2]).toBe('T002,Brian,Walsh,contract,Teacher');
    });

    it('should output empty string for null values', () => {
      const rows: DesFileRow[] = [
        {
          teacher_number: null,
          first_name: 'John',
          last_name: 'Smith',
          employment_type: null,
          job_title: null,
        },
      ];

      const result = exporter.export('file_a' as DesFileType, rows, FILE_A_COLUMNS);

      const csvText = result.content.subarray(3).toString('utf-8');
      const lines = csvText.split('\r\n');
      expect(lines[1]).toBe(',John,Smith,,');
    });

    it('should output numeric values without quotes', () => {
      const columns: DesColumnDef[] = [
        { header: 'Weekly Hours', field: 'weekly_hours' },
        { header: 'Count', field: 'count' },
      ];
      const rows: DesFileRow[] = [{ weekly_hours: 22.5, count: 3 }];

      const result = exporter.export('form_tl' as DesFileType, rows, columns);

      const csvText = result.content.subarray(3).toString('utf-8');
      const lines = csvText.split('\r\n');
      expect(lines[1]).toBe('22.5,3');
    });

    it('should produce zero record_count for empty rows', () => {
      const result = exporter.export('file_a' as DesFileType, [], FILE_A_COLUMNS);

      expect(result.record_count).toBe(0);

      const csvText = result.content.subarray(3).toString('utf-8');
      const lines = csvText.split('\r\n');
      // Only the header row
      expect(lines).toHaveLength(1);
    });
  });

  // ─── export — CSV escaping ────────────────────────────────────────────────

  describe('DesFileExporterCsv — CSV escaping', () => {
    it('should wrap values containing commas in double quotes', () => {
      const rows: DesFileRow[] = [
        {
          teacher_number: 'T001',
          first_name: 'John',
          last_name: "O'Brien, Jr.",
          employment_type: 'full_time',
          job_title: 'Teacher',
        },
      ];

      const result = exporter.export('file_a' as DesFileType, rows, FILE_A_COLUMNS);

      const csvText = result.content.subarray(3).toString('utf-8');
      const lines = csvText.split('\r\n');
      expect(lines[1]).toContain('"O\'Brien, Jr."');
    });

    it('should escape double quotes within values by doubling them', () => {
      const rows: DesFileRow[] = [
        {
          teacher_number: 'T001',
          first_name: 'John',
          last_name: 'Said "Hello"',
          employment_type: 'full_time',
          job_title: 'Teacher',
        },
      ];

      const result = exporter.export('file_a' as DesFileType, rows, FILE_A_COLUMNS);

      const csvText = result.content.subarray(3).toString('utf-8');
      const lines = csvText.split('\r\n');
      expect(lines[1]).toContain('"Said ""Hello"""');
    });

    it('should wrap values containing newlines in double quotes', () => {
      const rows: DesFileRow[] = [
        {
          teacher_number: 'T001',
          first_name: 'John',
          last_name: 'Line1\nLine2',
          employment_type: 'full_time',
          job_title: 'Teacher',
        },
      ];

      const result = exporter.export('file_a' as DesFileType, rows, FILE_A_COLUMNS);

      const csvText = result.content.subarray(3).toString('utf-8');
      // The value should be quoted
      expect(csvText).toContain('"Line1\nLine2"');
    });

    it('should not add quotes for plain text values', () => {
      const rows: DesFileRow[] = [
        {
          teacher_number: 'T001',
          first_name: 'John',
          last_name: 'Smith',
          employment_type: 'full_time',
          job_title: 'Teacher',
        },
      ];

      const result = exporter.export('file_a' as DesFileType, rows, FILE_A_COLUMNS);

      const csvText = result.content.subarray(3).toString('utf-8');
      const lines = csvText.split('\r\n');
      // None of these values contain special characters, so no quotes expected
      expect(lines[1]).toBe('T001,John,Smith,full_time,Teacher');
    });
  });

  // ─── export — File E (student data with dates) ────────────────────────────

  describe('DesFileExporterCsv — File E student data', () => {
    it('should produce correct CSV for File E with all student fields', () => {
      const rows: DesFileRow[] = [
        {
          ppsn: '1234567AB',
          first_name: 'Jane',
          last_name: 'Doe',
          date_of_birth: '2010-05-15',
          gender: 'female',
          nationality: 'Irish',
          entry_date: '2023-09-01',
        },
      ];

      const result = exporter.export('file_e' as DesFileType, rows, FILE_E_COLUMNS);

      expect(result.record_count).toBe(1);

      const csvText = result.content.subarray(3).toString('utf-8');
      const lines = csvText.split('\r\n');
      expect(lines[0]).toBe(
        'PPSN,First Name,Last Name,Date of Birth,Gender,Nationality,Entry Date',
      );
      expect(lines[1]).toBe('1234567AB,Jane,Doe,2010-05-15,female,Irish,2023-09-01');
    });

    it('should handle missing optional fields in File E', () => {
      const rows: DesFileRow[] = [
        {
          ppsn: '1234567A',
          first_name: 'Missing',
          last_name: 'Fields',
          date_of_birth: '2010-01-01',
          gender: 'male',
          nationality: null,
          entry_date: null,
        },
      ];

      const result = exporter.export('file_e' as DesFileType, rows, FILE_E_COLUMNS);

      const csvText = result.content.subarray(3).toString('utf-8');
      const lines = csvText.split('\r\n');
      expect(lines[1]).toBe('1234567A,Missing,Fields,2010-01-01,male,,');
    });
  });

  // ─── export — filename format ──────────────────────────────────────────────

  describe('DesFileExporterCsv — filename', () => {
    it('should include file type in the filename', () => {
      const result = exporter.export('file_e' as DesFileType, [], FILE_E_COLUMNS);

      expect(result.filename).toContain('des_file_e_');
      expect(result.filename).toMatch(/\.csv$/);
    });

    it('should produce different filenames for different file types', () => {
      const resultA = exporter.export('file_a' as DesFileType, [], FILE_A_COLUMNS);
      const resultE = exporter.export('file_e' as DesFileType, [], FILE_E_COLUMNS);

      expect(resultA.filename).toContain('des_file_a_');
      expect(resultE.filename).toContain('des_file_e_');
    });
  });

  // ─── export — CRLF line endings ────────────────────────────────────────────

  describe('DesFileExporterCsv — line endings', () => {
    it('should use CRLF line endings', () => {
      const rows: DesFileRow[] = [
        {
          teacher_number: 'T001',
          first_name: 'John',
          last_name: 'Smith',
          employment_type: 'full_time',
          job_title: 'Teacher',
        },
      ];

      const result = exporter.export('file_a' as DesFileType, rows, FILE_A_COLUMNS);

      const csvText = result.content.subarray(3).toString('utf-8');
      expect(csvText).toContain('\r\n');
      // Verify it does not just use LF
      const crlfCount = (csvText.match(/\r\n/g) ?? []).length;
      const lfCount = (csvText.match(/\n/g) ?? []).length;
      expect(crlfCount).toBe(lfCount);
    });
  });
});
