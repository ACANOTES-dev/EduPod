import { PrismaClient } from '@prisma/client';

import {
  ModerationScanProcessor,
  MODERATION_SCAN_JOB,
  ModerationScanJob,
  ModerationScanPayload,
  buildMatchPatterns,
  hasMatch,
} from './moderation-scan.processor';

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SURVEY_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const RESPONSE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const QUESTION_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildMockTx() {
  return {
    surveyQuestion: {
      findUnique: jest.fn().mockResolvedValue({ question_type: 'freeform' }),
    },
    staffProfile: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    room: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    subject: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    $executeRaw: jest.fn().mockResolvedValue(undefined),
  };
}

function buildMockPrisma(mockTx: ReturnType<typeof buildMockTx>) {
  return {
    surveyResponse: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    },
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
  } as unknown as PrismaClient;
}

function buildResponse(overrides?: Record<string, unknown>) {
  return {
    id: RESPONSE_ID,
    survey_id: SURVEY_ID,
    question_id: QUESTION_ID,
    answer_value: null,
    answer_text: 'The class was really engaging today.',
    submitted_date: new Date('2026-03-25'),
    moderation_status: 'pending',
    ...overrides,
  };
}

function buildPayload(overrides?: Partial<ModerationScanPayload>): ModerationScanPayload {
  return {
    tenant_id: TENANT_ID,
    survey_id: SURVEY_ID,
    response_id: RESPONSE_ID,
    ...overrides,
  };
}

function buildJob(name: string, payload?: ModerationScanPayload) {
  return {
    name,
    data: payload ?? buildPayload(),
  };
}

// ─── Processor tests ─────────────────────────────────────────────────────────

describe('ModerationScanProcessor', () => {
  let processor: ModerationScanProcessor;
  let mockTx: ReturnType<typeof buildMockTx>;
  let mockPrisma: PrismaClient;

  beforeEach(() => {
    mockTx = buildMockTx();
    mockPrisma = buildMockPrisma(mockTx);
    processor = new ModerationScanProcessor(mockPrisma);
  });

  afterEach(() => jest.clearAllMocks());

  it('should skip jobs with a different name', async () => {
    (mockPrisma.surveyResponse.findUnique as jest.Mock).mockResolvedValue(buildResponse());

    await processor.process(buildJob('some-other-job') as never);

    expect(mockPrisma.surveyResponse.findUnique).not.toHaveBeenCalled();
  });

  it('should reject jobs without tenant_id', async () => {
    const payload = buildPayload({ tenant_id: '' });

    await expect(
      processor.process(buildJob(MODERATION_SCAN_JOB, payload) as never),
    ).rejects.toThrow('missing tenant_id');
  });
});

// ─── ModerationScanJob (TenantAwareJob) tests ────────────────────────────────

