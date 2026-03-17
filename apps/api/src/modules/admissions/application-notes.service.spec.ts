import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { ApplicationNotesService } from './application-notes.service';

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn((prisma: unknown) => ({
    $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
  })),
}));

describe('ApplicationNotesService', () => {
  let service: ApplicationNotesService;
  let mockPrisma: Record<string, Record<string, jest.Mock>>;

  const TENANT_ID = '11111111-1111-1111-1111-111111111111';
  const APP_ID = 'app-1';
  const USER_ID = 'user-1';

  beforeEach(async () => {
    mockPrisma = {
      application: {
        findFirst: jest.fn(),
      },
      applicationNote: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApplicationNotesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ApplicationNotesService>(ApplicationNotesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create note linked to application', async () => {
      mockPrisma.application.findFirst.mockResolvedValue({ id: APP_ID });
      const createdNote = {
        id: 'note-1',
        note: 'This is a test note',
        is_internal: true,
        author: { id: USER_ID, first_name: 'Test', last_name: 'User', email: 'test@test.com' },
      };
      mockPrisma.applicationNote.create.mockResolvedValue(createdNote);

      const result = await service.create(TENANT_ID, APP_ID, USER_ID, {
        note: 'This is a test note',
        is_internal: true,
      });

      expect(result).toBeDefined();
      expect(result.note).toBe('This is a test note');
      expect(mockPrisma.applicationNote.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenant_id: TENANT_ID,
            application_id: APP_ID,
            author_user_id: USER_ID,
            note: 'This is a test note',
            is_internal: true,
          }),
        }),
      );
    });

    it('should throw when application not found', async () => {
      mockPrisma.application.findFirst.mockResolvedValue(null);

      await expect(
        service.create(TENANT_ID, 'nonexistent', USER_ID, {
          note: 'test',
          is_internal: true,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByApplication', () => {
    it('should filter internal notes for parent view', async () => {
      mockPrisma.application.findFirst.mockResolvedValue({ id: APP_ID });
      const notes = [
        { id: 'n1', note: 'Public note', is_internal: false },
      ];
      mockPrisma.applicationNote.findMany.mockResolvedValue(notes);

      const result = await service.findByApplication(TENANT_ID, APP_ID, false);

      expect(result).toHaveLength(1);
      expect(mockPrisma.applicationNote.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            is_internal: false,
          }),
        }),
      );
    });

    it('should include all notes for staff view', async () => {
      mockPrisma.application.findFirst.mockResolvedValue({ id: APP_ID });
      const notes = [
        { id: 'n1', note: 'Public note', is_internal: false },
        { id: 'n2', note: 'Internal note', is_internal: true },
      ];
      mockPrisma.applicationNote.findMany.mockResolvedValue(notes);

      const result = await service.findByApplication(TENANT_ID, APP_ID, true);

      expect(result).toHaveLength(2);
      // Should NOT have is_internal filter
      const whereArg = mockPrisma.applicationNote.findMany.mock.calls[0][0].where;
      expect(whereArg.is_internal).toBeUndefined();
    });

    it('should throw when application not found', async () => {
      mockPrisma.application.findFirst.mockResolvedValue(null);

      await expect(
        service.findByApplication(TENANT_ID, 'nonexistent', true),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
