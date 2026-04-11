import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { SearchIndexService } from '../search/search-index.service';
import { SequenceService } from '../sequence/sequence.service';

import { ApplicationConversionService } from './application-conversion.service';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_TENANT_ID = '22222222-2222-2222-2222-222222222222';
const APP_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const STUDENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const HOUSEHOLD_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const PARENT_1_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const PARENT_2_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const YEAR_GROUP_ID = '99999999-9999-9999-9999-999999999999';

const FULL_PAYLOAD = {
  parent1_first_name: 'Aisha',
  parent1_last_name: 'Khan',
  parent1_email: 'aisha@example.com',
  parent1_phone: '+353 87 1111111',
  parent1_relationship: 'mother',
  parent2_first_name: 'Omar',
  parent2_last_name: 'Khan',
  parent2_email: 'omar@example.com',
  parent2_phone: '+353 87 2222222',
  parent2_relationship: 'father',
  address_line_1: '1 Acorn Road',
  address_line_2: null,
  city: 'Dublin',
  country: 'Ireland',
  postal_code: 'D01 A1B2',
  student_first_name: 'Layla',
  student_middle_name: null,
  student_last_name: 'Khan',
  student_dob: '2018-05-10',
  student_gender: 'female',
  student_national_id: null,
  student_medical_notes: null,
  student_allergies: false,
  __consents: {
    health_data: true,
    whatsapp_channel: true,
    email_marketing: false,
    photo_use: false,
    cross_school_benchmarking: false,
    homework_diary: false,
    ai_features: {
      ai_grading: false,
      ai_comments: false,
      ai_risk_detection: false,
      ai_progress_summary: false,
    },
  },
};

function buildApplicationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: APP_ID,
    tenant_id: TENANT_ID,
    payload_json: { ...FULL_PAYLOAD },
    date_of_birth: new Date('2018-05-10'),
    target_year_group_id: YEAR_GROUP_ID,
    target_academic_year_id: null,
    materialised_student_id: null,
    ...overrides,
  };
}