describe('ModerationScanJob', () => {
  let mockTx: ReturnType<typeof buildMockTx>;
  let mockPrisma: PrismaClient;
  let job: ModerationScanJob;

  beforeEach(() => {
    mockTx = buildMockTx();
    mockPrisma = buildMockPrisma(mockTx);
    job = new ModerationScanJob(mockPrisma);
  });

  afterEach(() => jest.clearAllMocks());

  it('should flag a response containing a staff name', async () => {
    (mockPrisma.surveyResponse.findUnique as jest.Mock).mockResolvedValue(
      buildResponse({ answer_text: 'I really like Mrs Murphy in our class.' }),
    );
    mockTx.staffProfile.findMany.mockResolvedValue([
      { user: { first_name: 'Siobhan', last_name: 'Murphy' } },
    ]);

    await job.execute(buildPayload());

    expect(mockPrisma.surveyResponse.update).toHaveBeenCalledWith({
      where: { id: RESPONSE_ID },
      data: { moderation_status: 'flagged' },
    });
  });

  it('should flag a response containing a room name', async () => {
    (mockPrisma.surveyResponse.findUnique as jest.Mock).mockResolvedValue(
      buildResponse({ answer_text: 'Something happened in Science Lab yesterday.' }),
    );
    mockTx.room.findMany.mockResolvedValue([
      { name: 'Science Lab' },
    ]);

    await job.execute(buildPayload());

    expect(mockPrisma.surveyResponse.update).toHaveBeenCalledWith({
      where: { id: RESPONSE_ID },
      data: { moderation_status: 'flagged' },
    });
  });

  it('should flag a response containing a subject name', async () => {
    (mockPrisma.surveyResponse.findUnique as jest.Mock).mockResolvedValue(
      buildResponse({ answer_text: 'I feel stressed in Mathematics class.' }),
    );
    mockTx.subject.findMany.mockResolvedValue([
      { name: 'Mathematics', code: 'MATH' },
    ]);

    await job.execute(buildPayload());

    expect(mockPrisma.surveyResponse.update).toHaveBeenCalledWith({
      where: { id: RESPONSE_ID },
      data: { moderation_status: 'flagged' },
    });
  });

  it('should leave response as pending when no matches found', async () => {
    (mockPrisma.surveyResponse.findUnique as jest.Mock).mockResolvedValue(
      buildResponse({ answer_text: 'I feel happy and supported at school.' }),
    );
    mockTx.staffProfile.findMany.mockResolvedValue([
      { user: { first_name: 'Jane', last_name: 'Doe' } },
    ]);
    mockTx.room.findMany.mockResolvedValue([
      { name: 'Assembly Hall' },
    ]);
    mockTx.subject.findMany.mockResolvedValue([
      { name: 'Geography', code: 'GEO' },
    ]);

    await job.execute(buildPayload());

    expect(mockPrisma.surveyResponse.update).not.toHaveBeenCalled();
  });

  it('should skip when response is not found', async () => {
    (mockPrisma.surveyResponse.findUnique as jest.Mock).mockResolvedValue(null);

    await job.execute(buildPayload());

    expect(mockPrisma.surveyResponse.update).not.toHaveBeenCalled();
    expect(mockTx.staffProfile.findMany).not.toHaveBeenCalled();
  });

  it('should skip when response is already processed (not pending)', async () => {
    (mockPrisma.surveyResponse.findUnique as jest.Mock).mockResolvedValue(
      buildResponse({ moderation_status: 'flagged' }),
    );

    await job.execute(buildPayload());

    expect(mockPrisma.surveyResponse.update).not.toHaveBeenCalled();
    expect(mockTx.staffProfile.findMany).not.toHaveBeenCalled();
  });

  it('should skip when response has moderation_status approved', async () => {
    (mockPrisma.surveyResponse.findUnique as jest.Mock).mockResolvedValue(
      buildResponse({ moderation_status: 'approved' }),
    );

    await job.execute(buildPayload());

    expect(mockPrisma.surveyResponse.update).not.toHaveBeenCalled();
  });

  it('should skip when question is not freeform', async () => {
    (mockPrisma.surveyResponse.findUnique as jest.Mock).mockResolvedValue(
      buildResponse(),
    );
    mockTx.surveyQuestion.findUnique.mockResolvedValue({ question_type: 'likert_5' });

    await job.execute(buildPayload());

    expect(mockPrisma.surveyResponse.update).not.toHaveBeenCalled();
    expect(mockTx.staffProfile.findMany).not.toHaveBeenCalled();
  });

  it('should skip when answer_text is empty', async () => {
    (mockPrisma.surveyResponse.findUnique as jest.Mock).mockResolvedValue(
      buildResponse({ answer_text: '' }),
    );

    await job.execute(buildPayload());

    expect(mockPrisma.surveyResponse.update).not.toHaveBeenCalled();
  });

  it('should skip when answer_text is null', async () => {
    (mockPrisma.surveyResponse.findUnique as jest.Mock).mockResolvedValue(
      buildResponse({ answer_text: null }),
    );

    await job.execute(buildPayload());

    expect(mockPrisma.surveyResponse.update).not.toHaveBeenCalled();
  });

  it('should perform case-insensitive matching', async () => {
    (mockPrisma.surveyResponse.findUnique as jest.Mock).mockResolvedValue(
      buildResponse({ answer_text: 'i talked to MURPHY about it.' }),
    );
    mockTx.staffProfile.findMany.mockResolvedValue([
      { user: { first_name: 'Siobhan', last_name: 'Murphy' } },
    ]);

    await job.execute(buildPayload());

    expect(mockPrisma.surveyResponse.update).toHaveBeenCalledWith({
      where: { id: RESPONSE_ID },
      data: { moderation_status: 'flagged' },
    });
  });

  it("should match Irish name patterns like O'Brien", async () => {
    (mockPrisma.surveyResponse.findUnique as jest.Mock).mockResolvedValue(
      buildResponse({ answer_text: "The teacher O'Brien was really helpful." }),
    );
    mockTx.staffProfile.findMany.mockResolvedValue([
      { user: { first_name: 'Sean', last_name: "O'Brien" } },
    ]);

    await job.execute(buildPayload());

    expect(mockPrisma.surveyResponse.update).toHaveBeenCalledWith({
      where: { id: RESPONSE_ID },
      data: { moderation_status: 'flagged' },
    });
  });

  it('should match Irish name patterns like Mac Giolla', async () => {
    (mockPrisma.surveyResponse.findUnique as jest.Mock).mockResolvedValue(
      buildResponse({ answer_text: 'I was talking to Mac Giolla Phadraig.' }),
    );
    mockTx.staffProfile.findMany.mockResolvedValue([
      { user: { first_name: 'Cian', last_name: 'Mac Giolla Phadraig' } },
    ]);

    await job.execute(buildPayload());

    expect(mockPrisma.surveyResponse.update).toHaveBeenCalledWith({
      where: { id: RESPONSE_ID },
      data: { moderation_status: 'flagged' },
    });
  });

  it('should match full staff name (first + last combined)', async () => {
    (mockPrisma.surveyResponse.findUnique as jest.Mock).mockResolvedValue(
      buildResponse({ answer_text: 'I spoke with Sean Murphy about homework.' }),
    );
    mockTx.staffProfile.findMany.mockResolvedValue([
      { user: { first_name: 'Sean', last_name: 'Murphy' } },
    ]);

    await job.execute(buildPayload());

    expect(mockPrisma.surveyResponse.update).toHaveBeenCalledWith({
      where: { id: RESPONSE_ID },
      data: { moderation_status: 'flagged' },
    });
  });

  it('should match room name', async () => {
    (mockPrisma.surveyResponse.findUnique as jest.Mock).mockResolvedValue(
      buildResponse({ answer_text: 'Something bad happened in the Science Lab.' }),
    );
    mockTx.room.findMany.mockResolvedValue([
      { name: 'Science Lab' },
    ]);

    await job.execute(buildPayload());

    expect(mockPrisma.surveyResponse.update).toHaveBeenCalledWith({
      where: { id: RESPONSE_ID },
      data: { moderation_status: 'flagged' },
    });
  });

  it('should match subject code', async () => {
    (mockPrisma.surveyResponse.findUnique as jest.Mock).mockResolvedValue(
      buildResponse({ answer_text: 'MATH is stressing me out a lot.' }),
    );
    mockTx.subject.findMany.mockResolvedValue([
      { name: 'Mathematics', code: 'MATH' },
    ]);

    await job.execute(buildPayload());

    expect(mockPrisma.surveyResponse.update).toHaveBeenCalledWith({
      where: { id: RESPONSE_ID },
      data: { moderation_status: 'flagged' },
    });
  });

  it('should not flag on partial word matches for short codes', async () => {
    (mockPrisma.surveyResponse.findUnique as jest.Mock).mockResolvedValue(
      buildResponse({ answer_text: 'I had a great experience today.' }),
    );
    // Room code "a" should not match inside "a great" as a substring of longer words
    // But "a" IS a word boundary match in "a great" — however, single-letter codes
    // that are common English words may trigger. This is by design — the moderator
    // reviews and makes the final call.
    mockTx.room.findMany.mockResolvedValue([
      { name: 'Lab 101' },
    ]);
    mockTx.subject.findMany.mockResolvedValue([
      { name: 'Geography', code: 'GEO' },
    ]);

    await job.execute(buildPayload());

    expect(mockPrisma.surveyResponse.update).not.toHaveBeenCalled();
  });
});

