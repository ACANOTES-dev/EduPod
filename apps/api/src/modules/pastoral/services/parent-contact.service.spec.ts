import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../prisma/prisma.service';

import { ParentContactService } from './parent-contact.service';
import { PastoralEventService } from './pastoral-event.service';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const STUDENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const PARENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const CONCERN_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const CASE_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const CONTACT_ID = '11111111-1111-1111-1111-111111111111';

// ─── RLS mock ───────────────────────────────────────────────────────────────

const mockRlsTx = {
  pastoralParentContact: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
  },
};

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(mockRlsTx),
      ),
  }),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

const makeContact = (overrides: Record<string, unknown> = {}) => ({
  id: CONTACT_ID,
  tenant_id: TENANT_ID,
  student_id: STUDENT_ID,
  concern_id: null as string | null,
  case_id: null as string | null,
  parent_id: PARENT_ID,
  contacted_by_user_id: USER_ID,
  contact_method: 'phone',
  contact_date: new Date('2026-03-25T14:00:00Z'),
  outcome: 'Discussed student progress with parent.',
  parent_response: null as string | null,
  created_at: new Date('2026-03-25T14:05:00Z'),
  student: { first_name: 'Ali', last_name: 'Student' },
  parent: { first_name: 'Fatima', last_name: 'Parent' },
  contacted_by: { first_name: 'Jane', last_name: 'Teacher' },
  ...overrides,
});

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('ParentContactService', () => {
  let service: ParentContactService;
  let mockPastoralEventService: { write: jest.Mock };

  beforeEach(async () => {
    mockPastoralEventService = {
      write: jest.fn().mockResolvedValue(undefined),
    };

    // Reset all RLS tx mocks
    for (const model of Object.values(mockRlsTx)) {
      for (const fn of Object.values(model)) {
        fn.mockReset();
      }
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ParentContactService,
        { provide: PrismaService, useValue: {} },
        { provide: PastoralEventService, useValue: mockPastoralEventService },
      ],
    }).compile();

    service = module.get<ParentContactService>(ParentContactService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── logContact ─────────────────────────────────────────────────────────

  describe('logContact', () => {
    const baseDto = {
      student_id: STUDENT_ID,
      parent_id: PARENT_ID,
      contact_method: 'phone' as const,
      contact_date: '2026-03-25T14:00:00Z',
      outcome: 'Discussed student progress with parent.',
    };

    it('creates a contact record and emits parent_contacted audit event', async () => {
      const contact = makeContact();
      mockRlsTx.pastoralParentContact.create.mockResolvedValue(contact);

      const result = await service.logContact(TENANT_ID, USER_ID, baseDto);

      // Verify record created
      expect(mockRlsTx.pastoralParentContact.create).toHaveBeenCalledTimes(1);
      expect(mockRlsTx.pastoralParentContact.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          student_id: STUDENT_ID,
          parent_id: PARENT_ID,
          contacted_by_user_id: USER_ID,
          contact_method: 'phone',
          outcome: baseDto.outcome,
        }),
      });

      // Verify audit event
      expect(mockPastoralEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: TENANT_ID,
          event_type: 'parent_contacted',
          entity_type: 'parent_contact',
          entity_id: CONTACT_ID,
          student_id: STUDENT_ID,
          actor_user_id: USER_ID,
          payload: expect.objectContaining({
            parent_contact_id: CONTACT_ID,
            student_id: STUDENT_ID,
            parent_id: PARENT_ID,
            method: 'phone',
          }),
        }),
      );

      // Verify response shape
      expect(result.data.id).toBe(CONTACT_ID);
      expect(result.data.created_at).toBeDefined();
    });

    it('stores optional concern_id and case_id when provided', async () => {
      const dtoWithLinks = {
        ...baseDto,
        concern_id: CONCERN_ID,
        case_id: CASE_ID,
      };

      const contact = makeContact({
        concern_id: CONCERN_ID,
        case_id: CASE_ID,
      });
      mockRlsTx.pastoralParentContact.create.mockResolvedValue(contact);

      await service.logContact(TENANT_ID, USER_ID, dtoWithLinks);

      expect(mockRlsTx.pastoralParentContact.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          concern_id: CONCERN_ID,
          case_id: CASE_ID,
        }),
      });
    });
  });

  // ─── listContacts ───────────────────────────────────────────────────────

  describe('listContacts', () => {
    const defaultQuery = {
      page: 1,
      pageSize: 20,
      sort: 'contact_date' as const,
      order: 'desc' as const,
    };

    it('returns contacts filtered by concern_id', async () => {
      const linkedContact = makeContact({ concern_id: CONCERN_ID });
      mockRlsTx.pastoralParentContact.findMany.mockResolvedValue([linkedContact]);
      mockRlsTx.pastoralParentContact.count.mockResolvedValue(1);

      const result = await service.listContacts(TENANT_ID, {
        ...defaultQuery,
        concern_id: CONCERN_ID,
      });

      expect(mockRlsTx.pastoralParentContact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ concern_id: CONCERN_ID }),
        }),
      );

      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.concern_id).toBe(CONCERN_ID);
    });

    it('returns contacts filtered by case_id', async () => {
      const linkedContact = makeContact({ case_id: CASE_ID });
      mockRlsTx.pastoralParentContact.findMany.mockResolvedValue([linkedContact]);
      mockRlsTx.pastoralParentContact.count.mockResolvedValue(1);

      const result = await service.listContacts(TENANT_ID, {
        ...defaultQuery,
        case_id: CASE_ID,
      });

      expect(mockRlsTx.pastoralParentContact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ case_id: CASE_ID }),
        }),
      );

      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.case_id).toBe(CASE_ID);
    });

    it('returns paginated results with correct meta', async () => {
      const contacts = Array.from({ length: 5 }, (_, i) =>
        makeContact({ id: `contact-${i}` }),
      );
      mockRlsTx.pastoralParentContact.findMany.mockResolvedValue(contacts);
      mockRlsTx.pastoralParentContact.count.mockResolvedValue(25);

      const result = await service.listContacts(TENANT_ID, {
        ...defaultQuery,
        page: 2,
        pageSize: 5,
      });

      expect(result.meta).toEqual({
        page: 2,
        pageSize: 5,
        total: 25,
      });
      expect(result.data).toHaveLength(5);

      // Verify skip was calculated correctly for page 2
      expect(mockRlsTx.pastoralParentContact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 5,
          take: 5,
        }),
      );
    });

    it('resolves student, parent, and contacted_by names', async () => {
      const contact = makeContact({
        student: { first_name: 'Ali', last_name: 'Student' },
        parent: { first_name: 'Fatima', last_name: 'Parent' },
        contacted_by: { first_name: 'Jane', last_name: 'Teacher' },
      });
      mockRlsTx.pastoralParentContact.findMany.mockResolvedValue([contact]);
      mockRlsTx.pastoralParentContact.count.mockResolvedValue(1);

      const result = await service.listContacts(TENANT_ID, defaultQuery);

      const dto = result.data[0]!;
      expect(dto.student_name).toBe('Ali Student');
      expect(dto.parent_name).toBe('Fatima Parent');
      expect(dto.contacted_by_name).toBe('Jane Teacher');
    });
  });

  // ─── getContact ─────────────────────────────────────────────────────────

  describe('getContact', () => {
    it('returns a single contact with resolved names', async () => {
      const contact = makeContact();
      mockRlsTx.pastoralParentContact.findUnique.mockResolvedValue(contact);

      const result = await service.getContact(TENANT_ID, CONTACT_ID);

      expect(result.data.id).toBe(CONTACT_ID);
      expect(result.data.student_name).toBe('Ali Student');
      expect(result.data.parent_name).toBe('Fatima Parent');
      expect(result.data.contacted_by_name).toBe('Jane Teacher');
    });

    it('throws NotFoundException when contact does not exist', async () => {
      mockRlsTx.pastoralParentContact.findUnique.mockResolvedValue(null);

      await expect(
        service.getContact(TENANT_ID, 'nonexistent-id'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
