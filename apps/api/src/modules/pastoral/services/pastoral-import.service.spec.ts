import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../prisma/prisma.service';

import { PastoralEventService } from './pastoral-event.service';
import { PastoralImportService } from './pastoral-import.service';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ACTOR_USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const STUDENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const STUDENT_ID_2 = 'cccccccc-cccc-cccc-cccc-cccccccccccd';

const DEFAULT_CATEGORIES = [
  { key: 'academic', label: 'Academic', active: true },
  { key: 'social', label: 'Social', active: true },
  { key: 'emotional', label: 'Emotional', active: true },
  { key: 'behavioural', label: 'Behavioural', active: true },
  { key: 'attendance', label: 'Attendance', active: true },
  { key: 'child_protection', label: 'Child Protection', auto_tier: 3, active: true },
  { key: 'bullying', label: 'Bullying', active: true },
  { key: 'self_harm', label: 'Self-harm / Suicidal ideation', auto_tier: 3, active: true },
  { key: 'other', label: 'Other', active: true },
];

// ─── RLS mock ───────────────────────────────────────────────────────────────

const mockRlsTx = {
  pastoralConcern: {
    create: jest.fn(),
    findFirst: jest.fn(),
  },
  pastoralConcernVersion: {
    create: jest.fn(),
  },
  student: {
    findFirst: jest.fn(),
  },
  tenantSetting: {
    findUnique: jest.fn(),
  },
};

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

const makeTenantSettingsRecord = () => ({
  id: 'settings-1',
  tenant_id: TENANT_ID,
  settings: {
    pastoral: {
      concern_categories: DEFAULT_CATEGORIES,
    },
  },
  created_at: new Date(),
  updated_at: new Date(),
});

const makeStudentRecord = (overrides: Record<string, unknown> = {}) => ({
  id: STUDENT_ID,
  first_name: 'John',
  last_name: 'Doe',
  student_number: 'ENR-001',
  ...overrides,
});

function buildCsvBuffer(rows: string[]): Buffer {
  const header =
    'date,student_identifier,category,severity,narrative,actions_taken,follow_up_notes';
  return Buffer.from([header, ...rows].join('\n'), 'utf-8');
}