function buildMockDb() {
  return {
    $queryRaw: jest.fn().mockResolvedValue([]),
    application: {
      findFirst: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    student: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
    },
    parent: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
    },
    household: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn(),
    },
    householdParent: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({}),
    },
    studentParent: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
    },
    consentRecord: {
      create: jest.fn().mockResolvedValue({}),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

describe('ApplicationConversionService — convertToStudent', () => {
  let service: ApplicationConversionService;
  let sequenceService: {
    nextNumber: jest.Mock;
    generateHouseholdReference: jest.Mock;
  };
  let searchIndexService: { indexEntity: jest.Mock };
  let prisma: {
    student: { findFirst: jest.Mock };
    household: { findFirst: jest.Mock };
    parent: { findFirst: jest.Mock };
  };

  beforeEach(async () => {
    sequenceService = {
      nextNumber: jest.fn().mockResolvedValue('STU-000001'),
      generateHouseholdReference: jest.fn().mockResolvedValue('HH-000001'),
    };
    searchIndexService = { indexEntity: jest.fn().mockResolvedValue(undefined) };
    prisma = {
      student: { findFirst: jest.fn().mockResolvedValue(null) },
      household: { findFirst: jest.fn().mockResolvedValue(null) },
      parent: { findFirst: jest.fn().mockResolvedValue(null) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApplicationConversionService,
        { provide: PrismaService, useValue: prisma },
        { provide: SequenceService, useValue: sequenceService },
        { provide: SearchIndexService, useValue: searchIndexService },
      ],
    }).compile();

    service = module.get(ApplicationConversionService);
  });

  afterEach(() => jest.clearAllMocks());

  // ──────────────────────────────────────────────────────────────────────────

  it('happy path — creates household, parents, student, and links them', async () => {
    const db = buildMockDb();
    db.application.findFirst.mockResolvedValue(buildApplicationRow());
    db.parent.create
      .mockResolvedValueOnce({ id: PARENT_1_ID })
      .mockResolvedValueOnce({ id: PARENT_2_ID });
    db.household.create.mockResolvedValue({ id: HOUSEHOLD_ID });
    // Student counter increments to 1 for household-derived number
    db.household.update.mockResolvedValue({ student_counter: 1 });
    db.student.create.mockResolvedValue({ id: STUDENT_ID });
    // After household + parents are created, findMany returns the linked parents
    db.householdParent.findMany.mockResolvedValue([
      { parent_id: PARENT_1_ID, role_label: 'mother', parent: { is_primary_contact: true } },
      { parent_id: PARENT_2_ID, role_label: 'father', parent: { is_primary_contact: false } },
    ]);

    const result = await service.convertToStudent(db as never, {
      tenantId: TENANT_ID,
      applicationId: APP_ID,
      triggerUserId: USER_ID,
    });

    expect(result).toEqual({
      student_id: STUDENT_ID,
      household_id: HOUSEHOLD_ID,
      primary_parent_id: PARENT_1_ID,
      secondary_parent_id: PARENT_2_ID,
      created: true,
    });
    expect(db.parent.create).toHaveBeenCalledTimes(2);
    expect(db.household.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          household_name: 'Khan Family',
          household_number: expect.stringMatching(/^[A-Z]{3}[0-9]{3}$/),
          primary_billing_parent_id: PARENT_1_ID,
          address_line_1: '1 Acorn Road',
          city: 'Dublin',
        }),
      }),
    );
    // Student number is now household-derived: {code}-01
    expect(db.student.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          household_id: HOUSEHOLD_ID,
          student_number: expect.stringMatching(/^[A-Z]{3}[0-9]{3}-01$/),
          year_group_id: YEAR_GROUP_ID,
          class_homeroom_id: null,
          status: 'active',
        }),
      }),
    );
    expect(db.studentParent.create).toHaveBeenCalledTimes(2);
    // Application gets two updates: household_id link + materialised_student_id
    expect(db.application.update).toHaveBeenCalledWith({
      where: { id: APP_ID },
      data: { materialised_student_id: STUDENT_ID },
    });
    expect(db.consentRecord.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            subject_type: 'student',
            subject_id: STUDENT_ID,
            consent_type: 'health_data',
            granted_by_user_id: USER_ID,
            evidence_type: 'registration_form',
          }),
        ]),
      }),
    );
    expect(db.consentRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ consent_type: 'whatsapp_channel' }),
      }),
    );
  });

  it('idempotency — short-circuits when materialised_student_id is already set', async () => {
    const db = buildMockDb();
    db.application.findFirst.mockResolvedValue(
      buildApplicationRow({ materialised_student_id: STUDENT_ID }),
    );
    db.student.findFirst.mockResolvedValue({
      id: STUDENT_ID,
      household_id: HOUSEHOLD_ID,
      student_parents: [
        { parent_id: PARENT_1_ID, parent: { is_primary_contact: true } },
        { parent_id: PARENT_2_ID, parent: { is_primary_contact: false } },
      ],
    });

    const result = await service.convertToStudent(db as never, {
      tenantId: TENANT_ID,
      applicationId: APP_ID,
      triggerUserId: USER_ID,
    });

    expect(result).toEqual({
      student_id: STUDENT_ID,
      household_id: HOUSEHOLD_ID,
      primary_parent_id: PARENT_1_ID,
      secondary_parent_id: PARENT_2_ID,
      created: false,
    });
    expect(db.parent.create).not.toHaveBeenCalled();
    expect(db.household.create).not.toHaveBeenCalled();
    expect(db.student.create).not.toHaveBeenCalled();
    expect(db.application.update).not.toHaveBeenCalled();
  });

  it('existing parent match — links to existing parent household instead of creating one', async () => {
    const db = buildMockDb();
    db.application.findFirst.mockResolvedValue(buildApplicationRow());
    // First call = parent 1 lookup → one match
    // Second call = parent 2 lookup → no matches → create
    db.parent.findMany.mockResolvedValueOnce([{ id: PARENT_1_ID }]).mockResolvedValueOnce([]);
    db.householdParent.findFirst
      .mockResolvedValueOnce({ household_id: HOUSEHOLD_ID }) // parent1 household lookup
      .mockResolvedValueOnce(null); // parent2 link existence check
    db.parent.create.mockResolvedValueOnce({ id: PARENT_2_ID });
    // Existing household has a household_number — student counter increments
    db.household.findFirst
      .mockResolvedValueOnce(null) // generateUniqueHouseholdNumber not called (parent matched)
      .mockResolvedValueOnce({ household_number: 'ABC123' }); // findFirst for existing household_number
    db.household.update.mockResolvedValue({ student_counter: 1 });
    db.student.create.mockResolvedValue({ id: STUDENT_ID });
    db.householdParent.findMany.mockResolvedValue([
      { parent_id: PARENT_1_ID, role_label: 'mother', parent: { is_primary_contact: true } },
      { parent_id: PARENT_2_ID, role_label: 'father', parent: { is_primary_contact: false } },
    ]);

    const result = await service.convertToStudent(db as never, {
      tenantId: TENANT_ID,
      applicationId: APP_ID,
      triggerUserId: USER_ID,
    });

    expect(result.household_id).toBe(HOUSEHOLD_ID);
    expect(result.primary_parent_id).toBe(PARENT_1_ID);
    expect(db.household.create).not.toHaveBeenCalled();
    // Parent 2 should still be linked to the existing household
    expect(db.householdParent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          household_id: HOUSEHOLD_ID,
          parent_id: PARENT_2_ID,
        }),
      }),
    );
  });

  it('ambiguous parent match — creates a new parent and logs a warning', async () => {
    const db = buildMockDb();
    db.application.findFirst.mockResolvedValue(buildApplicationRow());
    db.parent.findMany
      .mockResolvedValueOnce([{ id: 'match-1' }, { id: 'match-2' }])
      .mockResolvedValueOnce([]);
    db.parent.create
      .mockResolvedValueOnce({ id: PARENT_1_ID })
      .mockResolvedValueOnce({ id: PARENT_2_ID });
    db.household.create.mockResolvedValue({ id: HOUSEHOLD_ID });
    db.household.update.mockResolvedValue({ student_counter: 1 });
    db.student.create.mockResolvedValue({ id: STUDENT_ID });
    db.householdParent.findMany.mockResolvedValue([
      { parent_id: PARENT_1_ID, role_label: 'mother', parent: { is_primary_contact: true } },
      { parent_id: PARENT_2_ID, role_label: 'father', parent: { is_primary_contact: false } },
    ]);

    const warnSpy = jest
      .spyOn((service as unknown as { logger: { warn: jest.Mock } }).logger, 'warn')
      .mockImplementation(() => undefined);

    await service.convertToStudent(db as never, {
      tenantId: TENANT_ID,
      applicationId: APP_ID,
      triggerUserId: USER_ID,
    });

    expect(db.parent.create).toHaveBeenCalledTimes(2);
    expect(db.household.create).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('ambiguous parent match'));
  });

  it('parent 2 optional — only creates primary parent when payload has no parent2', async () => {
    const db = buildMockDb();
    const payload = { ...FULL_PAYLOAD, parent2_first_name: null, parent2_last_name: null };
    db.application.findFirst.mockResolvedValue(buildApplicationRow({ payload_json: payload }));
    db.parent.create.mockResolvedValueOnce({ id: PARENT_1_ID });
    db.household.create.mockResolvedValue({ id: HOUSEHOLD_ID });
    db.household.update.mockResolvedValue({ student_counter: 1 });
    db.student.create.mockResolvedValue({ id: STUDENT_ID });
    db.householdParent.findMany.mockResolvedValue([
      { parent_id: PARENT_1_ID, role_label: 'mother', parent: { is_primary_contact: true } },
    ]);

    const result = await service.convertToStudent(db as never, {
      tenantId: TENANT_ID,
      applicationId: APP_ID,
      triggerUserId: USER_ID,
    });

    expect(result.secondary_parent_id).toBeNull();
    expect(db.parent.create).toHaveBeenCalledTimes(1);
    expect(db.studentParent.create).toHaveBeenCalledTimes(1);
  });

  it('PAYLOAD_MALFORMED — throws when a required key is missing', async () => {
    const db = buildMockDb();
    const badPayload: Record<string, unknown> = { ...FULL_PAYLOAD };
    delete badPayload.address_line_1;
    db.application.findFirst.mockResolvedValue(buildApplicationRow({ payload_json: badPayload }));

    await expect(
      service.convertToStudent(db as never, {
        tenantId: TENANT_ID,
        applicationId: APP_ID,
        triggerUserId: USER_ID,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('APPLICATION_NOT_FOUND — throws when the application does not exist', async () => {
    const db = buildMockDb();
    db.application.findFirst.mockResolvedValue(null);

    await expect(
      service.convertToStudent(db as never, {
        tenantId: TENANT_ID,
        applicationId: APP_ID,
        triggerUserId: USER_ID,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('cross-tenant — parent match query is scoped by tenant_id', async () => {
    const db = buildMockDb();
    db.application.findFirst.mockResolvedValue(buildApplicationRow());
    db.parent.findMany.mockResolvedValue([]);
    db.parent.create
      .mockResolvedValueOnce({ id: PARENT_1_ID })
      .mockResolvedValueOnce({ id: PARENT_2_ID });
    db.household.create.mockResolvedValue({ id: HOUSEHOLD_ID });
    db.household.update.mockResolvedValue({ student_counter: 1 });
    db.student.create.mockResolvedValue({ id: STUDENT_ID });
    db.householdParent.findMany.mockResolvedValue([
      { parent_id: PARENT_1_ID, role_label: 'mother', parent: { is_primary_contact: true } },
      { parent_id: PARENT_2_ID, role_label: 'father', parent: { is_primary_contact: false } },
    ]);

    await service.convertToStudent(db as never, {
      tenantId: TENANT_ID,
      applicationId: APP_ID,
      triggerUserId: USER_ID,
    });

    // Every parent.findMany call must include tenant_id scoping
    const findManyCalls = db.parent.findMany.mock.calls;
    for (const call of findManyCalls) {
      expect(call[0].where.tenant_id).toBe(TENANT_ID);
      expect(call[0].where.tenant_id).not.toBe(OTHER_TENANT_ID);
    }
    // student.create also tenant-scoped
    expect(db.student.create.mock.calls[0]![0].data.tenant_id).toBe(TENANT_ID);
    expect(db.household.create.mock.calls[0]![0].data.tenant_id).toBe(TENANT_ID);
  });

  it('duplicate student — returns existing student when a matching active row is found', async () => {
    const db = buildMockDb();
    db.application.findFirst.mockResolvedValue(buildApplicationRow());
    db.student.findFirst.mockResolvedValue({
      id: STUDENT_ID,
      household_id: HOUSEHOLD_ID,
      student_parents: [{ parent_id: PARENT_1_ID, parent: { is_primary_contact: true } }],
    });

    const result = await service.convertToStudent(db as never, {
      tenantId: TENANT_ID,
      applicationId: APP_ID,
      triggerUserId: USER_ID,
    });

    expect(result).toEqual({
      student_id: STUDENT_ID,
      household_id: HOUSEHOLD_ID,
      primary_parent_id: PARENT_1_ID,
      secondary_parent_id: null,
      created: false,
    });
    // No creates should have happened — we short-circuited
    expect(db.parent.create).not.toHaveBeenCalled();
    expect(db.household.create).not.toHaveBeenCalled();
    expect(db.student.create).not.toHaveBeenCalled();
    // Pointer should be written back to the application row
    expect(db.application.update).toHaveBeenCalledWith({
      where: { id: APP_ID },
      data: { materialised_student_id: STUDENT_ID },
    });
  });

  it('consent migration — subject_type is always "student"', async () => {
    const db = buildMockDb();
    db.application.findFirst.mockResolvedValue(buildApplicationRow());
    db.parent.create
      .mockResolvedValueOnce({ id: PARENT_1_ID })
      .mockResolvedValueOnce({ id: PARENT_2_ID });
    db.household.create.mockResolvedValue({ id: HOUSEHOLD_ID });
    db.household.update.mockResolvedValue({ student_counter: 1 });
    db.student.create.mockResolvedValue({ id: STUDENT_ID });
    db.householdParent.findMany.mockResolvedValue([
      { parent_id: PARENT_1_ID, role_label: 'mother', parent: { is_primary_contact: true } },
      { parent_id: PARENT_2_ID, role_label: 'father', parent: { is_primary_contact: false } },
    ]);

    await service.convertToStudent(db as never, {
      tenantId: TENANT_ID,
      applicationId: APP_ID,
      triggerUserId: USER_ID,
    });

    const createManyCall = db.consentRecord.createMany.mock.calls[0]![0];
    for (const row of createManyCall.data) {
      expect(row.subject_type).toBe('student');
      expect(row.subject_id).toBe(STUDENT_ID);
    }
  });
});
