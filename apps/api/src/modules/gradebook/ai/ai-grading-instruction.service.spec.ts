import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../prisma/prisma.service';

import { AiGradingInstructionService } from './ai-grading-instruction.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const INSTRUCTION_ID = 'instruction-1';
const USER_ID = 'user-1';
const REVIEWER_ID = 'reviewer-1';

// ─── RLS mock ─────────────────────────────────────────────────────────────────

const mockRlsTx = {
  aiGradingInstruction: {
    findFirst: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  },
  aiGradingReference: {
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildMockPrisma() {
  return {
    aiGradingInstruction: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      delete: jest.fn(),
    },
    assessment: { findFirst: jest.fn() },
    aiGradingReference: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      delete: jest.fn(),
    },
  };
}

const baseInstruction = {
  id: INSTRUCTION_ID,
  tenant_id: TENANT_ID,
  class_id: 'class-1',
  subject_id: 'subject-1',
  instruction_text: 'Grade strictly.',
  status: 'pending_approval',
  submitted_by_user_id: USER_ID,
};

// ─── upsertInstruction Tests ──────────────────────────────────────────────────

describe('AiGradingInstructionService — upsertInstruction', () => {
  let service: AiGradingInstructionService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    mockRlsTx.aiGradingInstruction.findFirst.mockReset();
    mockRlsTx.aiGradingInstruction.update.mockReset().mockResolvedValue(baseInstruction);
    mockRlsTx.aiGradingInstruction.create.mockReset().mockResolvedValue(baseInstruction);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiGradingInstructionService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AiGradingInstructionService>(AiGradingInstructionService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should create a new instruction when none exists for class/subject', async () => {
    mockRlsTx.aiGradingInstruction.findFirst.mockResolvedValue(null);

    await service.upsertInstruction(TENANT_ID, USER_ID, {
      class_id: 'class-1',
      subject_id: 'subject-1',
      instruction_text: 'Be thorough.',
    });

    expect(mockRlsTx.aiGradingInstruction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          status: 'pending_approval',
          submitted_by_user_id: USER_ID,
        }),
      }),
    );
  });

  it('should update existing instruction and reset status to pending_approval', async () => {
    mockRlsTx.aiGradingInstruction.findFirst.mockResolvedValue({ id: INSTRUCTION_ID });

    await service.upsertInstruction(TENANT_ID, USER_ID, {
      class_id: 'class-1',
      subject_id: 'subject-1',
      instruction_text: 'Updated instructions.',
    });

    expect(mockRlsTx.aiGradingInstruction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'pending_approval',
          reviewed_by_user_id: null,
          reviewed_at: null,
          rejection_reason: null,
        }),
      }),
    );
  });
});

// ─── reviewInstruction Tests ──────────────────────────────────────────────────

