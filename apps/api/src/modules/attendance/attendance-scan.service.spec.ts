import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { MOCK_FACADE_PROVIDERS, StudentReadFacade } from '../../common/tests/mock-facades';
import { AnthropicClientService } from '../ai/anthropic-client.service';
import { SettingsService } from '../configuration/settings.service';
import { AiAuditService } from '../gdpr/ai-audit.service';
import { GdprTokenService } from '../gdpr/gdpr-token.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

import { AttendanceScanService } from './attendance-scan.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'user-1';

// ─── Redis mock ─────────────────────────────────────────────────────────────

const mockRedisClient = {
  incr: jest.fn().mockResolvedValue(1),
  expire: jest.fn().mockResolvedValue(1),
  set: jest.fn().mockResolvedValue('OK'),
};

const mockSettingsService = {
  getSettings: jest.fn().mockResolvedValue({ ai: { attendanceScanEnabled: true } }),
};

describe('AttendanceScanService — parseScanResponse', () => {
  let service: AttendanceScanService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        AttendanceScanService,
        { provide: PrismaService, useValue: { student: { findMany: jest.fn() } } },
        { provide: RedisService, useValue: { getClient: () => mockRedisClient } },
        { provide: SettingsService, useValue: mockSettingsService },
        {
          provide: GdprTokenService,
          useValue: {
            processOutbound: jest
              .fn()
              .mockImplementation((_t: string, _p: string, data: unknown) => ({
                processedData: data,
                tokenMap: new Map(),
              })),
            processInbound: jest
              .fn()
              .mockImplementation((_tokenMap: unknown, text: string) => text),
          },
        },
        { provide: AiAuditService, useValue: { log: jest.fn().mockResolvedValue('test-log-id') } },
        {
          provide: AnthropicClientService,
          useValue: { isConfigured: false, createMessage: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<AttendanceScanService>(AttendanceScanService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should parse a valid JSON array from the AI response', () => {
    const raw = JSON.stringify([
      { student_number: '1001', status: 'absent', confidence: 'high' },
      { student_number: '1002', status: 'late', confidence: 'low' },
    ]);

    const entries = service.parseScanResponse(raw);

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      student_number: '1001',
      status: 'absent_unexcused',
      confidence: 'high',
    });
    expect(entries[1]).toMatchObject({
      student_number: '1002',
      status: 'late',
      confidence: 'low',
    });
  });

  it('should strip markdown code fences before parsing', () => {
    const raw = '```json\n[{"student_number":"2001","status":"absent","confidence":"high"}]\n```';

    const entries = service.parseScanResponse(raw);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ student_number: '2001', status: 'absent_unexcused' });
  });

  it('should return an empty array for non-JSON AI response', () => {
    const entries = service.parseScanResponse('Sorry, I could not read the image.');

    expect(entries).toHaveLength(0);
  });

  it('should return an empty array when AI returns empty array', () => {
    const entries = service.parseScanResponse('[]');

    expect(entries).toHaveLength(0);
  });

  it('should skip entries missing student_number or status', () => {
    const raw = JSON.stringify([
      { status: 'absent', confidence: 'high' }, // missing student_number
      { student_number: '1003', confidence: 'high' }, // missing status
      { student_number: '1004', status: 'late', confidence: 'high' }, // valid
    ]);

    const entries = service.parseScanResponse(raw);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ student_number: '1004' });
  });

  it('should skip entries with unrecognised status values', () => {
    const raw = JSON.stringify([{ student_number: '1005', status: 'on_time', confidence: 'high' }]);

    const entries = service.parseScanResponse(raw);

    expect(entries).toHaveLength(0);
  });

  it('should map alias status values to canonical ones', () => {
    const raw = JSON.stringify([
      { student_number: '1006', status: 'excused', confidence: 'high' },
      { student_number: '1007', status: 'tardy', confidence: 'high' },
    ]);

    const entries = service.parseScanResponse(raw);

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ status: 'absent_excused' });
    expect(entries[1]).toMatchObject({ status: 'late' });
  });

  it('should default confidence to high for anything that is not "low"', () => {
    const raw = JSON.stringify([
      { student_number: '1008', status: 'absent', confidence: 'medium' },
    ]);

    const entries = service.parseScanResponse(raw);

    expect(entries[0]).toMatchObject({ confidence: 'high' });
  });

  it('should preserve optional reason field when present', () => {
    const raw = JSON.stringify([
      { student_number: '1009', status: 'absent', confidence: 'high', reason: 'sick' },
    ]);

    const entries = service.parseScanResponse(raw);

    expect(entries[0]).toMatchObject({ reason: 'sick' });
  });

  it('should return empty array when AI response is a JSON object (not an array)', () => {
    const raw = JSON.stringify({ student_number: '1001', status: 'absent' });

    const entries = service.parseScanResponse(raw);

    expect(entries).toHaveLength(0);
  });

  it('should strip markdown code fences without language specifier', () => {
    const raw = '```\n[{"student_number":"3001","status":"late","confidence":"high"}]\n```';

    const entries = service.parseScanResponse(raw);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ student_number: '3001', status: 'late' });
  });

  it('should set reason to undefined when reason field is absent', () => {
    const raw = JSON.stringify([{ student_number: '1010', status: 'absent', confidence: 'high' }]);

    const entries = service.parseScanResponse(raw);

    expect(entries[0]?.reason).toBeUndefined();
  });

  it('should handle absent_unexcused and absent_excused status directly', () => {
    const raw = JSON.stringify([
      { student_number: '1011', status: 'absent_unexcused', confidence: 'high' },
      { student_number: '1012', status: 'absent_excused', confidence: 'high' },
    ]);

    const entries = service.parseScanResponse(raw);

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ status: 'absent_unexcused' });
    expect(entries[1]).toMatchObject({ status: 'absent_excused' });
  });

  it('should handle left_early status', () => {
    const raw = JSON.stringify([
      { student_number: '1013', status: 'left_early', confidence: 'low' },
    ]);

    const entries = service.parseScanResponse(raw);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ status: 'left_early', confidence: 'low' });
  });
});

