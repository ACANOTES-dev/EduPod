import {
  EXPORT_CONTENT_TYPES,
  EXPORT_FILE_EXTENSIONS,
  SYNCHRONOUS_EXPORT_ROW_LIMIT,
  safeExportFilename,
} from './report-export.types';

describe('report-export.types helpers', () => {
  describe('safeExportFilename', () => {
    it('slugifies the report name, dates it, and appends the format extension', () => {
      const name = safeExportFilename('Year 10 Attendance', 'pdf');
      expect(name).toMatch(/^year_10_attendance_\d{4}-\d{2}-\d{2}\.pdf$/);
    });

    it('strips characters outside [A-Za-z0-9-_ ] and collapses whitespace to underscores', () => {
      const name = safeExportFilename('Report: 2026/Q1 (Final)!', 'excel');
      expect(name).not.toMatch(/[/:!()]/);
      expect(name).toMatch(/^report_2026q1_final_\d{4}-\d{2}-\d{2}\.xlsx$/);
    });

    it('falls back to "report" when the sanitised name is empty', () => {
      const name = safeExportFilename('!!!', 'word');
      expect(name).toMatch(/^report_\d{4}-\d{2}-\d{2}\.docx$/);
    });

    it('truncates long names to a sensible length', () => {
      const name = safeExportFilename('a'.repeat(200), 'pdf');
      // 80-char slug + _YYYY-MM-DD.pdf (15 chars) = 95 chars max
      expect(name.length).toBeLessThanOrEqual(95);
    });
  });

  describe('constants', () => {
    it('maps every format to a MIME type', () => {
      expect(EXPORT_CONTENT_TYPES.pdf).toBe('application/pdf');
      expect(EXPORT_CONTENT_TYPES.excel).toContain('spreadsheetml');
      expect(EXPORT_CONTENT_TYPES.word).toContain('wordprocessingml');
    });

    it('maps every format to a file extension', () => {
      expect(EXPORT_FILE_EXTENSIONS.pdf).toBe('pdf');
      expect(EXPORT_FILE_EXTENSIONS.excel).toBe('xlsx');
      expect(EXPORT_FILE_EXTENSIONS.word).toBe('docx');
    });

    it('SYNCHRONOUS_EXPORT_ROW_LIMIT matches the impl 04 spec value of 5 000', () => {
      expect(SYNCHRONOUS_EXPORT_ROW_LIMIT).toBe(5_000);
    });
  });
});
