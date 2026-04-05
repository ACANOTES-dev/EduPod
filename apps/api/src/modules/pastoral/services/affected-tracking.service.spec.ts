import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

import { AffectedTrackingService } from './affected-tracking.service';
import type { AddAffectedPersonDto, UpdateAffectedPersonDto } from './affected-tracking.service';
import { PastoralEventService } from './pastoral-event.service';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const INCIDENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const STUDENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const STUDENT_ID_B = 'dddddddd-dddd-dddd-dddd-ddddddddddde';
const STAFF_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const AFFECTED_PERSON_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

// ─── RLS mock ───────────────────────────────────────────────────────────────

const mockRlsTx = {
  criticalIncident: {
    findFirst: jest.fn(),
  },
  criticalIncidentAffected: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  student: {
    findFirst: jest.fn(),
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

const makeIncident = (overrides: Record<string, unknown> = {}) => ({
  id: INCIDENT_ID,
  tenant_id: TENANT_ID,
  incident_type: 'bereavement',
  description: 'A significant bereavement',
  occurred_at: new Date('2026-03-15T00:00:00Z'),
  scope: 'whole_school',
  status: 'ci_active',
  created_at: new Date('2026-03-15T10:00:00Z'),
  updated_at: new Date('2026-03-15T10:00:00Z'),
  ...overrides,
});

const makeAffectedPerson = (overrides: Record<string, unknown> = {}) => ({
  id: AFFECTED_PERSON_ID,
  tenant_id: TENANT_ID,
  incident_id: INCIDENT_ID,
  affected_type: 'student',
  student_id: STUDENT_ID,
  staff_profile_id: null,
  impact_level: 'direct',
  notes: null,
  support_offered: false,
  created_at: new Date('2026-03-15T10:00:00Z'),
  updated_at: new Date('2026-03-15T10:00:00Z'),
  ...overrides,
});

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('AffectedTrackingService', () => {
  let service: AffectedTrackingService;
  let mockPastoralEventService: { write: jest.Mock };

  beforeEach(async () => {
    mockPastoralEventService = {
      write: jest.fn().mockResolvedValue(undefined),
    };

    // Reset all RLS tx mocks
    for (const model of Object.values(mockRlsTx)) {
      for (const fn of Object.values(model)) {
        (fn as jest.Mock).mockReset();
      }
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AffectedTrackingService,
        { provide: PrismaService, useValue: {} },
        { provide: PastoralEventService, useValue: mockPastoralEventService },
      ],
    }).compile();

    service = module.get<AffectedTrackingService>(AffectedTrackingService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── ADD AFFECTED PERSON ──────────────────────────────────────────────────

  describe('addAffectedPerson', () => {
    it('should create student record with wellbeing flag active (student type)', async () => {
      const incident = makeIncident();
      mockRlsTx.criticalIncident.findFirst.mockResolvedValue(incident);
      mockRlsTx.student.findFirst.mockResolvedValue({
        id: STUDENT_ID,
        tenant_id: TENANT_ID,
      });

      const created = makeAffectedPerson();
      mockRlsTx.criticalIncidentAffected.create.mockResolvedValue(created);

      const dto: AddAffectedPersonDto = {
        person_type: 'student',
        student_id: STUDENT_ID,
        impact_level: 'directly_affected',
      };

      const result = await service.addAffectedPerson(TENANT_ID, INCIDENT_ID, USER_ID, dto);

      expect(result.data).toBeDefined();
      expect(mockRlsTx.criticalIncidentAffected.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          incident_id: INCIDENT_ID,
          affected_type: 'student',
          student_id: STUDENT_ID,
          staff_profile_id: null,
          impact_level: 'direct',
        }),
      });
    });

    it('should create staff record correctly', async () => {
      const incident = makeIncident();
      mockRlsTx.criticalIncident.findFirst.mockResolvedValue(incident);

      const created = makeAffectedPerson({
        affected_type: 'staff',
        student_id: null,
        staff_profile_id: STAFF_ID,
      });
      mockRlsTx.criticalIncidentAffected.create.mockResolvedValue(created);

      const dto: AddAffectedPersonDto = {
        person_type: 'staff',
        staff_id: STAFF_ID,
        impact_level: 'indirectly_affected',
      };

      const result = await service.addAffectedPerson(TENANT_ID, INCIDENT_ID, USER_ID, dto);

      expect(result.data).toBeDefined();
      expect(mockRlsTx.criticalIncidentAffected.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          affected_type: 'staff',
          staff_profile_id: STAFF_ID,
          student_id: null,
          impact_level: 'indirect',
        }),
      });
    });

    it('should require student_id when person_type is student', async () => {
      const dto: AddAffectedPersonDto = {
        person_type: 'student',
        impact_level: 'directly_affected',
      };

      await expect(service.addAffectedPerson(TENANT_ID, INCIDENT_ID, USER_ID, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should require staff_id when person_type is staff', async () => {
      const dto: AddAffectedPersonDto = {
        person_type: 'staff',
        impact_level: 'directly_affected',
      };

      await expect(service.addAffectedPerson(TENANT_ID, INCIDENT_ID, USER_ID, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should record affected_person_added audit event', async () => {
      const incident = makeIncident();
      mockRlsTx.criticalIncident.findFirst.mockResolvedValue(incident);
      mockRlsTx.student.findFirst.mockResolvedValue({
        id: STUDENT_ID,
        tenant_id: TENANT_ID,
      });

      const created = makeAffectedPerson();
      mockRlsTx.criticalIncidentAffected.create.mockResolvedValue(created);

      const dto: AddAffectedPersonDto = {
        person_type: 'student',
        student_id: STUDENT_ID,
        impact_level: 'directly_affected',
      };

      await service.addAffectedPerson(TENANT_ID, INCIDENT_ID, USER_ID, dto);

      expect(mockPastoralEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'affected_person_added',
          entity_id: INCIDENT_ID,
          payload: expect.objectContaining({
            person_type: 'student',
            student_id: STUDENT_ID,
            impact_level: 'directly_affected',
          }),
        }),
      );
    });

    it('should throw NotFoundException for non-existent incident', async () => {
      mockRlsTx.criticalIncident.findFirst.mockResolvedValue(null);

      const dto: AddAffectedPersonDto = {
        person_type: 'student',
        student_id: STUDENT_ID,
        impact_level: 'directly_affected',
      };

      await expect(service.addAffectedPerson(TENANT_ID, INCIDENT_ID, USER_ID, dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException for non-existent student', async () => {
      const incident = makeIncident();
      mockRlsTx.criticalIncident.findFirst.mockResolvedValue(incident);
      mockRlsTx.student.findFirst.mockResolvedValue(null);

      const dto: AddAffectedPersonDto = {
        person_type: 'student',
        student_id: 'non-existent-student',
        impact_level: 'directly_affected',
      };

      await expect(service.addAffectedPerson(TENANT_ID, INCIDENT_ID, USER_ID, dto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── BULK ADD ─────────────────────────────────────────────────────────────

  describe('bulkAddAffected', () => {
    it('should add multiple persons and return counts', async () => {
      const incident = makeIncident();
      mockRlsTx.criticalIncident.findFirst.mockResolvedValue(incident);

      mockRlsTx.criticalIncidentAffected.create
        .mockResolvedValueOnce(makeAffectedPerson({ student_id: STUDENT_ID }))
        .mockResolvedValueOnce(makeAffectedPerson({ student_id: STUDENT_ID_B }));

      const persons: AddAffectedPersonDto[] = [
        {
          person_type: 'student',
          student_id: STUDENT_ID,
          impact_level: 'directly_affected',
        },
        {
          person_type: 'student',
          student_id: STUDENT_ID_B,
          impact_level: 'indirectly_affected',
        },
      ];

      const result = await service.bulkAddAffected(TENANT_ID, INCIDENT_ID, USER_ID, persons);

      expect(result.data.added).toBe(2);
      expect(result.data.skipped).toBe(0);
    });

    it('should skip duplicates (P2002) and count them', async () => {
      const incident = makeIncident();
      mockRlsTx.criticalIncident.findFirst.mockResolvedValue(incident);

      const p2002Error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });

      mockRlsTx.criticalIncidentAffected.create
        .mockResolvedValueOnce(makeAffectedPerson())
        .mockRejectedValueOnce(p2002Error);

      const persons: AddAffectedPersonDto[] = [
        {
          person_type: 'student',
          student_id: STUDENT_ID,
          impact_level: 'directly_affected',
        },
        {
          person_type: 'student',
          student_id: STUDENT_ID,
          impact_level: 'directly_affected',
        },
      ];

      const result = await service.bulkAddAffected(TENANT_ID, INCIDENT_ID, USER_ID, persons);

      expect(result.data.added).toBe(1);
      expect(result.data.skipped).toBe(1);
    });

    it('should throw NotFoundException for non-existent incident', async () => {
      mockRlsTx.criticalIncident.findFirst.mockResolvedValue(null);

      await expect(service.bulkAddAffected(TENANT_ID, INCIDENT_ID, USER_ID, [])).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── UPDATE AFFECTED PERSON ───────────────────────────────────────────────

  describe('updateAffectedPerson', () => {
    it('should update impact level', async () => {
      const existing = makeAffectedPerson({ impact_level: 'direct' });
      mockRlsTx.criticalIncidentAffected.findFirst.mockResolvedValue(existing);
      mockRlsTx.criticalIncidentAffected.update.mockResolvedValue({
        ...existing,
        impact_level: 'indirect',
      });

      const dto: UpdateAffectedPersonDto = {
        impact_level: 'indirectly_affected',
      };

      const result = await service.updateAffectedPerson(
        TENANT_ID,
        AFFECTED_PERSON_ID,
        USER_ID,
        dto,
      );

      expect(result.data).toBeDefined();
      expect(mockRlsTx.criticalIncidentAffected.update).toHaveBeenCalledWith({
        where: { id: AFFECTED_PERSON_ID },
        data: expect.objectContaining({
          impact_level: 'indirect',
        }),
      });
    });

    it('should toggle wellbeing flag (update support_offered)', async () => {
      const existing = makeAffectedPerson({ support_offered: false });
      mockRlsTx.criticalIncidentAffected.findFirst.mockResolvedValue(existing);
      mockRlsTx.criticalIncidentAffected.update.mockResolvedValue({
        ...existing,
        support_offered: true,
      });

      const dto: UpdateAffectedPersonDto = {
        support_offered: true,
      };

      const result = await service.updateAffectedPerson(
        TENANT_ID,
        AFFECTED_PERSON_ID,
        USER_ID,
        dto,
      );

      expect(result.data).toBeDefined();
      expect(mockRlsTx.criticalIncidentAffected.update).toHaveBeenCalledWith({
        where: { id: AFFECTED_PERSON_ID },
        data: expect.objectContaining({
          support_offered: true,
        }),
      });
    });

    it('should record affected_person_updated audit event', async () => {
      const existing = makeAffectedPerson();
      mockRlsTx.criticalIncidentAffected.findFirst.mockResolvedValue(existing);
      mockRlsTx.criticalIncidentAffected.update.mockResolvedValue(existing);

      await service.updateAffectedPerson(TENANT_ID, AFFECTED_PERSON_ID, USER_ID, {
        impact_level: 'indirectly_affected',
      });

      expect(mockPastoralEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'affected_person_updated',
          payload: expect.objectContaining({
            affected_person_id: AFFECTED_PERSON_ID,
          }),
        }),
      );
    });

    it('should throw NotFoundException for non-existent affected person', async () => {
      mockRlsTx.criticalIncidentAffected.findFirst.mockResolvedValue(null);

      await expect(
        service.updateAffectedPerson(TENANT_ID, AFFECTED_PERSON_ID, USER_ID, {
          impact_level: 'directly_affected',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── REMOVE AFFECTED PERSON ──────────────────────────────────────────────

  describe('removeAffectedPerson', () => {
    it('should delete the record', async () => {
      const existing = makeAffectedPerson();
      mockRlsTx.criticalIncidentAffected.findFirst.mockResolvedValue(existing);
      mockRlsTx.criticalIncidentAffected.delete.mockResolvedValue(existing);

      await service.removeAffectedPerson(
        TENANT_ID,
        AFFECTED_PERSON_ID,
        USER_ID,
        'No longer affected',
      );

      expect(mockRlsTx.criticalIncidentAffected.delete).toHaveBeenCalledWith({
        where: { id: AFFECTED_PERSON_ID },
      });
    });

    it('should record affected_person_removed audit event with reason', async () => {
      const existing = makeAffectedPerson();
      mockRlsTx.criticalIncidentAffected.findFirst.mockResolvedValue(existing);
      mockRlsTx.criticalIncidentAffected.delete.mockResolvedValue(existing);

      await service.removeAffectedPerson(
        TENANT_ID,
        AFFECTED_PERSON_ID,
        USER_ID,
        'Incorrect tagging',
      );

      expect(mockPastoralEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'affected_person_removed',
          payload: expect.objectContaining({
            affected_person_id: AFFECTED_PERSON_ID,
            reason: 'Incorrect tagging',
          }),
        }),
      );
    });

    it('should throw NotFoundException for non-existent affected person', async () => {
      mockRlsTx.criticalIncidentAffected.findFirst.mockResolvedValue(null);

      await expect(
        service.removeAffectedPerson(TENANT_ID, AFFECTED_PERSON_ID, USER_ID, 'test'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── GET STUDENT WELLBEING FLAGS ──────────────────────────────────────────

  describe('getStudentWellbeingFlags', () => {
    it('should return active flags from active/monitoring incidents', async () => {
      const affectedRecords = [
        {
          created_at: new Date('2026-03-15T10:00:00Z'),
        },
      ];
      mockRlsTx.criticalIncidentAffected.findMany.mockResolvedValue(affectedRecords);

      const result = await service.getStudentWellbeingFlags(TENANT_ID, STUDENT_ID);

      expect(result.data).toHaveLength(1);
      const firstFlag = result.data[0] as NonNullable<(typeof result.data)[0]>;
      expect(firstFlag.student_id).toBe(STUDENT_ID);
      expect(firstFlag.flag_message).toBe(
        'Be aware this student may be affected by a recent event',
      );
      expect(firstFlag.since).toBeDefined();
      expect(firstFlag.expires_at).toBeNull();
    });

    it('should NOT return flags from closed incidents', async () => {
      // The query filters by status IN (ci_active, ci_monitoring)
      // so closed incidents are excluded automatically
      mockRlsTx.criticalIncidentAffected.findMany.mockResolvedValue([]);

      const result = await service.getStudentWellbeingFlags(TENANT_ID, STUDENT_ID);

      expect(result.data).toHaveLength(0);

      // Verify the query included the incident status filter
      expect(mockRlsTx.criticalIncidentAffected.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            student_id: STUDENT_ID,
            affected_type: 'student',
            incident: {
              status: { in: ['ci_active', 'ci_monitoring'] },
            },
          }),
        }),
      );
    });

    it('should return generic message without incident details', async () => {
      const affectedRecords = [
        {
          created_at: new Date('2026-03-15T10:00:00Z'),
        },
      ];
      mockRlsTx.criticalIncidentAffected.findMany.mockResolvedValue(affectedRecords);

      const result = await service.getStudentWellbeingFlags(TENANT_ID, STUDENT_ID);

      const flag = result.data[0] as NonNullable<(typeof result.data)[0]>;
      // The flag should NOT contain any incident details
      expect(flag).not.toHaveProperty('incident_id');
      expect(flag).not.toHaveProperty('incident_type');
      expect(flag).not.toHaveProperty('description');
      expect(flag.flag_message).toBe('Be aware this student may be affected by a recent event');
    });

    it('should return multiple flags for multiple incidents', async () => {
      const affectedRecords = [
        { created_at: new Date('2026-03-15T10:00:00Z') },
        { created_at: new Date('2026-03-20T10:00:00Z') },
      ];
      mockRlsTx.criticalIncidentAffected.findMany.mockResolvedValue(affectedRecords);

      const result = await service.getStudentWellbeingFlags(TENANT_ID, STUDENT_ID);

      expect(result.data).toHaveLength(2);
    });
  });

  // ─── HAS ACTIVE WELLBEING FLAG ────────────────────────────────────────────

  describe('hasActiveWellbeingFlag', () => {
    it('should return true when student has active flags', async () => {
      mockRlsTx.criticalIncidentAffected.count.mockResolvedValue(1);

      const result = await service.hasActiveWellbeingFlag(TENANT_ID, STUDENT_ID);

      expect(result).toBe(true);
    });

    it('should return false when no flags', async () => {
      mockRlsTx.criticalIncidentAffected.count.mockResolvedValue(0);

      const result = await service.hasActiveWellbeingFlag(TENANT_ID, STUDENT_ID);

      expect(result).toBe(false);
    });

    it('should filter by active/monitoring incidents', async () => {
      mockRlsTx.criticalIncidentAffected.count.mockResolvedValue(0);

      await service.hasActiveWellbeingFlag(TENANT_ID, STUDENT_ID);

      expect(mockRlsTx.criticalIncidentAffected.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          student_id: STUDENT_ID,
          affected_type: 'student',
          incident: {
            status: { in: ['ci_active', 'ci_monitoring'] },
          },
        }),
      });
    });
  });

  // ─── RECORD SUPPORT OFFERED ───────────────────────────────────────────────

  describe('recordSupportOffered', () => {
    it('should set support_offered and notes', async () => {
      const existing = makeAffectedPerson();
      mockRlsTx.criticalIncidentAffected.findFirst.mockResolvedValue(existing);
      mockRlsTx.criticalIncidentAffected.update.mockResolvedValue({
        ...existing,
        support_offered: true,
        notes: 'Offered counselling session',
      });

      const result = await service.recordSupportOffered(
        TENANT_ID,
        AFFECTED_PERSON_ID,
        USER_ID,
        'Offered counselling session',
      );

      expect(result.data).toBeDefined();
      expect(mockRlsTx.criticalIncidentAffected.update).toHaveBeenCalledWith({
        where: { id: AFFECTED_PERSON_ID },
        data: {
          support_offered: true,
          notes: 'Offered counselling session',
        },
      });
    });

    it('should record support_offered audit event', async () => {
      const existing = makeAffectedPerson();
      mockRlsTx.criticalIncidentAffected.findFirst.mockResolvedValue(existing);
      mockRlsTx.criticalIncidentAffected.update.mockResolvedValue({
        ...existing,
        support_offered: true,
      });

      await service.recordSupportOffered(TENANT_ID, AFFECTED_PERSON_ID, USER_ID, 'Support offered');

      expect(mockPastoralEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'support_offered',
          payload: expect.objectContaining({
            affected_person_id: AFFECTED_PERSON_ID,
            notes: 'Support offered',
          }),
        }),
      );
    });

    it('should throw NotFoundException for non-existent person', async () => {
      mockRlsTx.criticalIncidentAffected.findFirst.mockResolvedValue(null);

      await expect(
        service.recordSupportOffered(TENANT_ID, AFFECTED_PERSON_ID, USER_ID, 'Notes'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── GET AFFECTED SUMMARY ────────────────────────────────────────────────

  describe('getAffectedSummary', () => {
    it('should return correct counts', async () => {
      mockRlsTx.criticalIncidentAffected.count
        .mockResolvedValueOnce(8) // total_students
        .mockResolvedValueOnce(3) // total_staff
        .mockResolvedValueOnce(5) // directly_affected
        .mockResolvedValueOnce(6) // indirectly_affected
        .mockResolvedValueOnce(4) // support_offered
        .mockResolvedValueOnce(7); // support_pending

      const result = await service.getAffectedSummary(TENANT_ID, INCIDENT_ID);

      expect(result.data).toEqual({
        total_students: 8,
        total_staff: 3,
        directly_affected_count: 5,
        indirectly_affected_count: 6,
        support_offered_count: 4,
        support_pending_count: 7,
      });
    });

    it('should use correct filters for each count', async () => {
      mockRlsTx.criticalIncidentAffected.count.mockResolvedValue(0);

      await service.getAffectedSummary(TENANT_ID, INCIDENT_ID);

      // Verify the count calls used correct where clauses
      const calls = mockRlsTx.criticalIncidentAffected.count.mock.calls;
      expect(calls).toHaveLength(6);

      // total_students
      expect(calls[0][0]).toEqual({
        where: expect.objectContaining({
          incident_id: INCIDENT_ID,
          affected_type: 'student',
        }),
      });

      // total_staff
      expect(calls[1][0]).toEqual({
        where: expect.objectContaining({
          incident_id: INCIDENT_ID,
          affected_type: 'staff',
        }),
      });

      // directly_affected
      expect(calls[2][0]).toEqual({
        where: expect.objectContaining({
          incident_id: INCIDENT_ID,
          impact_level: 'direct',
        }),
      });

      // indirectly_affected
      expect(calls[3][0]).toEqual({
        where: expect.objectContaining({
          incident_id: INCIDENT_ID,
          impact_level: 'indirect',
        }),
      });

      // support_offered
      expect(calls[4][0]).toEqual({
        where: expect.objectContaining({
          incident_id: INCIDENT_ID,
          support_offered: true,
        }),
      });

      // support_pending
      expect(calls[5][0]).toEqual({
        where: expect.objectContaining({
          incident_id: INCIDENT_ID,
          support_offered: false,
        }),
      });
    });
  });

  // ─── LIST AFFECTED PERSONS ───────────────────────────────────────────────

  describe('listAffectedPersons', () => {
    it('should list persons with joins', async () => {
      const persons = [
        makeAffectedPerson({
          student: { id: STUDENT_ID, first_name: 'John', last_name: 'Doe' },
          staff_profile: {
            id: STAFF_ID,
            user: { first_name: 'Jane', last_name: 'Smith' },
          },
        }),
      ];
      mockRlsTx.criticalIncidentAffected.findMany.mockResolvedValue(persons);

      const result = await service.listAffectedPersons(TENANT_ID, INCIDENT_ID, {});

      expect(result.data).toHaveLength(1);
      expect(mockRlsTx.criticalIncidentAffected.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            incident_id: INCIDENT_ID,
          }),
          include: expect.objectContaining({
            student: expect.anything(),
            staff_profile: expect.objectContaining({
              select: expect.objectContaining({
                id: true,
                user: expect.anything(),
              }),
            }),
          }),
        }),
      );
    });

    it('should filter by person_type', async () => {
      mockRlsTx.criticalIncidentAffected.findMany.mockResolvedValue([]);

      await service.listAffectedPersons(TENANT_ID, INCIDENT_ID, {
        person_type: 'staff',
      });

      expect(mockRlsTx.criticalIncidentAffected.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            affected_type: 'staff',
          }),
        }),
      );
    });

    it('should filter by impact_level', async () => {
      mockRlsTx.criticalIncidentAffected.findMany.mockResolvedValue([]);

      await service.listAffectedPersons(TENANT_ID, INCIDENT_ID, {
        impact_level: 'directly_affected',
      });

      expect(mockRlsTx.criticalIncidentAffected.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            impact_level: 'direct',
          }),
        }),
      );
    });

    it('should filter by support_offered', async () => {
      mockRlsTx.criticalIncidentAffected.findMany.mockResolvedValue([]);

      await service.listAffectedPersons(TENANT_ID, INCIDENT_ID, {
        support_offered: false,
      });

      expect(mockRlsTx.criticalIncidentAffected.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            support_offered: false,
          }),
        }),
      );
    });

    it('should apply no extra filters when filters object is empty', async () => {
      mockRlsTx.criticalIncidentAffected.findMany.mockResolvedValue([]);

      await service.listAffectedPersons(TENANT_ID, INCIDENT_ID, {});

      const callArg = mockRlsTx.criticalIncidentAffected.findMany.mock.calls[0]?.[0] as {
        where: Record<string, unknown>;
      };
      expect(callArg.where.affected_type).toBeUndefined();
      expect(callArg.where.impact_level).toBeUndefined();
      expect(callArg.where.support_offered).toBeUndefined();
    });
  });

  // ─── Additional branch coverage ──────────────────────────────────────────

  describe('updateAffectedPerson — notes field', () => {
    it('should update notes when provided in DTO', async () => {
      const existing = makeAffectedPerson();
      mockRlsTx.criticalIncidentAffected.findFirst.mockResolvedValue(existing);
      mockRlsTx.criticalIncidentAffected.update.mockResolvedValue({
        ...existing,
        notes: 'Updated notes about this person',
      });

      const dto: UpdateAffectedPersonDto = {
        notes: 'Updated notes about this person',
      };

      const result = await service.updateAffectedPerson(
        TENANT_ID,
        AFFECTED_PERSON_ID,
        USER_ID,
        dto,
      );

      expect(result.data).toBeDefined();
      expect(mockRlsTx.criticalIncidentAffected.update).toHaveBeenCalledWith({
        where: { id: AFFECTED_PERSON_ID },
        data: expect.objectContaining({
          notes: 'Updated notes about this person',
        }),
      });
    });

    it('should handle multiple fields updated simultaneously', async () => {
      const existing = makeAffectedPerson();
      mockRlsTx.criticalIncidentAffected.findFirst.mockResolvedValue(existing);
      mockRlsTx.criticalIncidentAffected.update.mockResolvedValue({
        ...existing,
        impact_level: 'indirect',
        support_offered: true,
        notes: 'All fields updated',
      });

      const dto: UpdateAffectedPersonDto = {
        impact_level: 'indirectly_affected',
        support_offered: true,
        notes: 'All fields updated',
      };

      await service.updateAffectedPerson(TENANT_ID, AFFECTED_PERSON_ID, USER_ID, dto);

      expect(mockRlsTx.criticalIncidentAffected.update).toHaveBeenCalledWith({
        where: { id: AFFECTED_PERSON_ID },
        data: {
          impact_level: 'indirect',
          support_offered: true,
          notes: 'All fields updated',
        },
      });
    });

    it('should report changed fields in audit event', async () => {
      const existing = makeAffectedPerson();
      mockRlsTx.criticalIncidentAffected.findFirst.mockResolvedValue(existing);
      mockRlsTx.criticalIncidentAffected.update.mockResolvedValue(existing);

      await service.updateAffectedPerson(TENANT_ID, AFFECTED_PERSON_ID, USER_ID, {
        impact_level: 'directly_affected',
        notes: 'test',
      });

      expect(mockPastoralEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            changed_fields: expect.arrayContaining(['impact_level', 'notes']),
          }),
        }),
      );
    });
  });

  describe('bulkAddAffected — error handling', () => {
    it('should rethrow non-P2002 errors', async () => {
      const incident = makeIncident();
      mockRlsTx.criticalIncident.findFirst.mockResolvedValue(incident);

      const genericError = new Error('Some unexpected database error');
      mockRlsTx.criticalIncidentAffected.create.mockRejectedValue(genericError);

      const persons: AddAffectedPersonDto[] = [
        {
          person_type: 'student',
          student_id: STUDENT_ID,
          impact_level: 'directly_affected',
        },
      ];

      await expect(
        service.bulkAddAffected(TENANT_ID, INCIDENT_ID, USER_ID, persons),
      ).rejects.toThrow('Some unexpected database error');
    });

    it('should record audit event with correct total_attempted count', async () => {
      const incident = makeIncident();
      mockRlsTx.criticalIncident.findFirst.mockResolvedValue(incident);
      mockRlsTx.criticalIncidentAffected.create.mockResolvedValue(makeAffectedPerson());

      const persons: AddAffectedPersonDto[] = [
        { person_type: 'student', student_id: STUDENT_ID, impact_level: 'directly_affected' },
        { person_type: 'staff', staff_id: STAFF_ID, impact_level: 'indirectly_affected' },
      ];

      await service.bulkAddAffected(TENANT_ID, INCIDENT_ID, USER_ID, persons);

      expect(mockPastoralEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'affected_persons_bulk_added',
          payload: expect.objectContaining({
            total_attempted: 2,
            added: 2,
            skipped: 0,
          }),
        }),
      );
    });
  });

  describe('addAffectedPerson — staff type validation', () => {
    it('should set student_id to null for staff type', async () => {
      const incident = makeIncident();
      mockRlsTx.criticalIncident.findFirst.mockResolvedValue(incident);

      const created = makeAffectedPerson({
        affected_type: 'staff',
        student_id: null,
        staff_profile_id: STAFF_ID,
      });
      mockRlsTx.criticalIncidentAffected.create.mockResolvedValue(created);

      const dto: AddAffectedPersonDto = {
        person_type: 'staff',
        staff_id: STAFF_ID,
        impact_level: 'directly_affected',
      };

      await service.addAffectedPerson(TENANT_ID, INCIDENT_ID, USER_ID, dto);

      expect(mockRlsTx.criticalIncidentAffected.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          student_id: null,
          staff_profile_id: STAFF_ID,
        }),
      });
    });

    it('should record staff_id as null in audit event for student type', async () => {
      const incident = makeIncident();
      mockRlsTx.criticalIncident.findFirst.mockResolvedValue(incident);
      mockRlsTx.student.findFirst.mockResolvedValue({ id: STUDENT_ID, tenant_id: TENANT_ID });
      mockRlsTx.criticalIncidentAffected.create.mockResolvedValue(makeAffectedPerson());

      const dto: AddAffectedPersonDto = {
        person_type: 'student',
        student_id: STUDENT_ID,
        impact_level: 'directly_affected',
      };

      await service.addAffectedPerson(TENANT_ID, INCIDENT_ID, USER_ID, dto);

      expect(mockPastoralEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          student_id: STUDENT_ID,
          payload: expect.objectContaining({
            staff_id: null,
          }),
        }),
      );
    });

    it('should set student_id to null in audit event for staff type', async () => {
      const incident = makeIncident();
      mockRlsTx.criticalIncident.findFirst.mockResolvedValue(incident);
      mockRlsTx.criticalIncidentAffected.create.mockResolvedValue(
        makeAffectedPerson({
          affected_type: 'staff',
          student_id: null,
          staff_profile_id: STAFF_ID,
        }),
      );

      const dto: AddAffectedPersonDto = {
        person_type: 'staff',
        staff_id: STAFF_ID,
        impact_level: 'directly_affected',
      };

      await service.addAffectedPerson(TENANT_ID, INCIDENT_ID, USER_ID, dto);

      expect(mockPastoralEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          student_id: null,
        }),
      );
    });
  });

  describe('removeAffectedPerson — audit event details', () => {
    it('should include person_type in audit event payload', async () => {
      const existing = makeAffectedPerson({ affected_type: 'staff' });
      mockRlsTx.criticalIncidentAffected.findFirst.mockResolvedValue(existing);
      mockRlsTx.criticalIncidentAffected.delete.mockResolvedValue(existing);

      await service.removeAffectedPerson(TENANT_ID, AFFECTED_PERSON_ID, USER_ID, 'Test removal');

      expect(mockPastoralEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            person_type: 'staff',
          }),
        }),
      );
    });
  });

  // ─── Branch coverage: addAffectedPerson — impact level fallback ────────────

  describe('addAffectedPerson — impact level mapping', () => {
    it('should map directly_affected to direct prisma enum', async () => {
      const incident = { id: INCIDENT_ID, tenant_id: TENANT_ID };
      mockRlsTx.criticalIncident.findFirst.mockResolvedValue(incident);
      mockRlsTx.student.findFirst.mockResolvedValue({ id: STUDENT_ID });
      mockRlsTx.criticalIncidentAffected.create.mockResolvedValue(
        makeAffectedPerson({ impact_level: 'direct' }),
      );

      await service.addAffectedPerson(TENANT_ID, INCIDENT_ID, USER_ID, {
        person_type: 'student',
        student_id: STUDENT_ID,
        impact_level: 'directly_affected',
      });

      expect(mockRlsTx.criticalIncidentAffected.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            impact_level: 'direct',
          }),
        }),
      );
    });

    it('should map indirectly_affected to indirect prisma enum', async () => {
      const incident = { id: INCIDENT_ID, tenant_id: TENANT_ID };
      mockRlsTx.criticalIncident.findFirst.mockResolvedValue(incident);
      mockRlsTx.student.findFirst.mockResolvedValue({ id: STUDENT_ID });
      mockRlsTx.criticalIncidentAffected.create.mockResolvedValue(
        makeAffectedPerson({ impact_level: 'indirect' }),
      );

      await service.addAffectedPerson(TENANT_ID, INCIDENT_ID, USER_ID, {
        person_type: 'student',
        student_id: STUDENT_ID,
        impact_level: 'indirectly_affected',
      });

      expect(mockRlsTx.criticalIncidentAffected.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            impact_level: 'indirect',
          }),
        }),
      );
    });
  });

  // ─── Branch coverage: listAffectedPersons — impact_level mapping ──────────

  describe('listAffectedPersons — impact_level filter mapping', () => {
    it('should map directly_affected filter to direct', async () => {
      mockRlsTx.criticalIncidentAffected.findMany.mockResolvedValue([]);

      await service.listAffectedPersons(TENANT_ID, INCIDENT_ID, {
        impact_level: 'directly_affected',
      });

      expect(mockRlsTx.criticalIncidentAffected.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            impact_level: 'direct',
          }),
        }),
      );
    });

    it('should map indirectly_affected filter to indirect', async () => {
      mockRlsTx.criticalIncidentAffected.findMany.mockResolvedValue([]);

      await service.listAffectedPersons(TENANT_ID, INCIDENT_ID, {
        impact_level: 'indirectly_affected',
      });

      expect(mockRlsTx.criticalIncidentAffected.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            impact_level: 'indirect',
          }),
        }),
      );
    });
  });

  // ─── Branch coverage: updateAffectedPerson — impact_level mapping ─────────

  describe('updateAffectedPerson — impact_level mapping', () => {
    it('should map directly_affected to direct in update', async () => {
      const existing = makeAffectedPerson();
      mockRlsTx.criticalIncidentAffected.findFirst.mockResolvedValue(existing);
      mockRlsTx.criticalIncidentAffected.update.mockResolvedValue({
        ...existing,
        impact_level: 'direct',
      });

      await service.updateAffectedPerson(TENANT_ID, AFFECTED_PERSON_ID, USER_ID, {
        impact_level: 'directly_affected',
      });

      expect(mockRlsTx.criticalIncidentAffected.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            impact_level: 'direct',
          }),
        }),
      );
    });
  });

  // ─── Branch coverage: bulkAddAffected — impact_level mapping in bulk ──────

  describe('bulkAddAffected — impact_level mapping', () => {
    it('should map indirectly_affected to indirect in bulk add', async () => {
      const incident = { id: INCIDENT_ID, tenant_id: TENANT_ID };
      mockRlsTx.criticalIncident.findFirst.mockResolvedValue(incident);
      mockRlsTx.criticalIncidentAffected.create.mockResolvedValue(makeAffectedPerson());

      await service.bulkAddAffected(TENANT_ID, INCIDENT_ID, USER_ID, [
        {
          person_type: 'student',
          student_id: STUDENT_ID,
          impact_level: 'indirectly_affected',
        },
      ]);

      expect(mockRlsTx.criticalIncidentAffected.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            impact_level: 'indirect',
          }),
        }),
      );
    });
  });

  // ─── Branch coverage: getStudentWellbeingFlags — empty results ────────────

  describe('getStudentWellbeingFlags — empty result', () => {
    it('should return empty data array when no active flags', async () => {
      mockRlsTx.criticalIncidentAffected.findMany.mockResolvedValue([]);

      const result = await service.getStudentWellbeingFlags(TENANT_ID, STUDENT_ID);

      expect(result.data).toEqual([]);
    });
  });
});