// ─── resolveStudentNames ────────────────────────────────────────────────────

describe('AttendanceScanService — resolveStudentNames', () => {
  let service: AttendanceScanService;
  let mockPrisma: { student: { findMany: jest.Mock } };
  let mockStudentFacade: { findByStudentNumbers: jest.Mock };

  beforeEach(async () => {
    delete process.env.ANTHROPIC_API_KEY;

    mockPrisma = { student: { findMany: jest.fn() } };
    mockStudentFacade = { findByStudentNumbers: jest.fn().mockResolvedValue([]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        AttendanceScanService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: { getClient: () => mockRedisClient } },
        { provide: SettingsService, useValue: mockSettingsService },
        {
          provide: GdprTokenService,
          useValue: {
            processOutbound: jest
              .fn()
              .mockImplementation((_t: string, _p: string, data: unknown) => ({
                processedData: data,
                tokenMap: new Map(),
              })),
            processInbound: jest
              .fn()
              .mockImplementation((_tokenMap: unknown, text: string) => text),
          },
        },
        { provide: AiAuditService, useValue: { log: jest.fn().mockResolvedValue('test-log-id') } },
        {
          provide: AnthropicClientService,
          useValue: { isConfigured: false, createMessage: jest.fn() },
        },
        { provide: StudentReadFacade, useValue: mockStudentFacade },
      ],
    }).compile();

    service = module.get<AttendanceScanService>(AttendanceScanService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return entries unchanged when input is empty', async () => {
    const result = await service.resolveStudentNames(TENANT_ID, []);

    expect(result).toHaveLength(0);
    expect(mockStudentFacade.findByStudentNumbers).not.toHaveBeenCalled();
  });

  it('should attach resolved_student_id and resolved_student_name when student is found', async () => {
    mockStudentFacade.findByStudentNumbers.mockResolvedValue([
      { id: 'stu-1', student_number: '1001', first_name: 'Ahmad', last_name: 'Hassan' },
    ]);

    const result = await service.resolveStudentNames(TENANT_ID, [
      { student_number: '1001', status: 'absent_unexcused', confidence: 'high' },
    ]);

    expect(result[0]).toMatchObject({
      student_number: '1001',
      resolved_student_id: 'stu-1',
      resolved_student_name: 'Ahmad Hassan',
    });
  });

  it('should attach error field when student_number is not found', async () => {
    mockStudentFacade.findByStudentNumbers.mockResolvedValue([]);

    const result = await service.resolveStudentNames(TENANT_ID, [
      { student_number: 'UNKNOWN', status: 'late', confidence: 'low' },
    ]);

    expect(result[0]).toMatchObject({
      student_number: 'UNKNOWN',
      error: 'Student number not found',
    });
    expect(result[0]!.resolved_student_id).toBeUndefined();
  });

  it('should resolve multiple entries in one database call', async () => {
    mockStudentFacade.findByStudentNumbers.mockResolvedValue([
      { id: 'stu-1', student_number: '1001', first_name: 'Ahmad', last_name: 'Hassan' },
      { id: 'stu-2', student_number: '1002', first_name: 'Sara', last_name: 'Ali' },
    ]);

    await service.resolveStudentNames(TENANT_ID, [
      { student_number: '1001', status: 'absent_unexcused', confidence: 'high' },
      { student_number: '1002', status: 'late', confidence: 'high' },
    ]);

    expect(mockStudentFacade.findByStudentNumbers).toHaveBeenCalledTimes(1);
  });

  it('should skip students with null student_number in the lookup map', async () => {
    mockStudentFacade.findByStudentNumbers.mockResolvedValue([
      { id: 'stu-1', student_number: null, first_name: 'Ghost', last_name: 'Student' },
      { id: 'stu-2', student_number: '2001', first_name: 'Real', last_name: 'Student' },
    ]);

    const result = await service.resolveStudentNames(TENANT_ID, [
      { student_number: '2001', status: 'absent_unexcused', confidence: 'high' },
    ]);

    expect(result[0]).toMatchObject({
      resolved_student_id: 'stu-2',
      resolved_student_name: 'Real Student',
    });
  });
});

