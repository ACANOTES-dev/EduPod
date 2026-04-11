import { createPublicApplicationSchema } from './application.schema';

const VALID_UUID = '00000000-0000-0000-0000-000000000001';

const validStudent = {
  first_name: 'Alice',
  last_name: 'Smith',
  date_of_birth: '2018-05-15',
  gender: 'female' as const,
  national_id: 'NID-001',
  target_academic_year_id: VALID_UUID,
  target_year_group_id: VALID_UUID,
};

const validHouseholdPayload = {
  parent1_first_name: 'Jane',
  parent1_last_name: 'Smith',
  parent1_email: 'jane@example.com',
  parent1_phone: '+353871234567',
  parent1_relationship: 'mother',
  address_line_1: '1 Test Street',
  city: 'Dublin',
  country: 'IE',
};

describe('createPublicApplicationSchema', () => {
  describe('new_household mode', () => {
    it('accepts a valid new_household submission with one student', () => {
      const result = createPublicApplicationSchema.safeParse({
        mode: 'new_household',
        form_definition_id: VALID_UUID,
        household_payload: validHouseholdPayload,
        students: [validStudent],
      });
      expect(result.success).toBe(true);
    });

    it('accepts a new_household submission with multiple students', () => {
      const result = createPublicApplicationSchema.safeParse({
        mode: 'new_household',
        form_definition_id: VALID_UUID,
        household_payload: validHouseholdPayload,
        students: [validStudent, { ...validStudent, first_name: 'Bob', national_id: 'NID-002' }],
      });
      expect(result.success).toBe(true);
    });

    it('rejects new_household without household_payload', () => {
      const result = createPublicApplicationSchema.safeParse({
        mode: 'new_household',
        form_definition_id: VALID_UUID,
        students: [validStudent],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('existing_household mode', () => {
    it('accepts a valid existing_household submission', () => {
      const result = createPublicApplicationSchema.safeParse({
        mode: 'existing_household',
        form_definition_id: VALID_UUID,
        existing_household_id: VALID_UUID,
        students: [validStudent],
      });
      expect(result.success).toBe(true);
    });

    it('rejects existing_household without existing_household_id', () => {
      const result = createPublicApplicationSchema.safeParse({
        mode: 'existing_household',
        form_definition_id: VALID_UUID,
        students: [validStudent],
      });
      expect(result.success).toBe(false);
    });

    it('rejects existing_household when household_payload is present', () => {
      const result = createPublicApplicationSchema.safeParse({
        mode: 'existing_household',
        form_definition_id: VALID_UUID,
        existing_household_id: VALID_UUID,
        household_payload: validHouseholdPayload,
        students: [validStudent],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('students array validation', () => {
    it('rejects an empty students array', () => {
      const result = createPublicApplicationSchema.safeParse({
        mode: 'new_household',
        form_definition_id: VALID_UUID,
        household_payload: validHouseholdPayload,
        students: [],
      });
      expect(result.success).toBe(false);
    });

    it('rejects more than 20 students', () => {
      const students = Array.from({ length: 21 }, (_, i) => ({
        ...validStudent,
        first_name: `Student${i}`,
        national_id: `NID-${i}`,
      }));
      const result = createPublicApplicationSchema.safeParse({
        mode: 'new_household',
        form_definition_id: VALID_UUID,
        household_payload: validHouseholdPayload,
        students,
      });
      expect(result.success).toBe(false);
    });

    it('rejects a student with invalid date_of_birth', () => {
      const result = createPublicApplicationSchema.safeParse({
        mode: 'new_household',
        form_definition_id: VALID_UUID,
        household_payload: validHouseholdPayload,
        students: [{ ...validStudent, date_of_birth: 'not-a-date' }],
      });
      expect(result.success).toBe(false);
    });

    it('rejects a student with invalid gender', () => {
      const result = createPublicApplicationSchema.safeParse({
        mode: 'new_household',
        form_definition_id: VALID_UUID,
        household_payload: validHouseholdPayload,
        students: [{ ...validStudent, gender: 'other' }],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('field validation', () => {
    it('rejects an invalid form_definition_id (not UUID)', () => {
      const result = createPublicApplicationSchema.safeParse({
        mode: 'new_household',
        form_definition_id: 'not-a-uuid',
        household_payload: validHouseholdPayload,
        students: [validStudent],
      });
      expect(result.success).toBe(false);
    });

    it('trims whitespace from student names', () => {
      const result = createPublicApplicationSchema.safeParse({
        mode: 'new_household',
        form_definition_id: VALID_UUID,
        household_payload: validHouseholdPayload,
        students: [{ ...validStudent, first_name: '  Alice  ', last_name: '  Smith  ' }],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        const student = result.data.students[0];
        expect(student).toBeDefined();
        expect(student!.first_name).toBe('Alice');
        expect(student!.last_name).toBe('Smith');
      }
    });
  });
});
