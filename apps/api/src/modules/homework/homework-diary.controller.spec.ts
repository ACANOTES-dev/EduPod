import { Test, TestingModule } from '@nestjs/testing';
import type { JwtPayload } from '@school/shared';

import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

import { HomeworkDiaryController } from './homework-diary.controller';
import { HomeworkDiaryService } from './homework-diary.service';

// ─── Constants ───────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STUDENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const USER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const NOTE_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

const tenantCtx = { tenant_id: TENANT_ID };
const userCtx: JwtPayload = {
  sub: USER_ID,
  email: 'teacher@school.test',
  tenant_id: TENANT_ID,
  membership_id: 'mem-1',
  type: 'access',
  iat: 0,
  exp: 0,
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('HomeworkDiaryController', () => {
  let controller: HomeworkDiaryController;
  let mockService: {
    listNotes: jest.Mock;
    createNote: jest.Mock;
    updateNote: jest.Mock;
    listParentNotes: jest.Mock;
    createParentNote: jest.Mock;
    acknowledgeNote: jest.Mock;
  };

  beforeEach(async () => {
    mockService = {
      listNotes: jest.fn(),
      createNote: jest.fn(),
      updateNote: jest.fn(),
      listParentNotes: jest.fn(),
      createParentNote: jest.fn(),
      acknowledgeNote: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HomeworkDiaryController],
      providers: [
        { provide: HomeworkDiaryService, useValue: mockService },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<HomeworkDiaryController>(HomeworkDiaryController);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── listNotes ───────────────────────────────────────────────────────────

  describe('listNotes', () => {
    it('should delegate to service with tenantId, studentId, and query', async () => {
      const query = { page: 1, pageSize: 20 };
      const expected = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
      mockService.listNotes.mockResolvedValue(expected);

      const result = await controller.listNotes(tenantCtx, STUDENT_ID, query);

      expect(mockService.listNotes).toHaveBeenCalledWith(
        TENANT_ID,
        STUDENT_ID,
        query,
      );
      expect(result).toEqual(expected);
    });
  });

  // ─── createNote ──────────────────────────────────────────────────────────

  describe('createNote', () => {
    it('should delegate to service with tenantId, studentId, and dto', async () => {
      const dto = { note_date: '2026-04-01', content: 'Great day' };
      const expected = { id: NOTE_ID, ...dto };
      mockService.createNote.mockResolvedValue(expected);

      const result = await controller.createNote(tenantCtx, STUDENT_ID, dto);

      expect(mockService.createNote).toHaveBeenCalledWith(
        TENANT_ID,
        STUDENT_ID,
        dto,
      );
      expect(result).toEqual(expected);
    });
  });

  // ─── updateNote ──────────────────────────────────────────────────────────

  describe('updateNote', () => {
    it('should delegate to service with tenantId, studentId, noteDate, and content', async () => {
      const noteDate = '2026-04-01';
      const dto = { content: 'Updated content' };
      const expected = { id: NOTE_ID, content: 'Updated content' };
      mockService.updateNote.mockResolvedValue(expected);

      const result = await controller.updateNote(
        tenantCtx,
        STUDENT_ID,
        noteDate,
        dto,
      );

      expect(mockService.updateNote).toHaveBeenCalledWith(
        TENANT_ID,
        STUDENT_ID,
        noteDate,
        'Updated content',
      );
      expect(result).toEqual(expected);
    });
  });

  // ─── listParentNotes ─────────────────────────────────────────────────────

  describe('listParentNotes', () => {
    it('should delegate to service with tenantId, studentId, and query', async () => {
      const query = { page: 2, pageSize: 10 };
      const expected = { data: [], meta: { page: 2, pageSize: 10, total: 0 } };
      mockService.listParentNotes.mockResolvedValue(expected);

      const result = await controller.listParentNotes(
        tenantCtx,
        STUDENT_ID,
        query,
      );

      expect(mockService.listParentNotes).toHaveBeenCalledWith(
        TENANT_ID,
        STUDENT_ID,
        query,
      );
      expect(result).toEqual(expected);
    });
  });

  // ─── createParentNote ────────────────────────────────────────────────────

  describe('createParentNote', () => {
    it('should delegate to service with tenantId, studentId, userId, and dto', async () => {
      const dto = {
        student_id: STUDENT_ID,
        note_date: '2026-04-01',
        content: 'Parent note',
      };
      const expected = { id: NOTE_ID, content: 'Parent note' };
      mockService.createParentNote.mockResolvedValue(expected);

      const result = await controller.createParentNote(
        tenantCtx,
        userCtx,
        STUDENT_ID,
        dto,
      );

      expect(mockService.createParentNote).toHaveBeenCalledWith(
        TENANT_ID,
        STUDENT_ID,
        USER_ID,
        dto,
      );
      expect(result).toEqual(expected);
    });
  });

  // ─── acknowledgeNote ─────────────────────────────────────────────────────

  describe('acknowledgeNote', () => {
    it('should delegate to service with tenantId, noteId, and userId', async () => {
      const expected = {
        id: NOTE_ID,
        acknowledged: true,
        acknowledged_at: new Date(),
      };
      mockService.acknowledgeNote.mockResolvedValue(expected);

      const result = await controller.acknowledgeNote(
        tenantCtx,
        userCtx,
        NOTE_ID,
      );

      expect(mockService.acknowledgeNote).toHaveBeenCalledWith(
        TENANT_ID,
        NOTE_ID,
        USER_ID,
      );
      expect(result).toEqual(expected);
    });
  });
});