// ─── scanImage — rate limit & unavailability ────────────────────────────────

describe('AttendanceScanService — scanImage guards', () => {
  it('should throw ServiceUnavailableException when ANTHROPIC_API_KEY is not set', async () => {
    delete process.env.ANTHROPIC_API_KEY;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        AttendanceScanService,
        { provide: PrismaService, useValue: { student: { findMany: jest.fn() } } },
        { provide: RedisService, useValue: { getClient: () => mockRedisClient } },
        { provide: SettingsService, useValue: mockSettingsService },
        {
          provide: GdprTokenService,
          useValue: {
            processOutbound: jest
              .fn()
              .mockImplementation((_t: string, _p: string, data: unknown) => ({
                processedData: data,
                tokenMap: new Map(),
              })),
            processInbound: jest
              .fn()
              .mockImplementation((_tokenMap: unknown, text: string) => text),
          },
        },
        { provide: AiAuditService, useValue: { log: jest.fn().mockResolvedValue('test-log-id') } },
        {
          provide: AnthropicClientService,
          useValue: { isConfigured: false, createMessage: jest.fn() },
        },
      ],
    }).compile();

    const svc = module.get<AttendanceScanService>(AttendanceScanService);

    await expect(
      svc.scanImage(TENANT_ID, USER_ID, Buffer.from('img'), 'image/jpeg', '2026-03-10'),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('should throw ServiceUnavailableException when AI feature is disabled in settings', async () => {
    const disabledSettings = {
      getSettings: jest.fn().mockResolvedValue({ ai: { attendanceScanEnabled: false } }),
    };

    const module2: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        AttendanceScanService,
        { provide: PrismaService, useValue: { student: { findMany: jest.fn() } } },
        { provide: RedisService, useValue: { getClient: () => mockRedisClient } },
        { provide: SettingsService, useValue: disabledSettings },
        {
          provide: GdprTokenService,
          useValue: {
            processOutbound: jest.fn(),
            processInbound: jest.fn(),
          },
        },
        { provide: AiAuditService, useValue: { log: jest.fn() } },
        {
          provide: AnthropicClientService,
          useValue: { isConfigured: true, createMessage: jest.fn() },
        },
      ],
    }).compile();

    const svc2 = module2.get<AttendanceScanService>(AttendanceScanService);

    await expect(
      svc2.scanImage(TENANT_ID, USER_ID, Buffer.from('img'), 'image/jpeg', '2026-03-10'),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('should throw BadRequestException when daily scan limit is exceeded', async () => {
    delete process.env.ANTHROPIC_API_KEY;

    // incr returns > 50 → rate limit exceeded
    mockRedisClient.incr.mockResolvedValue(51);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        AttendanceScanService,
        { provide: PrismaService, useValue: { student: { findMany: jest.fn() } } },
        { provide: RedisService, useValue: { getClient: () => mockRedisClient } },
        { provide: SettingsService, useValue: mockSettingsService },
        {
          provide: GdprTokenService,
          useValue: {
            processOutbound: jest
              .fn()
              .mockImplementation((_t: string, _p: string, data: unknown) => ({
                processedData: data,
                tokenMap: new Map(),
              })),
            processInbound: jest
              .fn()
              .mockImplementation((_tokenMap: unknown, text: string) => text),
          },
        },
        { provide: AiAuditService, useValue: { log: jest.fn().mockResolvedValue('test-log-id') } },
        {
          provide: AnthropicClientService,
          useValue: { isConfigured: true, createMessage: jest.fn() },
        },
      ],
    }).compile();

    const svc = module.get<AttendanceScanService>(AttendanceScanService);

    await expect(
      svc.scanImage(TENANT_ID, USER_ID, Buffer.from('img'), 'image/jpeg', '2026-03-10'),
    ).rejects.toThrow(BadRequestException);
  });

  afterEach(() => {
    mockRedisClient.incr.mockResolvedValue(1);
    jest.clearAllMocks();
  });
});

