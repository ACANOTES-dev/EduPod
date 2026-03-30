import { CsvExportTransport } from './pod-transport.csv-export';
import type { PodRecord } from './pod-transport.interface';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function buildPodRecord(overrides: Partial<PodRecord> = {}): PodRecord {
  return {
    external_id: 'EXT-001',
    first_name: 'John',
    last_name: 'Doe',
    date_of_birth: '2010-01-15',
    gender: 'male',
    ...overrides,
  };
}

const EXPECTED_HEADERS = [
  'External_ID',
  'First_Name',
  'Last_Name',
  'Date_of_Birth',
  'Gender',
  'Address_Line1',
  'Address_Line2',
  'Address_City',
  'Address_County',
  'Address_Eircode',
  'Nationality',
  'PPS_Number',
  'Enrolment_Date',
  'Year_Group',
  'Class_Group',
  'Leaving_Date',
  'Leaving_Reason_Code',
].join('\t');

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('CsvExportTransport', () => {
  let transport: CsvExportTransport;

  beforeEach(() => {
    transport = new CsvExportTransport();
  });

  // ─── push — successful export ──────────────────────────────────────────

  describe('CsvExportTransport — push', () => {
    it('should produce a tab-delimited CSV with correct header row', async () => {
      const records: PodRecord[] = [buildPodRecord()];

      const result = await transport.push(records);

      expect(result.success).toBe(true);
      expect(result.raw_content).toBeDefined();
      const lines = result.raw_content!.split('\r\n');
      expect(lines[0]).toBe(EXPECTED_HEADERS);
    });

    it('should output record fields in the correct column order', async () => {
      const records: PodRecord[] = [
        buildPodRecord({
          address_line1: '123 Main St',
          address_city: 'Dublin',
          nationality: 'Irish',
          pps_number: '1234567A',
          enrolment_date: '2023-09-01',
          year_group: '1st Year',
          class_group: '1A',
        }),
      ];

      const result = await transport.push(records);

      expect(result.success).toBe(true);
      const lines = result.raw_content!.split('\r\n');
      const dataValues = lines[1]!.split('\t');

      expect(dataValues[0]).toBe('EXT-001'); // External_ID
      expect(dataValues[1]).toBe('John'); // First_Name
      expect(dataValues[2]).toBe('Doe'); // Last_Name
      expect(dataValues[3]).toBe('2010-01-15'); // Date_of_Birth
      expect(dataValues[4]).toBe('male'); // Gender
      expect(dataValues[5]).toBe('123 Main St'); // Address_Line1
      expect(dataValues[7]).toBe('Dublin'); // Address_City
      expect(dataValues[10]).toBe('Irish'); // Nationality
      expect(dataValues[11]).toBe('1234567A'); // PPS_Number
      expect(dataValues[12]).toBe('2023-09-01'); // Enrolment_Date
      expect(dataValues[13]).toBe('1st Year'); // Year_Group
      expect(dataValues[14]).toBe('1A'); // Class_Group
    });

    it('should output empty strings for undefined optional fields', async () => {
      const records: PodRecord[] = [
        buildPodRecord(), // minimal record, no optional fields
      ];

      const result = await transport.push(records);

      const lines = result.raw_content!.split('\r\n');
      const dataValues = lines[1]!.split('\t');

      // address, nationality, pps_number etc. should be empty
      expect(dataValues[5]).toBe(''); // Address_Line1
      expect(dataValues[6]).toBe(''); // Address_Line2
      expect(dataValues[7]).toBe(''); // Address_City
      expect(dataValues[10]).toBe(''); // Nationality
      expect(dataValues[11]).toBe(''); // PPS_Number
    });

    it('should handle multiple records correctly', async () => {
      const records: PodRecord[] = [
        buildPodRecord({ external_id: 'EXT-001', first_name: 'John', last_name: 'Doe' }),
        buildPodRecord({ external_id: 'EXT-002', first_name: 'Jane', last_name: 'Smith' }),
        buildPodRecord({ external_id: 'EXT-003', first_name: 'Bob', last_name: 'Murphy' }),
      ];

      const result = await transport.push(records);

      expect(result.success).toBe(true);
      expect(result.records).toHaveLength(3);
      const lines = result.raw_content!.split('\r\n');
      // header + 3 data rows
      expect(lines).toHaveLength(4);
    });

    it('should produce an empty data section for zero records', async () => {
      const result = await transport.push([]);

      expect(result.success).toBe(true);
      expect(result.records).toHaveLength(0);
      const lines = result.raw_content!.split('\r\n');
      // header only
      expect(lines).toHaveLength(1);
      expect(lines[0]).toBe(EXPECTED_HEADERS);
    });

    it('should use CRLF line endings', async () => {
      const records: PodRecord[] = [buildPodRecord()];

      const result = await transport.push(records);

      expect(result.raw_content).toContain('\r\n');
    });

    it('should include leaving_date and leaving_reason_code when present', async () => {
      const records: PodRecord[] = [
        buildPodRecord({
          leaving_date: '2026-06-30',
          leaving_reason_code: 'TRANSFER',
        }),
      ];

      const result = await transport.push(records);

      const lines = result.raw_content!.split('\r\n');
      const dataValues = lines[1]!.split('\t');
      expect(dataValues[15]).toBe('2026-06-30');
      expect(dataValues[16]).toBe('TRANSFER');
    });
  });

  // ─── push — validation ────────────────────────────────────────────────

  describe('CsvExportTransport — push validation', () => {
    it('should report error when external_id is missing', async () => {
      const records: PodRecord[] = [buildPodRecord({ external_id: '' })];

      const result = await transport.push(records);

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.field).toBe('external_id');
      expect(result.errors[0]?.row).toBe(1);
    });

    it('should report error when first_name is missing', async () => {
      const records: PodRecord[] = [buildPodRecord({ first_name: '' })];

      const result = await transport.push(records);

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.field === 'first_name')).toBe(true);
    });

    it('should report error when last_name is missing', async () => {
      const records: PodRecord[] = [buildPodRecord({ last_name: '' })];

      const result = await transport.push(records);

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.field === 'last_name')).toBe(true);
    });

    it('should not include invalid records in the output CSV', async () => {
      const records: PodRecord[] = [
        buildPodRecord({ external_id: '' }), // invalid
        buildPodRecord({ external_id: 'EXT-002', first_name: 'Valid', last_name: 'Record' }), // valid
      ];

      const result = await transport.push(records);

      expect(result.success).toBe(false);
      expect(result.records).toHaveLength(1);
      expect(result.records[0]?.external_id).toBe('EXT-002');

      // The CSV should only contain the valid record
      const lines = result.raw_content!.split('\r\n');
      expect(lines).toHaveLength(2); // header + 1 valid data row
    });

    it('should report errors with correct 1-based row numbers', async () => {
      const records: PodRecord[] = [
        buildPodRecord({ external_id: 'EXT-001' }), // row 1 — valid
        buildPodRecord({ external_id: '' }), // row 2 — invalid
        buildPodRecord({ external_id: 'EXT-003' }), // row 3 — valid
      ];

      const result = await transport.push(records);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.row).toBe(2);
    });

    it('should report multiple errors for a row missing all required fields', async () => {
      const records: PodRecord[] = [
        {
          external_id: '',
          first_name: '',
          last_name: '',
          date_of_birth: '2010-01-01',
          gender: 'male',
        },
      ];

      const result = await transport.push(records);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
      const errorFields = result.errors.map((e) => e.field);
      expect(errorFields).toContain('external_id');
      expect(errorFields).toContain('first_name');
      expect(errorFields).toContain('last_name');
    });
  });

  // ─── pull — should throw ───────────────────────────────────────────────

  describe('CsvExportTransport — pull', () => {
    it('should throw an error because export adapter does not support pull', async () => {
      await expect(transport.pull()).rejects.toThrow('CSV export adapter does not support pull');
    });
  });
});