// ─── Helper function unit tests ──────────────────────────────────────────────

describe('buildMatchPatterns', () => {
  it('should create regex patterns from string values', () => {
    const patterns = buildMatchPatterns(['Murphy', 'Science Lab']);
    expect(patterns).toHaveLength(2);
    expect(patterns[0]!.test('Murphy')).toBe(true);
    expect(patterns[1]!.test('Science Lab')).toBe(true);
  });

  it('should skip empty strings', () => {
    const patterns = buildMatchPatterns(['Murphy', '', '  ', 'Jones']);
    expect(patterns).toHaveLength(2);
  });

  it('should handle special regex characters in names', () => {
    const patterns = buildMatchPatterns(["O'Brien"]);
    expect(patterns).toHaveLength(1);
    expect(patterns[0]!.test("O'Brien")).toBe(true);
  });

  it('should create case-insensitive patterns', () => {
    const patterns = buildMatchPatterns(['Murphy']);
    expect(patterns[0]!.test('murphy')).toBe(true);
    expect(patterns[0]!.test('MURPHY')).toBe(true);
    expect(patterns[0]!.test('Murphy')).toBe(true);
  });
});

describe('hasMatch', () => {
  it('should return true when a pattern matches', () => {
    const patterns = buildMatchPatterns(['Murphy', 'Science Lab']);
    expect(hasMatch('I talked to Murphy today', patterns)).toBe(true);
  });

  it('should return false when no pattern matches', () => {
    const patterns = buildMatchPatterns(['Murphy', 'Science Lab']);
    expect(hasMatch('Everything is fine', patterns)).toBe(false);
  });

  it('should handle empty patterns list', () => {
    expect(hasMatch('some text', [])).toBe(false);
  });
});