// ─── AI audit trail ──────────────────────────────────────────────────────────

describe('AttendanceScanService — AI audit trail', () => {
  it('should log AI processing to audit trail when scanning an image', async () => {
    const mockAnthropicCreate = jest.fn().mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify([{ student_number: '1001', status: 'absent', confidence: 'high' }]),
        },
      ],
    });

    const mockStudentPrisma = {
      student: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        AttendanceScanService,
        { provide: PrismaService, useValue: mockStudentPrisma },
        {
          provide: StudentReadFacade,
          useValue: { findByStudentNumbers: jest.fn().mockResolvedValue([]) },
        },
        { provide: RedisService, useValue: { getClient: () => mockRedisClient } },
        { provide: SettingsService, useValue: mockSettingsService },
        {
          provide: GdprTokenService,
          useValue: {
            processOutbound: jest.fn().mockResolvedValue({
              processedData: { entities: [], entityCount: 0 },
              tokenMap: null,
            }),
            processInbound: jest.fn().mockImplementation(async (_t: string, r: string) => r),
          },
        },
        { provide: AiAuditService, useValue: { log: jest.fn().mockResolvedValue('test-log-id') } },
        {
          provide: AnthropicClientService,
          useValue: { isConfigured: true, createMessage: mockAnthropicCreate },
        },
      ],
    }).compile();

    const svc = module.get<AttendanceScanService>(AttendanceScanService);

    await svc.scanImage(TENANT_ID, USER_ID, Buffer.from('img'), 'image/jpeg', '2026-03-10');

    const mockAuditService = module.get(AiAuditService);
    expect(mockAuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        aiService: 'ai_attendance_scan',
        tokenised: true,
      }),
    );
  });

  afterEach(() => jest.clearAllMocks());
});

// ─── scanImage — full flow ─────────────────────────────────────────────────

