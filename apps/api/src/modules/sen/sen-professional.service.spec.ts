import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { MOCK_FACADE_PROVIDERS, PastoralReadFacade } from '../../common/tests/mock-facades';
import { PrismaService } from '../prisma/prisma.service';

import { SenProfessionalService } from './sen-professional.service';

jest.mock('../../common/middleware/rls.middleware');

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const PROFILE_ID = '00000000-0000-0000-0000-000000000002';
const INVOLVEMENT_ID = '00000000-0000-0000-0000-000000000003';
const PASTORAL_REFERRAL_ID = '00000000-0000-0000-0000-000000000004';

describe('SenProfessionalService', () => {
  let service: SenProfessionalService;

  const senProfessionalInvolvementMock = {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  const senProfileMock = {
    findFirst: jest.fn(),
  };

  const pastoralReferralMock = {
    findFirst: jest.fn(),
  };

  const mockPrisma = {
    senProfessionalInvolvement: senProfessionalInvolvementMock,
    senProfile: senProfileMock,
    pastoralReferral: pastoralReferralMock,
    $transaction: jest.fn() as jest.Mock,
  };

  mockPrisma.$transaction.mockImplementation((fn: (client: typeof mockPrisma) => unknown) =>
    fn(mockPrisma),
  );

  const createInvolvementRecord = (overrides: Record<string, unknown> = {}) => ({
    id: INVOLVEMENT_ID,
    tenant_id: TENANT_ID,
    sen_profile_id: PROFILE_ID,
    professional_type: 'educational_psychologist',
    professional_name: 'Dr. Smith',
    organisation: 'NEPS',
    referral_date: new Date('2026-03-01'),
    assessment_date: new Date('2026-03-15'),
    report_received_date: null,
    recommendations: 'Recommend additional literacy support',
    status: 'pending',
    pastoral_referral_id: null,
    notes: 'Initial referral',
    created_at: new Date('2026-03-01T09:00:00.000Z'),
    updated_at: new Date('2026-03-01T09:00:00.000Z'),
    sen_profile: {
      id: PROFILE_ID,
      student_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      primary_category: 'learning',
      support_level: 'school_support',
      is_active: true,
    },
    ...overrides,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        SenProfessionalService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PastoralReadFacade, useValue: { findReferralById: pastoralReferralMock.findFirst } },
      ],
    }).compile();

    service = module.get<SenProfessionalService>(SenProfessionalService);

    jest.clearAllMocks();

    const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware');
    createRlsClient.mockReturnValue({
      $transaction: jest.fn((fn: (client: unknown) => unknown) => fn(mockPrisma)),
    });
  });

  afterEach(() => jest.clearAllMocks());

  // ─── create ────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('should create a professional involvement record successfully', async () => {
      senProfileMock.findFirst.mockResolvedValue({ id: PROFILE_ID });
      senProfessionalInvolvementMock.create.mockResolvedValue(createInvolvementRecord());

      const result = await service.create(TENANT_ID, PROFILE_ID, {
        professional_type: 'educational_psychologist',
        professional_name: 'Dr. Smith',
        organisation: 'NEPS',
        referral_date: '2026-03-01',
        assessment_date: '2026-03-15',
        recommendations: 'Recommend additional literacy support',
        status: 'pending',
        notes: 'Initial referral',
      });

      expect(result.id).toBe(INVOLVEMENT_ID);
      expect(result.professional_type).toBe('educational_psychologist');
      expect(result.sen_profile.id).toBe(PROFILE_ID);
      expect(senProfessionalInvolvementMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenant_id: TENANT_ID,
            sen_profile_id: PROFILE_ID,
            professional_type: 'educational_psychologist',
          }),
        }),
      );
    });

    it('should throw NotFoundException when SEN profile does not exist', async () => {
      senProfileMock.findFirst.mockResolvedValue(null);

      await expect(
        service.create(TENANT_ID, PROFILE_ID, {
          professional_type: 'speech_therapist',
          status: 'pending',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should create with a valid pastoral referral link', async () => {
      senProfileMock.findFirst.mockResolvedValue({ id: PROFILE_ID });
      pastoralReferralMock.findFirst.mockResolvedValue({ id: PASTORAL_REFERRAL_ID });
      senProfessionalInvolvementMock.create.mockResolvedValue(
        createInvolvementRecord({ pastoral_referral_id: PASTORAL_REFERRAL_ID }),
      );

      const result = await service.create(TENANT_ID, PROFILE_ID, {
        professional_type: 'camhs',
        status: 'pending',
        pastoral_referral_id: PASTORAL_REFERRAL_ID,
      });

      expect(result.pastoral_referral_id).toBe(PASTORAL_REFERRAL_ID);
      expect(pastoralReferralMock.findFirst).toHaveBeenCalledWith(
        TENANT_ID,
        PASTORAL_REFERRAL_ID,
      );
    });

    it('should throw NotFoundException when pastoral referral does not exist', async () => {
      senProfileMock.findFirst.mockResolvedValue({ id: PROFILE_ID });
      pastoralReferralMock.findFirst.mockResolvedValue(null);

      await expect(
        service.create(TENANT_ID, PROFILE_ID, {
          professional_type: 'camhs',
          status: 'pending',
          pastoral_referral_id: PASTORAL_REFERRAL_ID,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── findAllByProfile ─────────────────────────────────────────────────────

  describe('findAllByProfile', () => {
    it('should return records ordered by referral_date descending with pagination', async () => {
      const record1 = createInvolvementRecord({ referral_date: new Date('2026-03-01') });
      const record2 = createInvolvementRecord({
        id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
        referral_date: new Date('2026-02-01'),
      });

      senProfessionalInvolvementMock.findMany.mockResolvedValue([record1, record2]);
      senProfessionalInvolvementMock.count.mockResolvedValue(2);

      const result = await service.findAllByProfile(TENANT_ID, PROFILE_ID, {
        page: 1,
        pageSize: 20,
      });

      expect(result.data).toHaveLength(2);
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 2 });
      expect(senProfessionalInvolvementMock.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            sen_profile_id: PROFILE_ID,
          }),
          orderBy: [{ referral_date: 'desc' }, { created_at: 'desc' }],
        }),
      );
    });

    it('should filter by professional_type and status', async () => {
      senProfessionalInvolvementMock.findMany.mockResolvedValue([]);
      senProfessionalInvolvementMock.count.mockResolvedValue(0);

      await service.findAllByProfile(TENANT_ID, PROFILE_ID, {
        page: 1,
        pageSize: 20,
        professional_type: 'speech_therapist',
        status: 'completed',
      });

      expect(senProfessionalInvolvementMock.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            professional_type: 'speech_therapist',
            status: 'completed',
          }),
        }),
      );
    });
  });

  // ─── countByProfile ────────────────────────────────────────────────────────

  describe('countByProfile', () => {
    it('should return total count for the profile', async () => {
      senProfessionalInvolvementMock.count.mockResolvedValue(3);

      const result = await service.countByProfile(TENANT_ID, PROFILE_ID);

      expect(result).toEqual({ total: 3 });
      expect(senProfessionalInvolvementMock.count).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID, sen_profile_id: PROFILE_ID },
      });
    });
  });

  // ─── update ────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('should update a professional involvement record successfully', async () => {
      senProfessionalInvolvementMock.findFirst.mockResolvedValue({
        id: INVOLVEMENT_ID,
        status: 'scheduled',
      });
      senProfessionalInvolvementMock.update.mockResolvedValue(
        createInvolvementRecord({
          status: 'completed',
          report_received_date: new Date('2026-04-01'),
        }),
      );

      const result = await service.update(TENANT_ID, INVOLVEMENT_ID, {
        status: 'completed',
        report_received_date: '2026-04-01',
      });

      expect(result.status).toBe('completed');
      expect(senProfessionalInvolvementMock.update).toHaveBeenCalled();
    });

    it('should throw NotFoundException when record does not exist', async () => {
      senProfessionalInvolvementMock.findFirst.mockResolvedValue(null);

      await expect(
        service.update(TENANT_ID, INVOLVEMENT_ID, { status: 'completed' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should validate pastoral referral on update when provided', async () => {
      senProfessionalInvolvementMock.findFirst.mockResolvedValue({ id: INVOLVEMENT_ID });
      pastoralReferralMock.findFirst.mockResolvedValue(null);

      await expect(
        service.update(TENANT_ID, INVOLVEMENT_ID, {
          pastoral_referral_id: PASTORAL_REFERRAL_ID,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── delete ────────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('should delete a professional involvement record successfully', async () => {
      senProfessionalInvolvementMock.findFirst.mockResolvedValue({ id: INVOLVEMENT_ID });
      senProfessionalInvolvementMock.delete.mockResolvedValue({ id: INVOLVEMENT_ID });

      await expect(service.delete(TENANT_ID, INVOLVEMENT_ID)).resolves.toBeUndefined();
      expect(senProfessionalInvolvementMock.delete).toHaveBeenCalledWith({
        where: { id: INVOLVEMENT_ID },
      });
    });

    it('should throw NotFoundException when record does not exist', async () => {
      senProfessionalInvolvementMock.findFirst.mockResolvedValue(null);

      await expect(service.delete(TENANT_ID, INVOLVEMENT_ID)).rejects.toThrow(NotFoundException);
    });
  });
});
