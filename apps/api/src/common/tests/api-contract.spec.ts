/**
 * API Contract Tests
 *
 * These tests verify that representative API request/response payloads
 * conform to the Zod schemas defined in @school/shared. If the API
 * response shape or the shared schema changes in a breaking way,
 * these tests will fail — surfacing contract breaks early.
 *
 * Coverage: ~20 endpoints across the highest-traffic modules.
 */
import { z } from 'zod';

import {
  amendAttendanceRecordSchema,
  bulkUpsertGradesSchema,
  confirmAllocationsSchema,
  createAcademicPeriodSchema,
  createAcademicYearSchema,
  createAnnouncementSchema,
  createAssessmentSchema,
  createAttendanceSessionSchema,
  createFeeStructureSchema,
  createHouseholdSchema,
  createInvitationSchema,
  createInvoiceSchema,
  createParentSchema,
  createPaymentSchema,
  createRoleSchema,
  createStaffProfileSchema,
  createStudentSchema,
  createSubjectSchema,
  createUserSchema,
  createYearGroupSchema,
  generateReportCardsSchema,
  invoiceQuerySchema,
  listAcademicYearsQuerySchema,
  listAnnouncementsSchema,
  listSubjectsQuerySchema,
  loginSchema,
  paginationQuerySchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  paymentQuerySchema,
  refreshTokenSchema,
  reportCardSnapshotSchema,
  saveAttendanceRecordsSchema,
  staffProfileQuerySchema,
  switchTenantSchema,
  updateAcademicYearStatusSchema,
  updateStaffProfileSchema,
  updateStudentSchema,
  updateStudentStatusSchema,
  userListQuerySchema,
} from '@school/shared';
import {
  createIncidentSchema,
  listIncidentsQuerySchema,
  statusTransitionSchema,
  updateIncidentSchema,
} from '@school/shared/behaviour';
import {
  caseFiltersSchema,
  createCaseSchema,
  createConcernSchema,
  listConcernsQuerySchema,
} from '@school/shared/pastoral';

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const UUID = '11111111-1111-1111-1111-111111111111';
const UUID_2 = '22222222-2222-2222-2222-222222222222';
const UUID_3 = '33333333-3333-3333-3333-333333333333';
const ISO_DATE = '2026-01-15';
const ISO_DATETIME = '2026-01-15T10:00:00.000Z';

// ─── Pagination meta helper ───────────────────────────────────────────────────

const paginationMetaSchema = z.object({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  total: z.number().int().min(0),
});

// ─── 1. Auth ──────────────────────────────────────────────────────────────────