describe('AttendanceScanService — scanImage full flow', () => {
  it('should complete full scan flow and store result in Redis', async () => {
    const mockAnthropicCreate = jest.fn().mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify([{ student_number: '1001', status: 'absent', confidence: 'high' }]),
        },
      ],
    });

    const mockStudentFacadeLocal = {
      findByStudentNumbers: jest
        .fn()
        .mockResolvedValue([
          { id: 'stu-1', student_number: '1001', first_name: 'Ahmad', last_name: 'Hassan' },
        ]),
    };

    const localRedisClient = {
      incr: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
      set: jest.fn().mockResolvedValue('OK'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        AttendanceScanService,
        { provide: PrismaService, useValue: {} },
        { provide: RedisService, useValue: { getClient: () => localRedisClient } },
        { provide: SettingsService, useValue: mockSettingsService },
        {
          provide: GdprTokenService,
          useValue: { processOutbound: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: AiAuditService, useValue: { log: jest.fn().mockResolvedValue('log-id') } },
        {
          provide: AnthropicClientService,
          useValue: { isConfigured: true, createMessage: mockAnthropicCreate },
        },
        { provide: StudentReadFacade, useValue: mockStudentFacadeLocal },
      ],
    }).compile();

    const svc = module.get<AttendanceScanService>(AttendanceScanService);

    const result = await svc.scanImage(
      TENANT_ID,
      USER_ID,
      Buffer.from('image-data'),
      'image/jpeg',
      '2026-03-10',
    );

    expect(result.scan_id).toBeDefined();
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      student_number: '1001',
      status: 'absent_unexcused',
      resolved_student_id: 'stu-1',
    });

    // Redis set should have been called to store the scan result
    expect(localRedisClient.set).toHaveBeenCalledWith(
      expect.stringContaining('attendance:scan:'),
      expect.any(String),
      'EX',
      1800,
    );

    // Rate limit: first call should trigger expire
    expect(localRedisClient.incr).toHaveBeenCalled();
    expect(localRedisClient.expire).toHaveBeenCalled();
  });

  it('should not call expire on Redis when count is not 1 (subsequent calls)', async () => {
    const mockAnthropicCreate = jest.fn().mockResolvedValue({
      content: [{ type: 'text', text: '[]' }],
    });

    const localRedisClient = {
      incr: jest.fn().mockResolvedValue(5), // 5th call today
      expire: jest.fn(),
      set: jest.fn().mockResolvedValue('OK'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        AttendanceScanService,
        { provide: PrismaService, useValue: {} },
        { provide: RedisService, useValue: { getClient: () => localRedisClient } },
        { provide: SettingsService, useValue: mockSettingsService },
        {
          provide: GdprTokenService,
          useValue: { processOutbound: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: AiAuditService, useValue: { log: jest.fn().mockResolvedValue('log-id') } },
        {
          provide: AnthropicClientService,
          useValue: { isConfigured: true, createMessage: mockAnthropicCreate },
        },
        {
          provide: StudentReadFacade,
          useValue: { findByStudentNumbers: jest.fn().mockResolvedValue([]) },
        },
      ],
    }).compile();

    const svc = module.get<AttendanceScanService>(AttendanceScanService);

    await svc.scanImage(TENANT_ID, USER_ID, Buffer.from('img'), 'image/jpeg', '2026-03-10');

    expect(localRedisClient.expire).not.toHaveBeenCalled();
  });

  it('should handle AI response without text block gracefully', async () => {
    const mockAnthropicCreate = jest.fn().mockResolvedValue({
      content: [{ type: 'tool_use', id: 'tool-1', name: 'unknown', input: {} }],
    });

    const localRedisClient = {
      incr: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
      set: jest.fn().mockResolvedValue('OK'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        AttendanceScanService,
        { provide: PrismaService, useValue: {} },
        { provide: RedisService, useValue: { getClient: () => localRedisClient } },
        { provide: SettingsService, useValue: mockSettingsService },
        {
          provide: GdprTokenService,
          useValue: { processOutbound: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: AiAuditService, useValue: { log: jest.fn().mockResolvedValue('log-id') } },
        {
          provide: AnthropicClientService,
          useValue: { isConfigured: true, createMessage: mockAnthropicCreate },
        },
        {
          provide: StudentReadFacade,
          useValue: { findByStudentNumbers: jest.fn().mockResolvedValue([]) },
        },
      ],
    }).compile();

    const svc = module.get<AttendanceScanService>(AttendanceScanService);

    const result = await svc.scanImage(
      TENANT_ID,
      USER_ID,
      Buffer.from('img'),
      'image/jpeg',
      '2026-03-10',
    );

    // No text block → empty string → parseScanResponse returns []
    expect(result.entries).toHaveLength(0);
  });

  afterEach(() => jest.clearAllMocks());
});

// ─── isAllowedMimeType ───────────────────────────────────────────────────────

describe('AttendanceScanService — isAllowedMimeType', () => {
  it('should return true for image/jpeg', () => {
    expect(AttendanceScanService.isAllowedMimeType('image/jpeg')).toBe(true);
  });

  it('should return true for image/png', () => {
    expect(AttendanceScanService.isAllowedMimeType('image/png')).toBe(true);
  });

  it('should return false for application/pdf', () => {
    expect(AttendanceScanService.isAllowedMimeType('application/pdf')).toBe(false);
  });

  it('should return false for text/plain', () => {
    expect(AttendanceScanService.isAllowedMimeType('text/plain')).toBe(false);
  });
});