function buildValidRow(overrides: Partial<Record<string, string>> = {}): string {
  const date = overrides.date ?? '2025-09-15';
  const studentId = overrides.student_identifier ?? 'ENR-001';
  const category = overrides.category ?? 'academic';
  const severity = overrides.severity ?? 'routine';
  const narrative =
    overrides.narrative ?? 'Student appears withdrawn in class and not engaging with group work';
  const actions = overrides.actions_taken ?? 'Spoke with student';
  const followUp = overrides.follow_up_notes ?? 'Monitor';
  return `${date},${studentId},${category},${severity},"${narrative}",${actions},${followUp}`;
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('PastoralImportService', () => {
  let service: PastoralImportService;
  let mockEventService: { write: jest.Mock };

  beforeAll(() => {
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(async () => {
    mockEventService = {
      write: jest.fn().mockResolvedValue(undefined),
    };

    // Reset all RLS tx mocks
    for (const model of Object.values(mockRlsTx)) {
      for (const fn of Object.values(model)) {
        (fn as jest.Mock).mockReset();
      }
    }

    // Default mock: tenant settings with categories
    mockRlsTx.tenantSetting.findUnique.mockResolvedValue(makeTenantSettingsRecord());

    // Default mock: student found by student_number
    mockRlsTx.student.findFirst.mockResolvedValue(makeStudentRecord());

    // Default mock: no duplicate hashes
    mockRlsTx.pastoralConcern.findFirst.mockResolvedValue(null);

    // Default mock: create returns a concern with id
    mockRlsTx.pastoralConcern.create.mockImplementation((args: { data: Record<string, unknown> }) =>
      Promise.resolve({
        id: 'new-concern-id-' + String(Math.random()).slice(2, 8),
        ...args.data,
      }),
    );
    mockRlsTx.pastoralConcernVersion.create.mockResolvedValue({
      id: 'version-1',
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PastoralImportService,
        { provide: PrismaService, useValue: {} },
        { provide: PastoralEventService, useValue: mockEventService },
      ],
    }).compile();

    service = module.get<PastoralImportService>(PastoralImportService);
  });

  // ─── 1. Valid CSV produces correct validation report ──────────────────────

  it('should produce a correct validation report for a valid CSV', async () => {
    const csv = buildCsvBuffer([buildValidRow()]);
    const result = await service.validate(TENANT_ID, ACTOR_USER_ID, csv);

    expect(result.total_rows).toBe(1);
    expect(result.valid_rows).toBe(1);
    expect(result.error_rows).toBe(0);
    expect(result.skipped_rows).toBe(0);
    expect(result.validation_token).toBeDefined();
    expect(result.errors).toHaveLength(0);
    expect(result.preview).toHaveLength(1);
    expect(result.preview[0]?.student_name).toBe('John Doe');
    expect(result.preview[0]?.category).toBe('academic');
  });

  // ─── 2. Missing required fields produce row-level errors ──────────────────

  it('should produce errors for missing required fields', async () => {
    const csv = buildCsvBuffer([',,,,,,']); // all fields empty
    const result = await service.validate(TENANT_ID, ACTOR_USER_ID, csv);

    expect(result.error_rows).toBe(1);
    expect(result.valid_rows).toBe(0);

    const fields = result.errors.map((e) => e.field);
    expect(fields).toContain('date');
    expect(fields).toContain('student_identifier');
    expect(fields).toContain('category');
    expect(fields).toContain('severity');
    expect(fields).toContain('narrative');
  });

  // ─── 3. Unrecognised category produces error ─────────────────────────────

  it('should produce an error for an unrecognised category', async () => {
    const csv = buildCsvBuffer([buildValidRow({ category: 'nonexistent_category' })]);
    const result = await service.validate(TENANT_ID, ACTOR_USER_ID, csv);

    expect(result.error_rows).toBe(1);
    expect(result.errors[0]?.field).toBe('category');
    expect(result.errors[0]?.message).toContain('Unrecognised or inactive category');
  });

  // ─── 4. Invalid severity produces error ───────────────────────────────────

  it('should produce an error for an invalid severity', async () => {
    const csv = buildCsvBuffer([buildValidRow({ severity: 'extreme' })]);
    const result = await service.validate(TENANT_ID, ACTOR_USER_ID, csv);

    expect(result.error_rows).toBe(1);
    expect(result.errors[0]?.field).toBe('severity');
    expect(result.errors[0]?.message).toContain('Invalid severity');
  });

  // ─── 5. Unmatched student identifier produces error ───────────────────────

  it('should produce an error when student is not found', async () => {
    mockRlsTx.student.findFirst.mockResolvedValue(null);

    const csv = buildCsvBuffer([buildValidRow({ student_identifier: 'UNKNOWN-999' })]);
    const result = await service.validate(TENANT_ID, ACTOR_USER_ID, csv);

    expect(result.error_rows).toBe(1);
    expect(result.errors[0]?.field).toBe('student_identifier');
    expect(result.errors[0]?.message).toContain('Student not found');
  });

  // ─── 6. Future date produces error ────────────────────────────────────────

  it('should produce an error for a future date', async () => {
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);
    const futureDateStr = futureDate.toISOString().split('T')[0];

    const csv = buildCsvBuffer([buildValidRow({ date: futureDateStr })]);
    const result = await service.validate(TENANT_ID, ACTOR_USER_ID, csv);

    expect(result.error_rows).toBe(1);
    expect(result.errors[0]?.field).toBe('date');
    expect(result.errors[0]?.message).toContain('future');
  });

  // ─── 7. child_protection category produces error ──────────────────────────

  it('should produce an error for child_protection category', async () => {
    const csv = buildCsvBuffer([buildValidRow({ category: 'child_protection' })]);
    const result = await service.validate(TENANT_ID, ACTOR_USER_ID, csv);

    expect(result.error_rows).toBe(1);
    expect(result.errors[0]?.field).toBe('category');
    expect(result.errors[0]?.message).toContain(
      'Child protection records cannot be imported in bulk',
    );
    expect(result.errors[0]?.message).toContain('DLP interface');
  });

  it('should produce an error for self_harm category', async () => {
    const csv = buildCsvBuffer([buildValidRow({ category: 'self_harm' })]);
    const result = await service.validate(TENANT_ID, ACTOR_USER_ID, csv);

    expect(result.error_rows).toBe(1);
    expect(result.errors[0]?.field).toBe('category');
    expect(result.errors[0]?.message).toContain('Tier 3 category');
    expect(result.errors[0]?.message).toContain('self_harm');
  });

  // ─── 8. urgent/critical severity produces warning ─────────────────────────

  it('should produce a warning for urgent severity', async () => {
    const csv = buildCsvBuffer([buildValidRow({ severity: 'urgent' })]);
    const result = await service.validate(TENANT_ID, ACTOR_USER_ID, csv);

    expect(result.valid_rows).toBe(1);
    expect(result.warnings.length).toBeGreaterThanOrEqual(1);
    expect(result.warnings.some((w) => w.message.includes('urgent'))).toBe(true);
  });

  it('should produce a warning for critical severity', async () => {
    const csv = buildCsvBuffer([buildValidRow({ severity: 'critical' })]);
    const result = await service.validate(TENANT_ID, ACTOR_USER_ID, csv);

    expect(result.valid_rows).toBe(1);
    expect(result.warnings.some((w) => w.message.includes('critical'))).toBe(true);
  });

  // ─── 9. Duplicate hash detection skips row with warning ───────────────────

  it('should skip duplicates and produce a warning', async () => {
    mockRlsTx.pastoralConcern.findFirst.mockResolvedValue({ id: 'existing-concern' });

    const csv = buildCsvBuffer([buildValidRow()]);
    const result = await service.validate(TENANT_ID, ACTOR_USER_ID, csv);

    expect(result.skipped_rows).toBe(1);
    expect(result.valid_rows).toBe(0);
    expect(result.warnings.some((w) => w.message.includes('Duplicate'))).toBe(true);
  });

  // ─── 10. Confirm creates concerns with imported = true ────────────────────

  it('should create concerns with imported=true on confirm', async () => {
    // First validate
    const csv = buildCsvBuffer([buildValidRow()]);
    const validation = await service.validate(TENANT_ID, ACTOR_USER_ID, csv);

    // Then confirm
    const result = await service.confirm(TENANT_ID, ACTOR_USER_ID, validation.validation_token);

    expect(result.total_imported).toBe(1);
    expect(mockRlsTx.pastoralConcern.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          imported: true,
          tenant_id: TENANT_ID,
          student_id: STUDENT_ID,
          logged_by_user_id: ACTOR_USER_ID,
          category: 'academic',
          severity: 'routine',
          tier: 1,
        }),
      }),
    );
    expect(mockRlsTx.pastoralConcernVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenant_id: TENANT_ID,
        concern_id: expect.any(String),
        version_number: 1,
        narrative: expect.any(String),
        amended_by_user_id: ACTOR_USER_ID,
        amendment_reason: null,
      }),
    });
  });

  // ─── 11. Confirm creates audit events with source: 'historical_import' ────

  it('should create audit events with source historical_import on confirm', async () => {
    const csv = buildCsvBuffer([buildValidRow()]);
    const validation = await service.validate(TENANT_ID, ACTOR_USER_ID, csv);

    await service.confirm(TENANT_ID, ACTOR_USER_ID, validation.validation_token);

    expect(mockEventService.write).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: TENANT_ID,
        event_type: 'concern_created',
        entity_type: 'concern',
        actor_user_id: ACTOR_USER_ID,
        payload: expect.objectContaining({
          source: 'historical_import',
        }),
      }),
    );
  });

  // ─── 12. Confirm with invalid/expired validation token throws ─────────────

  it('should throw BadRequestException for invalid validation token', async () => {
    await expect(
      service.confirm(TENANT_ID, ACTOR_USER_ID, 'invalid-token-does-not-exist'),
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw with code VALIDATION_EXPIRED for expired token', async () => {
    await expect(service.confirm(TENANT_ID, ACTOR_USER_ID, 'expired-token')).rejects.toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          code: 'VALIDATION_EXPIRED',
        }),
      }),
    );
  });

  // ─── 13. Re-upload of same CSV skips previously imported rows ─────────────

  it('should skip previously imported rows on re-upload (idempotency)', async () => {
    // First import: no duplicates
    mockRlsTx.pastoralConcern.findFirst.mockResolvedValue(null);
    const csv = buildCsvBuffer([buildValidRow()]);
    const validation1 = await service.validate(TENANT_ID, ACTOR_USER_ID, csv);
    expect(validation1.valid_rows).toBe(1);

    // Now simulate that the hash exists in DB (was imported)
    mockRlsTx.pastoralConcern.findFirst.mockResolvedValue({ id: 'already-imported' });

    const validation2 = await service.validate(TENANT_ID, ACTOR_USER_ID, csv);
    expect(validation2.skipped_rows).toBe(1);
    expect(validation2.valid_rows).toBe(0);
  });

  // ─── 14. Student resolution works with enrolment ID format ────────────────

  it('should resolve students by student number', async () => {
    mockRlsTx.student.findFirst.mockResolvedValue(makeStudentRecord({ student_number: 'STU-001' }));

    const csv = buildCsvBuffer([buildValidRow({ student_identifier: 'STU-001' })]);
    const result = await service.validate(TENANT_ID, ACTOR_USER_ID, csv);

    expect(result.valid_rows).toBe(1);
    expect(result.preview[0]?.student_name).toBe('John Doe');
  });

  // ─── 15. Student resolution works with name+DOB format ────────────────────

  it('should resolve students by name+DOB format', async () => {
    // First call: no match by student_number
    // Second call: match by name+DOB
    mockRlsTx.student.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(
      makeStudentRecord({
        id: STUDENT_ID_2,
        first_name: 'Jane',
        last_name: 'Smith',
      }),
    );

    const csv = buildCsvBuffer([buildValidRow({ student_identifier: 'Jane Smith (2012-05-20)' })]);
    const result = await service.validate(TENANT_ID, ACTOR_USER_ID, csv);

    expect(result.valid_rows).toBe(1);
    expect(result.preview[0]?.student_name).toBe('Jane Smith');
  });

  // ─── 16. Tier assignment: routine/elevated = Tier 1, urgent = Tier 2 ──────

  it('should assign Tier 1 for routine severity', async () => {
    const csv = buildCsvBuffer([buildValidRow({ severity: 'routine' })]);
    const validation = await service.validate(TENANT_ID, ACTOR_USER_ID, csv);
    await service.confirm(TENANT_ID, ACTOR_USER_ID, validation.validation_token);

    expect(mockRlsTx.pastoralConcern.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tier: 1 }),
      }),
    );
  });

  it('should assign Tier 1 for elevated severity', async () => {
    const csv = buildCsvBuffer([buildValidRow({ severity: 'elevated' })]);
    const validation = await service.validate(TENANT_ID, ACTOR_USER_ID, csv);
    await service.confirm(TENANT_ID, ACTOR_USER_ID, validation.validation_token);

    expect(mockRlsTx.pastoralConcern.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tier: 1 }),
      }),
    );
  });

  it('should assign Tier 2 for urgent severity', async () => {
    const csv = buildCsvBuffer([buildValidRow({ severity: 'urgent' })]);
    const validation = await service.validate(TENANT_ID, ACTOR_USER_ID, csv);
    await service.confirm(TENANT_ID, ACTOR_USER_ID, validation.validation_token);

    expect(mockRlsTx.pastoralConcern.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tier: 2 }),
      }),
    );
  });

  it('should assign Tier 2 for critical severity (never Tier 3)', async () => {
    const csv = buildCsvBuffer([buildValidRow({ severity: 'critical' })]);
    const validation = await service.validate(TENANT_ID, ACTOR_USER_ID, csv);
    await service.confirm(TENANT_ID, ACTOR_USER_ID, validation.validation_token);

    expect(mockRlsTx.pastoralConcern.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tier: 2 }),
      }),
    );
  });

  // ─── 17. Template generation produces valid CSV buffer ────────────────────

  it('should generate a valid CSV template buffer', () => {
    const buffer = service.generateTemplate();
    const content = buffer.toString('utf-8');

    expect(content).toContain(
      'date,student_identifier,category,severity,narrative,actions_taken,follow_up_notes',
    );
    expect(content).toContain('2025-09-15');
    expect(content).toContain('MDAD-S-00001');
    expect(content).toContain('academic');
    expect(content).toContain('routine');
    expect(Buffer.isBuffer(buffer)).toBe(true);
  });

  // ─── 18. Narrative under 10 characters produces error ─────────────────────

  it('should produce an error when narrative is under 10 characters', async () => {
    const csv = buildCsvBuffer([buildValidRow({ narrative: 'Too short' })]);
    const result = await service.validate(TENANT_ID, ACTOR_USER_ID, csv);

    expect(result.error_rows).toBe(1);
    expect(result.errors[0]?.field).toBe('narrative');
    expect(result.errors[0]?.message).toContain('at least 10 characters');
  });

  // ─── Additional edge cases ────────────────────────────────────────────────

  it('should handle UTF-8 BOM in CSV', async () => {
    const bomBuffer = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]), // UTF-8 BOM
      buildCsvBuffer([buildValidRow()]),
    ]);
    const result = await service.validate(TENANT_ID, ACTOR_USER_ID, bomBuffer);

    expect(result.valid_rows).toBe(1);
    expect(result.error_rows).toBe(0);
  });

  it('should handle \\r\\n line endings', async () => {
    const header =
      'date,student_identifier,category,severity,narrative,actions_taken,follow_up_notes';
    const row = buildValidRow();
    const content = header + '\r\n' + row + '\r\n';
    const buffer = Buffer.from(content, 'utf-8');

    const result = await service.validate(TENANT_ID, ACTOR_USER_ID, buffer);

    expect(result.valid_rows).toBe(1);
    expect(result.error_rows).toBe(0);
  });

  it('should handle multiple valid rows', async () => {
    mockRlsTx.student.findFirst.mockResolvedValue(makeStudentRecord());

    const csv = buildCsvBuffer([
      buildValidRow({ narrative: 'First concern with enough detail' }),
      buildValidRow({ narrative: 'Second concern with enough detail' }),
    ]);
    const result = await service.validate(TENANT_ID, ACTOR_USER_ID, csv);

    expect(result.total_rows).toBe(2);
    expect(result.valid_rows).toBe(2);
    expect(result.preview).toHaveLength(2);
  });

  it('should clean up validation cache after confirm', async () => {
    const csv = buildCsvBuffer([buildValidRow()]);
    const validation = await service.validate(TENANT_ID, ACTOR_USER_ID, csv);
    await service.confirm(TENANT_ID, ACTOR_USER_ID, validation.validation_token);

    // Second confirm with same token should fail
    await expect(
      service.confirm(TENANT_ID, ACTOR_USER_ID, validation.validation_token),
    ).rejects.toThrow(BadRequestException);
  });

  it('should count audit events correctly on confirm', async () => {
    const csv = buildCsvBuffer([
      buildValidRow({ narrative: 'First valid concern narrative text' }),
      buildValidRow({ narrative: 'Second valid concern narrative text' }),
    ]);
    const validation = await service.validate(TENANT_ID, ACTOR_USER_ID, csv);
    const result = await service.confirm(TENANT_ID, ACTOR_USER_ID, validation.validation_token);

    expect(result.total_imported).toBe(2);
    expect(result.audit_events_created).toBe(2);
    expect(mockEventService.write).toHaveBeenCalledTimes(2);
  });

  it('should skip duplicates at confirm time with double-check', async () => {
    // Validation: no duplicates
    mockRlsTx.pastoralConcern.findFirst.mockResolvedValue(null);
    const csv = buildCsvBuffer([buildValidRow()]);
    const validation = await service.validate(TENANT_ID, ACTOR_USER_ID, csv);

    // Confirm: now the hash exists (concurrent import happened)
    mockRlsTx.pastoralConcern.findFirst.mockResolvedValue({ id: 'concurrent-import' });
    const result = await service.confirm(TENANT_ID, ACTOR_USER_ID, validation.validation_token);

    expect(result.total_imported).toBe(0);
    expect(result.skipped_duplicates).toBe(1);
    expect(mockRlsTx.pastoralConcern.create).not.toHaveBeenCalled();
  });

  // ─── Additional branch coverage ──────────────────────────────────────────

  it('should throw BadRequestException when CSV has no header row', async () => {
    // An empty buffer with no content
    const emptyBuffer = Buffer.from('', 'utf-8');
    await expect(service.validate(TENANT_ID, ACTOR_USER_ID, emptyBuffer)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should throw BadRequestException with INVALID_HEADERS when required column is missing', async () => {
    const csvMissingColumn = Buffer.from(
      'date,student_identifier,severity,narrative\n2025-09-15,ENR-001,routine,Test narrative text long enough',
      'utf-8',
    );
    await expect(service.validate(TENANT_ID, ACTOR_USER_ID, csvMissingColumn)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should produce an error for invalid date format', async () => {
    const csv = buildCsvBuffer([buildValidRow({ date: 'not-a-date' })]);
    const result = await service.validate(TENANT_ID, ACTOR_USER_ID, csv);

    expect(result.error_rows).toBe(1);
    expect(result.errors[0]?.field).toBe('date');
    expect(result.errors[0]?.message).toContain('Invalid date format');
  });

  it('should truncate narrative preview to 80 characters with ellipsis', async () => {
    const longNarrative = 'A'.repeat(100);
    const csv = buildCsvBuffer([buildValidRow({ narrative: longNarrative })]);
    const result = await service.validate(TENANT_ID, ACTOR_USER_ID, csv);

    expect(result.valid_rows).toBe(1);
    expect(result.preview[0]?.narrative_preview).toHaveLength(83); // 80 + '...'
    expect(result.preview[0]?.narrative_preview).toMatch(/\.\.\.$/);
  });

  it('should not truncate narrative preview when 80 characters or less', async () => {
    const shortNarrative = 'A short but valid narrative text for testing';
    const csv = buildCsvBuffer([buildValidRow({ narrative: shortNarrative })]);
    const result = await service.validate(TENANT_ID, ACTOR_USER_ID, csv);

    expect(result.valid_rows).toBe(1);
    expect(result.preview[0]?.narrative_preview).toBe(shortNarrative);
  });

  it('should use default categories when tenant settings have no pastoral concern_categories', async () => {
    mockRlsTx.tenantSetting.findUnique.mockResolvedValue({
      id: 'settings-1',
      tenant_id: TENANT_ID,
      settings: {},
      created_at: new Date(),
      updated_at: new Date(),
    });

    const csv = buildCsvBuffer([buildValidRow({ category: 'academic' })]);
    const result = await service.validate(TENANT_ID, ACTOR_USER_ID, csv);

    // Default categories include 'academic', so this should be valid
    expect(result.valid_rows).toBe(1);
  });

  it('should use default categories when tenantSetting record is null', async () => {
    mockRlsTx.tenantSetting.findUnique.mockResolvedValue(null);

    const csv = buildCsvBuffer([buildValidRow({ category: 'emotional' })]);
    const result = await service.validate(TENANT_ID, ACTOR_USER_ID, csv);

    expect(result.valid_rows).toBe(1);
  });

  it('should handle CSV with quoted fields containing commas', async () => {
    const header =
      'date,student_identifier,category,severity,narrative,actions_taken,follow_up_notes';
    const row =
      '2025-09-15,ENR-001,academic,routine,"Student appears withdrawn, not engaging with group work, and isolated",Spoke with student,Monitor';
    const csv = Buffer.from([header, row].join('\n'), 'utf-8');

    const result = await service.validate(TENANT_ID, ACTOR_USER_ID, csv);

    expect(result.valid_rows).toBe(1);
    expect(result.preview[0]?.category).toBe('academic');
  });

  it('should handle CSV with escaped double quotes inside quoted fields', async () => {
    const header =
      'date,student_identifier,category,severity,narrative,actions_taken,follow_up_notes';
    const row =
      '2025-09-15,ENR-001,academic,routine,"Student said ""I feel lonely"" during class",Spoke with student,Monitor';
    const csv = Buffer.from([header, row].join('\n'), 'utf-8');

    const result = await service.validate(TENANT_ID, ACTOR_USER_ID, csv);

    expect(result.valid_rows).toBe(1);
  });

  it('should skip validation-time duplicates during confirm', async () => {
    // First call: duplicate at validation time
    mockRlsTx.pastoralConcern.findFirst.mockResolvedValue({ id: 'existing-concern' });

    const csv = buildCsvBuffer([
      buildValidRow({ narrative: 'Concern that is already imported text' }),
    ]);
    const validation = await service.validate(TENANT_ID, ACTOR_USER_ID, csv);
    expect(validation.skipped_rows).toBe(1);

    // Now confirm — validation-time duplicates should be skipped
    const result = await service.confirm(TENANT_ID, ACTOR_USER_ID, validation.validation_token);
    expect(result.total_imported).toBe(0);
    expect(result.skipped_duplicates).toBe(1);
  });

  it('edge: should handle student resolution failure for name+DOB when no match on DOB', async () => {
    // No match by student_number, no match by name+DOB
    mockRlsTx.student.findFirst.mockResolvedValue(null);

    const csv = buildCsvBuffer([
      buildValidRow({ student_identifier: 'Unknown Person (2010-01-01)' }),
    ]);
    const result = await service.validate(TENANT_ID, ACTOR_USER_ID, csv);

    expect(result.error_rows).toBe(1);
    expect(result.errors[0]?.field).toBe('student_identifier');
    expect(result.errors[0]?.message).toContain('Student not found');
  });

  it('edge: should return null for student identifier that does not match name+DOB regex', async () => {
    // No match by student_number, identifier doesn't match name+DOB regex
    mockRlsTx.student.findFirst.mockResolvedValue(null);

    const csv = buildCsvBuffer([buildValidRow({ student_identifier: 'just-some-text' })]);
    const result = await service.validate(TENANT_ID, ACTOR_USER_ID, csv);

    expect(result.error_rows).toBe(1);
    expect(result.errors[0]?.field).toBe('student_identifier');
  });

  it('should use Tier 2 for a category with auto_tier=2 even with routine severity', async () => {
    mockRlsTx.tenantSetting.findUnique.mockResolvedValue({
      id: 'settings-1',
      tenant_id: TENANT_ID,
      settings: {
        pastoral: {
          concern_categories: [{ key: 'bullying', label: 'Bullying', auto_tier: 2, active: true }],
        },
      },
      created_at: new Date(),
      updated_at: new Date(),
    });

    const csv = buildCsvBuffer([buildValidRow({ category: 'bullying', severity: 'routine' })]);
    const validation = await service.validate(TENANT_ID, ACTOR_USER_ID, csv);
    await service.confirm(TENANT_ID, ACTOR_USER_ID, validation.validation_token);

    expect(mockRlsTx.pastoralConcern.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tier: 2 }),
      }),
    );
  });

  it('should handle confirm with actions_taken and follow_up_notes as empty strings', async () => {
    const csv = buildCsvBuffer([buildValidRow({ actions_taken: '', follow_up_notes: '' })]);
    const validation = await service.validate(TENANT_ID, ACTOR_USER_ID, csv);
    const result = await service.confirm(TENANT_ID, ACTOR_USER_ID, validation.validation_token);

    expect(result.total_imported).toBe(1);
    expect(mockRlsTx.pastoralConcern.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actions_taken: null,
          follow_up_suggestion: null,
        }),
      }),
    );
  });
});