describe('API Contract — Auth', () => {
  describe('POST /v1/auth/login', () => {
    it('should accept a valid login payload', () => {
      const result = loginSchema.safeParse({
        email: 'teacher@school.com',
        password: 'SecurePass123!',
        tenant_id: UUID,
      });
      expect(result.success).toBe(true);
    });

    it('should reject login with missing password', () => {
      const result = loginSchema.safeParse({
        email: 'teacher@school.com',
      });
      expect(result.success).toBe(false);
    });

    it('should reject login with invalid email', () => {
      const result = loginSchema.safeParse({
        email: 'not-an-email',
        password: 'SecurePass123!',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('POST /v1/auth/refresh', () => {
    it('should accept a valid refresh token payload', () => {
      const result = refreshTokenSchema.safeParse({
        refresh_token: 'eyJhbGciOiJIUzI1NiJ9.example',
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty refresh token', () => {
      const result = refreshTokenSchema.safeParse({ refresh_token: '' });
      expect(result.success).toBe(false);
    });
  });

  describe('POST /v1/auth/password-reset-request', () => {
    it('should accept a valid password reset request', () => {
      const result = passwordResetRequestSchema.safeParse({
        email: 'admin@school.com',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('POST /v1/auth/password-reset-confirm', () => {
    it('should accept valid reset confirmation', () => {
      const result = passwordResetConfirmSchema.safeParse({
        token: 'reset-token-abc',
        new_password: 'NewSecurePass1!',
      });
      expect(result.success).toBe(true);
    });

    it('should reject password shorter than 8 characters', () => {
      const result = passwordResetConfirmSchema.safeParse({
        token: 'reset-token-abc',
        new_password: 'short',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('POST /v1/auth/switch-tenant', () => {
    it('should accept a valid tenant UUID', () => {
      const result = switchTenantSchema.safeParse({ tenant_id: UUID });
      expect(result.success).toBe(true);
    });

    it('should reject a non-UUID tenant_id', () => {
      const result = switchTenantSchema.safeParse({ tenant_id: 'not-a-uuid' });
      expect(result.success).toBe(false);
    });
  });
});

// ─── 2. Pagination convention ─────────────────────────────────────────────────

describe('API Contract — Pagination', () => {
  describe('Standard paginated response meta shape', () => {
    it('should validate the { page, pageSize, total } meta shape', () => {
      const meta = { page: 1, pageSize: 20, total: 57 };
      const result = paginationMetaSchema.safeParse(meta);
      expect(result.success).toBe(true);
    });

    it('should reject negative total', () => {
      const meta = { page: 1, pageSize: 20, total: -1 };
      const result = paginationMetaSchema.safeParse(meta);
      expect(result.success).toBe(false);
    });
  });

  describe('paginationQuerySchema defaults', () => {
    it('should apply defaults when no params are given', () => {
      const result = paginationQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(1);
        expect(result.data.pageSize).toBe(20);
        expect(result.data.order).toBe('desc');
      }
    });

    it('should reject pageSize exceeding 100', () => {
      const result = paginationQuerySchema.safeParse({ pageSize: 101 });
      expect(result.success).toBe(false);
    });
  });
});

// ─── 3. Students ──────────────────────────────────────────────────────────────

describe('API Contract — Students', () => {
  describe('POST /v1/students (create)', () => {
    it('should accept a valid create student payload', () => {
      const result = createStudentSchema.safeParse({
        household_id: UUID,
        first_name: 'Ahmed',
        last_name: 'Duadu',
        national_id: 'IE-12345',
        date_of_birth: '2015-09-01',
        nationality: 'Irish',
        status: 'active',
      });
      expect(result.success).toBe(true);
    });

    it('should reject student with allergy flagged but no details', () => {
      const result = createStudentSchema.safeParse({
        household_id: UUID,
        first_name: 'Ahmed',
        last_name: 'Duadu',
        national_id: 'IE-12345',
        date_of_birth: '2015-09-01',
        nationality: 'Irish',
        status: 'active',
        has_allergy: true,
      });
      expect(result.success).toBe(false);
    });

    it('should accept student with allergy details when flagged', () => {
      const result = createStudentSchema.safeParse({
        household_id: UUID,
        first_name: 'Ahmed',
        last_name: 'Duadu',
        national_id: 'IE-12345',
        date_of_birth: '2015-09-01',
        nationality: 'Irish',
        status: 'active',
        has_allergy: true,
        allergy_details: 'Peanut allergy - requires EpiPen',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('PATCH /v1/students/:id (update)', () => {
    it('should accept a partial update payload', () => {
      const result = updateStudentSchema.safeParse({
        first_name: 'Updated Name',
      });
      expect(result.success).toBe(true);
    });

    it('should accept nullable fields being cleared', () => {
      const result = updateStudentSchema.safeParse({
        middle_name: null,
        medical_notes: null,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('PATCH /v1/students/:id/status', () => {
    it('should accept a valid status transition', () => {
      const result = updateStudentStatusSchema.safeParse({
        status: 'active',
      });
      expect(result.success).toBe(true);
    });

    it('should require reason when status is withdrawn', () => {
      const result = updateStudentStatusSchema.safeParse({
        status: 'withdrawn',
      });
      expect(result.success).toBe(false);
    });

    it('should accept withdrawn status with reason', () => {
      const result = updateStudentStatusSchema.safeParse({
        status: 'withdrawn',
        reason: 'Family relocated',
      });
      expect(result.success).toBe(true);
    });
  });
});

// ─── 4. Staff ─────────────────────────────────────────────────────────────────

describe('API Contract — Staff', () => {
  describe('POST /v1/staff-profiles (create)', () => {
    it('should accept a valid staff profile creation', () => {
      const result = createStaffProfileSchema.safeParse({
        first_name: 'John',
        last_name: 'Smith',
        email: 'john.smith@school.com',
        phone: '+353-1-234-5678',
        role_id: UUID,
        employment_status: 'active',
      });
      expect(result.success).toBe(true);
    });

    it('should reject staff profile without email', () => {
      const result = createStaffProfileSchema.safeParse({
        first_name: 'John',
        last_name: 'Smith',
        phone: '+353-1-234-5678',
        role_id: UUID,
        employment_status: 'active',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('PATCH /v1/staff-profiles/:id (update)', () => {
    it('should accept partial update with nullable fields', () => {
      const result = updateStaffProfileSchema.safeParse({
        department: null,
        job_title: 'Head of Science',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('GET /v1/staff-profiles (list query)', () => {
    it('should accept valid query with filters', () => {
      const result = staffProfileQuerySchema.safeParse({
        page: 1,
        pageSize: 20,
        employment_status: 'active',
        search: 'Smith',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid employment_status', () => {
      const result = staffProfileQuerySchema.safeParse({
        employment_status: 'terminated',
      });
      expect(result.success).toBe(false);
    });
  });
});

// ─── 5. Academics ─────────────────────────────────────────────────────────────

describe('API Contract — Academics', () => {
  describe('POST /v1/academic-years (create)', () => {
    it('should accept valid academic year payload', () => {
      const result = createAcademicYearSchema.safeParse({
        name: '2025-2026',
        start_date: '2025-09-01',
        end_date: '2026-06-30',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid date format', () => {
      const result = createAcademicYearSchema.safeParse({
        name: '2025-2026',
        start_date: '01-09-2025',
        end_date: '2026-06-30',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('PATCH /v1/academic-years/:id/status', () => {
    it('should accept valid status transition', () => {
      const result = updateAcademicYearStatusSchema.safeParse({
        status: 'active',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid status', () => {
      const result = updateAcademicYearStatusSchema.safeParse({
        status: 'cancelled',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('POST /v1/academic-periods (create)', () => {
    it('should accept valid academic period', () => {
      const result = createAcademicPeriodSchema.safeParse({
        name: 'Term 1',
        period_type: 'term',
        start_date: '2025-09-01',
        end_date: '2025-12-20',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('POST /v1/year-groups (create)', () => {
    it('should accept valid year group', () => {
      const result = createYearGroupSchema.safeParse({
        name: 'Year 5',
        display_order: 5,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('POST /v1/subjects (create)', () => {
    it('should accept valid subject', () => {
      const result = createSubjectSchema.safeParse({
        name: 'Mathematics',
        code: 'MATH',
        subject_type: 'academic',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('GET /v1/academic-years (list query)', () => {
    it('should accept valid query with status filter', () => {
      const result = listAcademicYearsQuerySchema.safeParse({
        status: 'active',
        page: 1,
        pageSize: 10,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('GET /v1/subjects (list query)', () => {
    it('should accept valid subject list query', () => {
      const result = listSubjectsQuerySchema.safeParse({
        subject_type: 'academic',
        active: 'true',
      });
      expect(result.success).toBe(true);
    });
  });
});

// ─── 6. Attendance ────────────────────────────────────────────────────────────

describe('API Contract — Attendance', () => {
  describe('POST /v1/attendance/sessions (create)', () => {
    it('should accept a valid session creation payload', () => {
      const result = createAttendanceSessionSchema.safeParse({
        class_id: UUID,
        session_date: '2026-01-15',
      });
      expect(result.success).toBe(true);
    });

    it('should reject missing class_id', () => {
      const result = createAttendanceSessionSchema.safeParse({
        session_date: '2026-01-15',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('POST /v1/attendance/sessions/:id/records (save)', () => {
    it('should accept valid attendance records', () => {
      const result = saveAttendanceRecordsSchema.safeParse({
        records: [
          { student_id: UUID, status: 'present' },
          { student_id: UUID_2, status: 'absent_excused', reason: 'Sick' },
          { student_id: UUID_3, status: 'late', arrival_time: '09:15' },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty records array', () => {
      const result = saveAttendanceRecordsSchema.safeParse({ records: [] });
      expect(result.success).toBe(false);
    });

    it('should reject invalid status value', () => {
      const result = saveAttendanceRecordsSchema.safeParse({
        records: [{ student_id: UUID, status: 'unknown' }],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('PATCH /v1/attendance/records/:id (amend)', () => {
    it('should accept a valid amendment', () => {
      const result = amendAttendanceRecordSchema.safeParse({
        status: 'absent_excused',
        amendment_reason: 'Doctor note received',
      });
      expect(result.success).toBe(true);
    });

    it('should reject amendment without reason', () => {
      const result = amendAttendanceRecordSchema.safeParse({
        status: 'absent_excused',
        amendment_reason: '',
      });
      expect(result.success).toBe(false);
    });
  });
});

// ─── 7. Behaviour Incidents ───────────────────────────────────────────────────

describe('API Contract — Behaviour', () => {
  describe('POST /v1/behaviour/incidents (create)', () => {
    it('should accept a valid incident creation', () => {
      const result = createIncidentSchema.safeParse({
        category_id: UUID,
        description: 'Disruptive behaviour during class',
        occurred_at: ISO_DATETIME,
        academic_year_id: UUID_2,
        student_ids: [UUID_3],
      });
      expect(result.success).toBe(true);
    });

    it('should reject incident with empty student_ids', () => {
      const result = createIncidentSchema.safeParse({
        category_id: UUID,
        description: 'Disruptive behaviour during class',
        occurred_at: ISO_DATETIME,
        academic_year_id: UUID_2,
        student_ids: [],
      });
      expect(result.success).toBe(false);
    });

    it('should reject description shorter than 3 characters', () => {
      const result = createIncidentSchema.safeParse({
        category_id: UUID,
        description: 'Hi',
        occurred_at: ISO_DATETIME,
        academic_year_id: UUID_2,
        student_ids: [UUID_3],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('PATCH /v1/behaviour/incidents/:id (update)', () => {
    it('should accept a partial incident update', () => {
      const result = updateIncidentSchema.safeParse({
        description: 'Updated: Disruptive behaviour during science class',
        follow_up_required: true,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('PATCH /v1/behaviour/incidents/:id/status (transition)', () => {
    it('should accept a valid status transition', () => {
      const result = statusTransitionSchema.safeParse({
        status: 'resolved',
        reason: 'Issue addressed with student',
      });
      expect(result.success).toBe(true);
    });

    it('should reject an invalid status value', () => {
      const result = statusTransitionSchema.safeParse({
        status: 'deleted',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('GET /v1/behaviour/incidents (list query)', () => {
    it('should accept valid incident list query', () => {
      const result = listIncidentsQuerySchema.safeParse({
        page: 1,
        pageSize: 20,
        polarity: 'negative',
        status: 'active',
        sort: 'occurred_at',
        order: 'desc',
      });
      expect(result.success).toBe(true);
    });

    it('should use defaults for sort and order', () => {
      const result = listIncidentsQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.sort).toBe('occurred_at');
        expect(result.data.order).toBe('desc');
      }
    });
  });
});

// ─── 8. Finance ───────────────────────────────────────────────────────────────

describe('API Contract — Finance', () => {
  describe('POST /v1/invoices (create)', () => {
    it('should accept a valid invoice payload', () => {
      const result = createInvoiceSchema.safeParse({
        household_id: UUID,
        due_date: ISO_DATE,
        lines: [
          {
            description: 'Tuition Fee - Term 1',
            quantity: 1,
            unit_amount: 2500.0,
            student_id: UUID_2,
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('should reject invoice with no lines', () => {
      const result = createInvoiceSchema.safeParse({
        household_id: UUID,
        due_date: ISO_DATE,
        lines: [],
      });
      expect(result.success).toBe(false);
    });

    it('should reject invoice line with zero unit_amount', () => {
      const result = createInvoiceSchema.safeParse({
        household_id: UUID,
        due_date: ISO_DATE,
        lines: [{ description: 'Fee', quantity: 1, unit_amount: 0 }],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('GET /v1/invoices (list query)', () => {
    it('should accept valid invoice list query', () => {
      const result = invoiceQuerySchema.safeParse({
        page: 1,
        pageSize: 20,
        status: 'issued',
        household_id: UUID,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('POST /v1/payments (create)', () => {
    it('should accept a valid payment payload', () => {
      const result = createPaymentSchema.safeParse({
        household_id: UUID,
        payment_method: 'cash',
        amount: 500.0,
        received_at: ISO_DATETIME,
      });
      expect(result.success).toBe(true);
    });

    it('should reject negative payment amount', () => {
      const result = createPaymentSchema.safeParse({
        household_id: UUID,
        payment_method: 'cash',
        amount: -100,
        received_at: ISO_DATETIME,
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid payment method', () => {
      const result = createPaymentSchema.safeParse({
        household_id: UUID,
        payment_method: 'bitcoin',
        amount: 500,
        received_at: ISO_DATETIME,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('GET /v1/payments (list query)', () => {
    it('should accept valid payment list query', () => {
      const result = paymentQuerySchema.safeParse({
        page: 1,
        pageSize: 20,
        status: 'posted',
        payment_method: 'cash',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('POST /v1/payments/:id/allocations (confirm)', () => {
    it('should accept valid allocation payload', () => {
      const result = confirmAllocationsSchema.safeParse({
        allocations: [
          { invoice_id: UUID, amount: 250 },
          { invoice_id: UUID_2, amount: 250 },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty allocations array', () => {
      const result = confirmAllocationsSchema.safeParse({ allocations: [] });
      expect(result.success).toBe(false);
    });
  });

  describe('POST /v1/fee-structures (create)', () => {
    it('should accept a valid fee structure', () => {
      const result = createFeeStructureSchema.safeParse({
        name: 'Annual Tuition Fee',
        amount: 5000,
        billing_frequency: 'term',
      });
      expect(result.success).toBe(true);
    });

    it('should reject zero amount', () => {
      const result = createFeeStructureSchema.safeParse({
        name: 'Zero Fee',
        amount: 0,
        billing_frequency: 'one_off',
      });
      expect(result.success).toBe(false);
    });
  });
});

// ─── 9. Pastoral ──────────────────────────────────────────────────────────────

describe('API Contract — Pastoral', () => {
  describe('POST /v1/pastoral/concerns (create)', () => {
    it('should accept a valid concern creation payload', () => {
      const result = createConcernSchema.safeParse({
        student_id: UUID,
        category: 'academic',
        severity: 'elevated',
        narrative:
          'Student has been struggling academically for the past two weeks, missing homework assignments.',
        occurred_at: ISO_DATETIME,
      });
      expect(result.success).toBe(true);
    });

    it('should reject narrative shorter than 10 characters', () => {
      const result = createConcernSchema.safeParse({
        student_id: UUID,
        category: 'academic',
        severity: 'routine',
        narrative: 'Short',
        occurred_at: ISO_DATETIME,
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid severity level', () => {
      const result = createConcernSchema.safeParse({
        student_id: UUID,
        category: 'academic',
        severity: 'low',
        narrative: 'This is a valid-length narrative for the test case.',
        occurred_at: ISO_DATETIME,
      });
      expect(result.success).toBe(false);
    });

    it('should reject students_involved containing the primary student', () => {
      const result = createConcernSchema.safeParse({
        student_id: UUID,
        category: 'social',
        severity: 'elevated',
        narrative: 'Conflict between students in the playground during break time.',
        occurred_at: ISO_DATETIME,
        students_involved: [{ student_id: UUID }],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('GET /v1/pastoral/concerns (list query)', () => {
    it('should accept valid concern list query', () => {
      const result = listConcernsQuerySchema.safeParse({
        page: 1,
        pageSize: 20,
        severity: 'urgent',
        sort: 'created_at',
        order: 'desc',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('POST /v1/pastoral/cases (create)', () => {
    it('should accept a valid case creation payload', () => {
      const result = createCaseSchema.safeParse({
        student_id: UUID,
        concern_ids: [UUID_2],
        owner_user_id: UUID_3,
        opened_reason: 'Multiple concerns raised in short period',
      });
      expect(result.success).toBe(true);
    });

    it('should reject case with empty concern_ids', () => {
      const result = createCaseSchema.safeParse({
        student_id: UUID,
        concern_ids: [],
        owner_user_id: UUID_3,
        opened_reason: 'Multiple concerns',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('GET /v1/pastoral/cases (list query)', () => {
    it('should accept valid case filters', () => {
      const result = caseFiltersSchema.safeParse({
        status: 'open',
        tier: 2,
        page: 1,
        pageSize: 20,
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid tier value', () => {
      const result = caseFiltersSchema.safeParse({ tier: 4 });
      expect(result.success).toBe(false);
    });
  });
});

// ─── 10. Households & Parents ─────────────────────────────────────────────────

describe('API Contract — Households & Parents', () => {
  describe('POST /v1/households (create)', () => {
    it('should accept a valid household creation', () => {
      const result = createHouseholdSchema.safeParse({
        household_name: 'The Duadu Family',
        address_line1: '123 Main Street',
        city: 'Dublin',
        country: 'Ireland',
        emergency_contacts: [
          {
            contact_name: 'Uncle Mohammed',
            phone: '+353-1-555-0100',
            display_order: 1,
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('should reject household without emergency contacts', () => {
      const result = createHouseholdSchema.safeParse({
        household_name: 'The Duadu Family',
        emergency_contacts: [],
      });
      expect(result.success).toBe(false);
    });

    it('should reject more than 3 emergency contacts', () => {
      const contacts = [1, 2, 3, 4].map((i) => ({
        contact_name: `Contact ${i}`,
        phone: `+353-1-555-${i}000`,
        display_order: i,
      }));
      const result = createHouseholdSchema.safeParse({
        household_name: 'Large Family',
        emergency_contacts: contacts,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('POST /v1/parents (create)', () => {
    it('should accept a valid parent creation', () => {
      const result = createParentSchema.safeParse({
        first_name: 'Fatima',
        last_name: 'Duadu',
        email: 'fatima@example.com',
        preferred_contact_channels: ['email'],
      });
      expect(result.success).toBe(true);
    });

    it('should reject parent selecting whatsapp without whatsapp_phone', () => {
      const result = createParentSchema.safeParse({
        first_name: 'Fatima',
        last_name: 'Duadu',
        preferred_contact_channels: ['whatsapp'],
      });
      expect(result.success).toBe(false);
    });

    it('should accept whatsapp channel with whatsapp_phone provided', () => {
      const result = createParentSchema.safeParse({
        first_name: 'Fatima',
        last_name: 'Duadu',
        preferred_contact_channels: ['whatsapp'],
        whatsapp_phone: '+353-86-555-1234',
      });
      expect(result.success).toBe(true);
    });
  });
});

// ─── 11. Users & RBAC ────────────────────────────────────────────────────────

describe('API Contract — Users & RBAC', () => {
  describe('POST /v1/users (create)', () => {
    it('should accept a valid user creation', () => {
      const result = createUserSchema.safeParse({
        email: 'newuser@school.com',
        password: 'SecurePass123!',
        first_name: 'New',
        last_name: 'User',
      });
      expect(result.success).toBe(true);
    });

    it('should reject user with password shorter than 8', () => {
      const result = createUserSchema.safeParse({
        email: 'newuser@school.com',
        password: 'short',
        first_name: 'New',
        last_name: 'User',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('POST /v1/rbac/roles (create)', () => {
    it('should accept a valid role creation', () => {
      const result = createRoleSchema.safeParse({
        role_key: 'department_head',
        display_name: 'Department Head',
        role_tier: 'staff',
        permission_ids: [UUID],
      });
      expect(result.success).toBe(true);
    });

    it('should reject role_key with uppercase characters', () => {
      const result = createRoleSchema.safeParse({
        role_key: 'DepartmentHead',
        display_name: 'Department Head',
        role_tier: 'staff',
        permission_ids: [UUID],
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid role_tier', () => {
      const result = createRoleSchema.safeParse({
        role_key: 'superuser',
        display_name: 'Super User',
        role_tier: 'superadmin',
        permission_ids: [],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('POST /v1/rbac/invitations (create)', () => {
    it('should accept a valid invitation', () => {
      const result = createInvitationSchema.safeParse({
        email: 'invited@school.com',
        role_ids: [UUID],
      });
      expect(result.success).toBe(true);
    });

    it('should reject invitation with empty role_ids', () => {
      const result = createInvitationSchema.safeParse({
        email: 'invited@school.com',
        role_ids: [],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('GET /v1/users (list query)', () => {
    it('should accept valid user list query', () => {
      const result = userListQuerySchema.safeParse({
        page: 1,
        pageSize: 20,
        search: 'smith',
        status: 'active',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid user status', () => {
      const result = userListQuerySchema.safeParse({
        status: 'deleted',
      });
      expect(result.success).toBe(false);
    });
  });
});

// ─── 12. Gradebook ───────────────────────────────────────────────────────────

describe('API Contract — Gradebook', () => {
  describe('POST /v1/assessments (create)', () => {
    it('should accept a valid assessment creation', () => {
      const result = createAssessmentSchema.safeParse({
        class_id: UUID,
        subject_id: UUID_2,
        academic_period_id: UUID_3,
        category_id: UUID,
        title: 'Mid-Term Exam',
        max_score: 100,
      });
      expect(result.success).toBe(true);
    });

    it('should reject zero max_score', () => {
      const result = createAssessmentSchema.safeParse({
        class_id: UUID,
        subject_id: UUID_2,
        academic_period_id: UUID_3,
        category_id: UUID,
        title: 'Quiz',
        max_score: 0,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('POST /v1/assessments/:id/grades (bulk upsert)', () => {
    it('should accept valid bulk grade entries', () => {
      const result = bulkUpsertGradesSchema.safeParse({
        grades: [
          { student_id: UUID, raw_score: 85, is_missing: false },
          { student_id: UUID_2, raw_score: null, is_missing: true },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty grades array', () => {
      const result = bulkUpsertGradesSchema.safeParse({ grades: [] });
      expect(result.success).toBe(false);
    });
  });

  describe('POST /v1/report-cards/generate', () => {
    it('should accept valid report card generation request', () => {
      const result = generateReportCardsSchema.safeParse({
        student_ids: [UUID, UUID_2],
        academic_period_id: UUID_3,
      });
      expect(result.success).toBe(true);
    });

    it('should reject with empty student_ids', () => {
      const result = generateReportCardsSchema.safeParse({
        student_ids: [],
        academic_period_id: UUID_3,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Report card snapshot data shape', () => {
    it('should validate a complete report card snapshot', () => {
      const result = reportCardSnapshotSchema.safeParse({
        student: {
          full_name: 'Ahmed Duadu',
          student_number: 'STU-001',
          year_group: 'Year 5',
          class_homeroom: '5A',
        },
        period: {
          name: 'Term 1',
          academic_year: '2025-2026',
          start_date: '2025-09-01',
          end_date: '2025-12-20',
        },
        subjects: [
          {
            subject_name: 'Mathematics',
            subject_code: 'MATH',
            computed_value: 87.5,
            display_value: 'A',
            overridden_value: null,
            assessments: [
              {
                title: 'Mid-Term Exam',
                category: 'Exams',
                max_score: 100,
                raw_score: 87.5,
                is_missing: false,
              },
            ],
          },
        ],
        attendance_summary: {
          total_days: 65,
          present_days: 60,
          absent_days: 3,
          late_days: 2,
        },
        teacher_comment: 'Ahmed shows excellent progress.',
        principal_comment: null,
      });
      expect(result.success).toBe(true);
    });

    it('should reject snapshot with missing student info', () => {
      const result = reportCardSnapshotSchema.safeParse({
        period: {
          name: 'Term 1',
          academic_year: '2025-2026',
          start_date: '2025-09-01',
          end_date: '2025-12-20',
        },
        subjects: [],
        teacher_comment: null,
        principal_comment: null,
      });
      expect(result.success).toBe(false);
    });
  });
});

// ─── 13. Announcements ───────────────────────────────────────────────────────

describe('API Contract — Announcements', () => {
  describe('POST /v1/announcements (create)', () => {
    it('should accept a valid school-wide announcement', () => {
      const result = createAnnouncementSchema.safeParse({
        title: 'School Closure Notice',
        body_html: '<p>School will be closed on Monday due to a public holiday.</p>',
        scope: 'school',
        target_payload: {},
        delivery_channels: ['in_app', 'email'],
      });
      expect(result.success).toBe(true);
    });

    it('should reject announcement without body_html', () => {
      const result = createAnnouncementSchema.safeParse({
        title: 'Test',
        scope: 'school',
        target_payload: {},
      });
      expect(result.success).toBe(false);
    });

    it('should reject year_group scope without year_group_ids', () => {
      const result = createAnnouncementSchema.safeParse({
        title: 'Year Group Notice',
        body_html: '<p>Important update.</p>',
        scope: 'year_group',
        target_payload: {},
      });
      expect(result.success).toBe(false);
    });

    it('should accept year_group scope with year_group_ids', () => {
      const result = createAnnouncementSchema.safeParse({
        title: 'Year Group Notice',
        body_html: '<p>Important update for Year 5.</p>',
        scope: 'year_group',
        target_payload: { year_group_ids: [UUID] },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('GET /v1/announcements (list query)', () => {
    it('should accept valid announcement list query', () => {
      const result = listAnnouncementsSchema.safeParse({
        page: 1,
        pageSize: 20,
        status: 'published',
      });
      expect(result.success).toBe(true);
    });

    it('should use defaults for sort and order', () => {
      const result = listAnnouncementsSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.sort).toBe('created_at');
        expect(result.data.order).toBe('desc');
      }
    });
  });
});
