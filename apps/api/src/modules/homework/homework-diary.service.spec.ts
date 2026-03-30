import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

import { HomeworkDiaryService } from './homework-diary.service';

// ─── Constants ───────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STUDENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const USER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const NOTE_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const PARENT_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

// ─── RLS mock ────────────────────────────────────────────────────────────────

const mockRlsTx = {
  diaryNote: {
    create: jest.fn(),
    update: jest.fn(),
  },
  diaryParentNote: {
    create: jest.fn(),
    update: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx),
      ),
  }),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildMockPrisma() {
  return {
    student: { findFirst: jest.fn() },
    diaryNote: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    diaryParentNote: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    parent: { findFirst: jest.fn() },
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('HomeworkDiaryService — listNotes', () => {
  let service: HomeworkDiaryService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    Object.values(mockRlsTx).forEach((model) =>
      Object.values(model).forEach((fn) => (fn as jest.Mock).mockReset()),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HomeworkDiaryService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<HomeworkDiaryService>(HomeworkDiaryService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return paginated diary notes for a student', async () => {
    mockPrisma.student.findFirst.mockResolvedValue({ id: STUDENT_ID });
    const notes = [
      { id: NOTE_ID, student_id: STUDENT_ID, note_date: new Date('2026-04-01'), content: 'Note 1' },
    ];
    mockPrisma.diaryNote.findMany.mockResolvedValue(notes);
    mockPrisma.diaryNote.count.mockResolvedValue(1);

    const result = await service.listNotes(TENANT_ID, STUDENT_ID, {
      page: 1,
      pageSize: 20,
    });

    expect(result.data).toEqual(notes);
    expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
    expect(mockPrisma.diaryNote.findMany).toHaveBeenCalledWith({
      where: { tenant_id: TENANT_ID, student_id: STUDENT_ID },
      skip: 0,
      take: 20,
      orderBy: { note_date: 'desc' },
    });
  });

  it('should calculate skip correctly for page 2', async () => {
    mockPrisma.student.findFirst.mockResolvedValue({ id: STUDENT_ID });
    mockPrisma.diaryNote.findMany.mockResolvedValue([]);
    mockPrisma.diaryNote.count.mockResolvedValue(0);

    await service.listNotes(TENANT_ID, STUDENT_ID, {
      page: 2,
      pageSize: 10,
    });

    expect(mockPrisma.diaryNote.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 }),
    );
  });

  it('should throw NotFoundException when student not found', async () => {
    mockPrisma.student.findFirst.mockResolvedValue(null);

    await expect(
      service.listNotes(TENANT_ID, STUDENT_ID, { page: 1, pageSize: 20 }),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('HomeworkDiaryService — createNote', () => {
  let service: HomeworkDiaryService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    Object.values(mockRlsTx).forEach((model) =>
      Object.values(model).forEach((fn) => (fn as jest.Mock).mockReset()),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HomeworkDiaryService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<HomeworkDiaryService>(HomeworkDiaryService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should create a diary note via RLS transaction', async () => {
    mockPrisma.student.findFirst.mockResolvedValue({ id: STUDENT_ID });
    const created = {
      id: NOTE_ID,
      tenant_id: TENANT_ID,
      student_id: STUDENT_ID,
      note_date: new Date('2026-04-01'),
      content: 'Great day',
    };
    mockRlsTx.diaryNote.create.mockResolvedValue(created);

    const result = await service.createNote(TENANT_ID, STUDENT_ID, {
      note_date: '2026-04-01',
      content: 'Great day',
    });

    expect(result).toEqual(created);
    expect(mockRlsTx.diaryNote.create).toHaveBeenCalledWith({
      data: {
        tenant_id: TENANT_ID,
        student_id: STUDENT_ID,
        note_date: new Date('2026-04-01'),
        content: 'Great day',
      },
    });
  });

  it('should throw BadRequestException on duplicate date (P2002)', async () => {
    mockPrisma.student.findFirst.mockResolvedValue({ id: STUDENT_ID });
    const p2002Error = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      { code: 'P2002', clientVersion: '5.0.0' },
    );
    mockRlsTx.diaryNote.create.mockRejectedValue(p2002Error);

    await expect(
      service.createNote(TENANT_ID, STUDENT_ID, {
        note_date: '2026-04-01',
        content: 'Duplicate',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should re-throw non-P2002 Prisma errors', async () => {
    mockPrisma.student.findFirst.mockResolvedValue({ id: STUDENT_ID });
    const genericError = new Error('Database connection lost');
    mockRlsTx.diaryNote.create.mockRejectedValue(genericError);

    await expect(
      service.createNote(TENANT_ID, STUDENT_ID, {
        note_date: '2026-04-01',
        content: 'Content',
      }),
    ).rejects.toThrow('Database connection lost');
  });

  it('should throw NotFoundException when student not found', async () => {
    mockPrisma.student.findFirst.mockResolvedValue(null);

    await expect(
      service.createNote(TENANT_ID, STUDENT_ID, {
        note_date: '2026-04-01',
        content: 'Note',
      }),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('HomeworkDiaryService — updateNote', () => {
  let service: HomeworkDiaryService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    Object.values(mockRlsTx).forEach((model) =>
      Object.values(model).forEach((fn) => (fn as jest.Mock).mockReset()),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HomeworkDiaryService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<HomeworkDiaryService>(HomeworkDiaryService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should update existing note content via RLS transaction', async () => {
    mockPrisma.diaryNote.findFirst.mockResolvedValue({ id: NOTE_ID });
    const updated = {
      id: NOTE_ID,
      content: 'Updated content',
    };
    mockRlsTx.diaryNote.update.mockResolvedValue(updated);

    const result = await service.updateNote(
      TENANT_ID,
      STUDENT_ID,
      '2026-04-01',
      'Updated content',
    );

    expect(result).toEqual(updated);
    expect(mockRlsTx.diaryNote.update).toHaveBeenCalledWith({
      where: { id: NOTE_ID },
      data: { content: 'Updated content' },
    });
  });

  it('should throw NotFoundException when note not found', async () => {
    mockPrisma.diaryNote.findFirst.mockResolvedValue(null);

    await expect(
      service.updateNote(TENANT_ID, STUDENT_ID, '2026-04-01', 'Content'),
    ).rejects.toThrow(NotFoundException);
  });

  it('should query by student_id, tenant_id, and note_date', async () => {
    mockPrisma.diaryNote.findFirst.mockResolvedValue({ id: NOTE_ID });
    mockRlsTx.diaryNote.update.mockResolvedValue({ id: NOTE_ID });

    await service.updateNote(
      TENANT_ID,
      STUDENT_ID,
      '2026-04-01',
      'Content',
    );

    expect(mockPrisma.diaryNote.findFirst).toHaveBeenCalledWith({
      where: {
        tenant_id: TENANT_ID,
        student_id: STUDENT_ID,
        note_date: new Date('2026-04-01'),
      },
      select: { id: true },
    });
  });
});

describe('HomeworkDiaryService — listParentNotes', () => {
  let service: HomeworkDiaryService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    Object.values(mockRlsTx).forEach((model) =>
      Object.values(model).forEach((fn) => (fn as jest.Mock).mockReset()),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HomeworkDiaryService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<HomeworkDiaryService>(HomeworkDiaryService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return paginated parent notes with includes', async () => {
    mockPrisma.student.findFirst.mockResolvedValue({ id: STUDENT_ID });
    const notes = [
      {
        id: NOTE_ID,
        content: 'Parent note',
        parent: { id: PARENT_ID, first_name: 'Jane', last_name: 'Doe' },
        author: { id: USER_ID, first_name: 'Teacher', last_name: 'Smith' },
      },
    ];
    mockPrisma.diaryParentNote.findMany.mockResolvedValue(notes);
    mockPrisma.diaryParentNote.count.mockResolvedValue(1);

    const result = await service.listParentNotes(TENANT_ID, STUDENT_ID, {
      page: 1,
      pageSize: 20,
    });

    expect(result.data).toEqual(notes);
    expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
    expect(mockPrisma.diaryParentNote.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          parent: { select: { id: true, first_name: true, last_name: true } },
          author: { select: { id: true, first_name: true, last_name: true } },
        },
      }),
    );
  });

  it('should throw NotFoundException when student not found', async () => {
    mockPrisma.student.findFirst.mockResolvedValue(null);

    await expect(
      service.listParentNotes(TENANT_ID, STUDENT_ID, {
        page: 1,
        pageSize: 20,
      }),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('HomeworkDiaryService — createParentNote', () => {
  let service: HomeworkDiaryService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    Object.values(mockRlsTx).forEach((model) =>
      Object.values(model).forEach((fn) => (fn as jest.Mock).mockReset()),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HomeworkDiaryService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<HomeworkDiaryService>(HomeworkDiaryService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should create parent note with resolved parent_id', async () => {
    mockPrisma.student.findFirst.mockResolvedValue({ id: STUDENT_ID });
    mockPrisma.parent.findFirst.mockResolvedValue({ id: PARENT_ID });
    const created = {
      id: NOTE_ID,
      content: 'Parent feedback',
      parent: { id: PARENT_ID, first_name: 'Jane', last_name: 'Doe' },
      author: { id: USER_ID, first_name: 'Jane', last_name: 'Doe' },
    };
    mockRlsTx.diaryParentNote.create.mockResolvedValue(created);

    const dto = {
      student_id: STUDENT_ID,
      note_date: '2026-04-01',
      content: 'Parent feedback',
    };
    const result = await service.createParentNote(
      TENANT_ID,
      STUDENT_ID,
      USER_ID,
      dto,
    );

    expect(result).toEqual(created);
    expect(mockRlsTx.diaryParentNote.create).toHaveBeenCalledWith({
      data: {
        tenant_id: TENANT_ID,
        student_id: STUDENT_ID,
        parent_id: PARENT_ID,
        author_user_id: USER_ID,
        note_date: new Date('2026-04-01'),
        content: 'Parent feedback',
      },
      include: {
        parent: { select: { id: true, first_name: true, last_name: true } },
        author: { select: { id: true, first_name: true, last_name: true } },
      },
    });
  });

  it('should set parent_id to null when user has no parent record', async () => {
    mockPrisma.student.findFirst.mockResolvedValue({ id: STUDENT_ID });
    mockPrisma.parent.findFirst.mockResolvedValue(null);
    mockRlsTx.diaryParentNote.create.mockResolvedValue({
      id: NOTE_ID,
      parent_id: null,
    });

    await service.createParentNote(TENANT_ID, STUDENT_ID, USER_ID, {
      student_id: STUDENT_ID,
      note_date: '2026-04-01',
      content: 'Teacher note',
    });

    const createCall = mockRlsTx.diaryParentNote.create.mock.calls[0][0];
    expect(createCall.data.parent_id).toBeNull();
  });

  it('should throw NotFoundException when student not found', async () => {
    mockPrisma.student.findFirst.mockResolvedValue(null);

    await expect(
      service.createParentNote(TENANT_ID, STUDENT_ID, USER_ID, {
        student_id: STUDENT_ID,
        note_date: '2026-04-01',
        content: 'Note',
      }),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('HomeworkDiaryService — acknowledgeNote', () => {
  let service: HomeworkDiaryService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    Object.values(mockRlsTx).forEach((model) =>
      Object.values(model).forEach((fn) => (fn as jest.Mock).mockReset()),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HomeworkDiaryService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<HomeworkDiaryService>(HomeworkDiaryService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should set acknowledged to true and record timestamp', async () => {
    mockPrisma.diaryParentNote.findFirst.mockResolvedValue({
      id: NOTE_ID,
      acknowledged: false,
    });
    const updated = {
      id: NOTE_ID,
      acknowledged: true,
      acknowledged_at: new Date(),
    };
    mockRlsTx.diaryParentNote.update.mockResolvedValue(updated);

    const result = await service.acknowledgeNote(TENANT_ID, NOTE_ID, USER_ID);

    expect(result).toEqual(updated);
    expect(mockRlsTx.diaryParentNote.update).toHaveBeenCalledWith({
      where: { id: NOTE_ID },
      data: {
        acknowledged: true,
        acknowledged_at: expect.any(Date),
      },
    });
  });

  it('should throw NotFoundException when note not found', async () => {
    mockPrisma.diaryParentNote.findFirst.mockResolvedValue(null);

    await expect(
      service.acknowledgeNote(TENANT_ID, NOTE_ID, USER_ID),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw BadRequestException when note already acknowledged', async () => {
    mockPrisma.diaryParentNote.findFirst.mockResolvedValue({
      id: NOTE_ID,
      acknowledged: true,
    });

    await expect(
      service.acknowledgeNote(TENANT_ID, NOTE_ID, USER_ID),
    ).rejects.toThrow(BadRequestException);
  });

  it('should query note by id and tenant_id', async () => {
    mockPrisma.diaryParentNote.findFirst.mockResolvedValue({
      id: NOTE_ID,
      acknowledged: false,
    });
    mockRlsTx.diaryParentNote.update.mockResolvedValue({
      id: NOTE_ID,
      acknowledged: true,
    });

    await service.acknowledgeNote(TENANT_ID, NOTE_ID, USER_ID);

    expect(mockPrisma.diaryParentNote.findFirst).toHaveBeenCalledWith({
      where: { id: NOTE_ID, tenant_id: TENANT_ID },
      select: { id: true, acknowledged: true },
    });
  });
});
