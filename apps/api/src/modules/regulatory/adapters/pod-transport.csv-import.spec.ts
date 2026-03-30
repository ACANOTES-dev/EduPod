import { CsvImportTransport } from './pod-transport.csv-import';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const VALID_TSV_CONTENT = [
  'External_ID\tFirst_Name\tLast_Name\tDate_of_Birth\tGender\tNationality\tPPS_Number\tEnrolment_Date\tYear_Group\tClass_Group',
  'EXT-001\tJohn\tDoe\t2010-01-15\tmale\tIrish\t1234567A\t2023-09-01\t1st Year\t1A',
  'EXT-002\tJane\tSmith\t2011-06-22\tfemale\tBritish\t7654321B\t2023-09-01\t1st Year\t1B',
].join('\r\n');

const MINIMAL_TSV_CONTENT = ['External_ID\tFirst_Name\tLast_Name', 'EXT-001\tJohn\tDoe'].join('\n');

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('CsvImportTransport', () => {
  let transport: CsvImportTransport;

  beforeEach(() => {
    transport = new CsvImportTransport();
  });

  // ─── pull — successful parsing ──────────────────────────────────────────

  describe('CsvImportTransport — pull', () => {
    it('should parse a valid TSV file with all columns', async () => {
      const result = await transport.pull(VALID_TSV_CONTENT);

      expect(result.success).toBe(true);
      expect(result.records).toHaveLength(2);
      expect(result.errors).toHaveLength(0);
    });

    it('should map External_ID header to external_id field', async () => {
      const result = await transport.pull(VALID_TSV_CONTENT);

      expect(result.records[0]?.external_id).toBe('EXT-001');
      expect(result.records[1]?.external_id).toBe('EXT-002');
    });

    it('should map all known PPOD headers to PodRecord fields', async () => {
      const result = await transport.pull(VALID_TSV_CONTENT);

      const record = result.records[0]!;
      expect(record.first_name).toBe('John');
      expect(record.last_name).toBe('Doe');
      expect(record.date_of_birth).toBe('2010-01-15');
      expect(record.gender).toBe('male');
      expect(record.nationality).toBe('Irish');
      expect(record.pps_number).toBe('1234567A');
      expect(record.enrolment_date).toBe('2023-09-01');
      expect(record.year_group).toBe('1st Year');
      expect(record.class_group).toBe('1A');
    });

    it('should handle LF line endings', async () => {
      const result = await transport.pull(MINIMAL_TSV_CONTENT);

      expect(result.success).toBe(true);
      expect(result.records).toHaveLength(1);
      expect(result.records[0]?.external_id).toBe('EXT-001');
    });

    it('should treat empty field values as undefined', async () => {
      const content = [
        'External_ID\tFirst_Name\tLast_Name\tDate_of_Birth\tGender',
        'EXT-001\tJohn\tDoe\t\t',
      ].join('\n');

      const result = await transport.pull(content);

      expect(result.success).toBe(true);
      expect(result.records).toHaveLength(1);
      expect(result.records[0]?.date_of_birth).toBeUndefined();
      expect(result.records[0]?.gender).toBeUndefined();
    });

    it('should skip blank lines', async () => {
      const content = [
        'External_ID\tFirst_Name\tLast_Name',
        'EXT-001\tJohn\tDoe',
        '',
        'EXT-002\tJane\tSmith',
        '  ',
      ].join('\n');

      const result = await transport.pull(content);

      expect(result.records).toHaveLength(2);
    });
  });

  // ─── pull — validation errors ──────────────────────────────────────────

  describe('CsvImportTransport — pull validation', () => {
    it('should report error when required field external_id is missing', async () => {
      const content = ['External_ID\tFirst_Name\tLast_Name', '\tJohn\tDoe'].join('\n');

      const result = await transport.pull(content);

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.field).toBe('external_id');
      expect(result.errors[0]?.message).toContain('external_id');
      expect(result.records).toHaveLength(0);
    });

    it('should report error when required field first_name is missing', async () => {
      const content = ['External_ID\tFirst_Name\tLast_Name', 'EXT-001\t\tDoe'].join('\n');

      const result = await transport.pull(content);

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.field === 'first_name')).toBe(true);
    });

    it('should report error when required field last_name is missing', async () => {
      const content = ['External_ID\tFirst_Name\tLast_Name', 'EXT-001\tJohn\t'].join('\n');

      const result = await transport.pull(content);

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.field === 'last_name')).toBe(true);
    });

    it('should report multiple errors for a row missing all required fields', async () => {
      // Use a non-whitespace placeholder column so the row is not filtered as blank
      const content = ['External_ID\tFirst_Name\tLast_Name\tGender', '\t\t\tmale'].join('\n');

      const result = await transport.pull(content);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
      const errorFields = result.errors.map((e) => e.field);
      expect(errorFields).toContain('external_id');
      expect(errorFields).toContain('first_name');
      expect(errorFields).toContain('last_name');
    });

    it('should include the correct row number in errors (1-based, accounting for header)', async () => {
      const content = [
        'External_ID\tFirst_Name\tLast_Name',
        'EXT-001\tJohn\tDoe',
        '\tMissing\tExternalId',
      ].join('\n');

      const result = await transport.pull(content);

      expect(result.records).toHaveLength(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.row).toBe(3);
    });

    it('should not include invalid rows in the records array', async () => {
      const content = [
        'External_ID\tFirst_Name\tLast_Name',
        'EXT-001\tJohn\tDoe',
        '\tInvalid\tRow',
        'EXT-003\tValid\tRow',
      ].join('\n');

      const result = await transport.pull(content);

      expect(result.records).toHaveLength(2);
      expect(result.records[0]?.external_id).toBe('EXT-001');
      expect(result.records[1]?.external_id).toBe('EXT-003');
    });
  });

  // ─── pull — empty file ─────────────────────────────────────────────────

  describe('CsvImportTransport — pull empty file', () => {
    it('should return failure for an empty string', async () => {
      const result = await transport.pull('');

      expect(result.success).toBe(false);
      expect(result.records).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.message).toContain('Empty file');
    });

    it('should return success with zero records for header-only file', async () => {
      const content = 'External_ID\tFirst_Name\tLast_Name';

      const result = await transport.pull(content);

      expect(result.success).toBe(true);
      expect(result.records).toHaveLength(0);
    });
  });

  // ─── pull — unknown headers ────────────────────────────────────────────

  describe('CsvImportTransport — pull unknown headers', () => {
    it('should lowercase unknown headers as field names', async () => {
      const content = [
        'External_ID\tFirst_Name\tLast_Name\tCustom Field',
        'EXT-001\tJohn\tDoe\tCustomValue',
      ].join('\n');

      const result = await transport.pull(content);

      expect(result.success).toBe(true);
      expect(result.records[0]?.['custom_field']).toBe('CustomValue');
    });
  });

  // ─── push — should throw ───────────────────────────────────────────────

  describe('CsvImportTransport — push', () => {
    it('should throw an error because import adapter does not support push', async () => {
      await expect(transport.push()).rejects.toThrow('CSV import adapter does not support push');
    });
  });
});