describe('AiGradingInstructionService — reviewInstruction', () => {
  let service: AiGradingInstructionService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    mockRlsTx.aiGradingInstruction.update.mockReset().mockResolvedValue(baseInstruction);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiGradingInstructionService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AiGradingInstructionService>(AiGradingInstructionService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw NotFoundException when instruction does not exist', async () => {
    mockPrisma.aiGradingInstruction.findFirst.mockResolvedValue(null);

    await expect(
      service.reviewInstruction(TENANT_ID, INSTRUCTION_ID, REVIEWER_ID, { status: 'active' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw ConflictException when instruction is not pending_approval', async () => {
    mockPrisma.aiGradingInstruction.findFirst.mockResolvedValue({
      id: INSTRUCTION_ID,
      status: 'active',
    });

    await expect(
      service.reviewInstruction(TENANT_ID, INSTRUCTION_ID, REVIEWER_ID, { status: 'active' }),
    ).rejects.toThrow(ConflictException);
  });

  it('should throw BadRequestException when rejecting without rejection_reason', async () => {
    mockPrisma.aiGradingInstruction.findFirst.mockResolvedValue({
      id: INSTRUCTION_ID,
      status: 'pending_approval',
    });

    await expect(
      service.reviewInstruction(TENANT_ID, INSTRUCTION_ID, REVIEWER_ID, { status: 'rejected' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should approve instruction when status is active', async () => {
    mockPrisma.aiGradingInstruction.findFirst.mockResolvedValue({
      id: INSTRUCTION_ID,
      status: 'pending_approval',
    });

    await service.reviewInstruction(TENANT_ID, INSTRUCTION_ID, REVIEWER_ID, { status: 'active' });

    expect(mockRlsTx.aiGradingInstruction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'active',
          reviewed_by_user_id: REVIEWER_ID,
        }),
      }),
    );
  });
});

// ─── deleteInstruction Tests ──────────────────────────────────────────────────

describe('AiGradingInstructionService — deleteInstruction', () => {
  let service: AiGradingInstructionService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiGradingInstructionService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AiGradingInstructionService>(AiGradingInstructionService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw NotFoundException when instruction does not exist', async () => {
    mockPrisma.aiGradingInstruction.findFirst.mockResolvedValue(null);

    await expect(
      service.deleteInstruction(TENANT_ID, INSTRUCTION_ID, USER_ID),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw ConflictException when deleting an active instruction', async () => {
    mockPrisma.aiGradingInstruction.findFirst.mockResolvedValue({
      id: INSTRUCTION_ID,
      status: 'active',
      submitted_by_user_id: USER_ID,
    });

    await expect(
      service.deleteInstruction(TENANT_ID, INSTRUCTION_ID, USER_ID),
    ).rejects.toThrow(ConflictException);
  });

  it('should throw ForbiddenException when non-owner attempts deletion', async () => {
    mockPrisma.aiGradingInstruction.findFirst.mockResolvedValue({
      id: INSTRUCTION_ID,
      status: 'rejected',
      submitted_by_user_id: 'other-user',
    });

    await expect(
      service.deleteInstruction(TENANT_ID, INSTRUCTION_ID, USER_ID),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should delete the instruction when status is rejected and user is owner', async () => {
    mockPrisma.aiGradingInstruction.findFirst.mockResolvedValue({
      id: INSTRUCTION_ID,
      status: 'rejected',
      submitted_by_user_id: USER_ID,
    });
    mockPrisma.aiGradingInstruction.delete.mockResolvedValue(baseInstruction);

    await service.deleteInstruction(TENANT_ID, INSTRUCTION_ID, USER_ID);

    expect(mockPrisma.aiGradingInstruction.delete).toHaveBeenCalledWith({
      where: { id: INSTRUCTION_ID },
    });
  });
});

// ─── createReference Tests ────────────────────────────────────────────────────

describe('AiGradingInstructionService — createReference', () => {
  let service: AiGradingInstructionService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    mockRlsTx.aiGradingReference.create.mockReset().mockResolvedValue({
      id: 'ref-1',
      status: 'pending_approval',
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiGradingInstructionService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AiGradingInstructionService>(AiGradingInstructionService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw NotFoundException when assessment does not exist', async () => {
    mockPrisma.assessment.findFirst.mockResolvedValue(null);

    await expect(
      service.createReference(TENANT_ID, USER_ID, {
        assessment_id: 'assessment-1',
        file_url: 'https://example.com/file.pdf',
        file_type: 'pdf',
        auto_approve: false,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should create reference with pending_approval status when auto_approve is false', async () => {
    mockPrisma.assessment.findFirst.mockResolvedValue({ id: 'assessment-1' });

    await service.createReference(TENANT_ID, USER_ID, {
      assessment_id: 'assessment-1',
      file_url: 'https://example.com/file.pdf',
      file_type: 'pdf',
      auto_approve: false,
    });

    expect(mockRlsTx.aiGradingReference.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'pending_approval' }),
      }),
    );
  });

  it('should create reference with active status when auto_approve is true', async () => {
    mockPrisma.assessment.findFirst.mockResolvedValue({ id: 'assessment-1' });

    await service.createReference(TENANT_ID, USER_ID, {
      assessment_id: 'assessment-1',
      file_url: 'https://example.com/file.pdf',
      file_type: 'pdf',
      auto_approve: true,
    });

    expect(mockRlsTx.aiGradingReference.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'active' }),
      }),
    );
  });
});
