import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { buildMockPrisma } from '../../../test/mock-factories';
import { AuditLogService } from '../audit-log/audit-log.service';
import { PrismaService } from '../prisma/prisma.service';

import { SecurityIncidentsService } from './security-incidents.service';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const INCIDENT_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = '22222222-2222-2222-2222-222222222222';
const TENANT_ID_A = '33333333-3333-3333-3333-333333333333';
const TENANT_ID_B = '44444444-4444-4444-4444-444444444444';
const EVENT_ID = '55555555-5555-5555-5555-555555555555';
const ASSIGNED_USER_ID = '66666666-6666-6666-6666-666666666666';

const NOW = new Date('2026-03-28T12:00:00Z');

const MOCK_USER = { id: USER_ID, first_name: 'John', last_name: 'Doe' };
const MOCK_ASSIGNED_USER = { id: ASSIGNED_USER_ID, first_name: 'Jane', last_name: 'Smith' };

function buildBaseIncident(overrides: Record<string, unknown> = {}) {
  return {
    id: INCIDENT_ID,
    detected_at: NOW,
    severity: 'high',
    incident_type: 'rls_violation',
    description: 'Detected RLS bypass attempt from tenant isolation tests',
    affected_tenants: [TENANT_ID_A],
    affected_data_subjects_count: 5,
    data_categories_affected: ['personal_data'],
    containment_actions: null,
    reported_to_controllers_at: null,
    reported_to_dpc_at: null,
    dpc_reference_number: null,
    root_cause: null,
    remediation: null,
    status: 'detected',
    created_by_user_id: USER_ID,
    assigned_to_user_id: null,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

// ─── Mock factories ───────────────────────────────────────────────────────────

const createMockPrisma = () =>
  buildMockPrisma({
    securityIncident: ['findMany', 'findUnique', 'findFirst', 'count', 'create', 'update'],
    securityIncidentEvent: ['create'],
  } as const);

function buildMockAuditLogService() {
  return {
    write: jest.fn().mockResolvedValue(undefined),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SecurityIncidentsService', () => {
  let service: SecurityIncidentsService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let mockAuditLog: ReturnType<typeof buildMockAuditLogService>;

  beforeEach(async () => {
    mockPrisma = createMockPrisma();
    mockAuditLog = buildMockAuditLogService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SecurityIncidentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditLogService, useValue: mockAuditLog },
      ],
    }).compile();

    service = module.get<SecurityIncidentsService>(SecurityIncidentsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── list ───────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('should return paginated incidents', async () => {
      const incidentRow = {
        ...buildBaseIncident(),
        created_by: MOCK_USER,
        assigned_to: null,
        _count: { events: 3 },
      };

      mockPrisma.securityIncident.findMany.mockResolvedValue([incidentRow]);
      mockPrisma.securityIncident.count.mockResolvedValue(1);

      const result = await service.list({ page: 1, pageSize: 20 });

      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({
        id: INCIDENT_ID,
        created_by_name: 'John Doe',
        assigned_to_name: null,
        events_count: 3,
      });
      // Raw relation objects should be stripped
      expect(result.data[0]!.created_by).toBeUndefined();
      expect(result.data[0]!.assigned_to).toBeUndefined();
      expect(result.data[0]!._count).toBeUndefined();

      expect(mockPrisma.securityIncident.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 20,
          orderBy: { detected_at: 'desc' },
        }),
      );
    });

    it('should apply filters to query', async () => {
      mockPrisma.securityIncident.findMany.mockResolvedValue([]);
      mockPrisma.securityIncident.count.mockResolvedValue(0);

      await service.list({
        page: 2,
        pageSize: 10,
        status: 'investigating',
        severity: 'critical',
        incident_type: 'brute_force',
        start_date: '2026-03-01',
        end_date: '2026-03-31',
      });

      const callArgs = mockPrisma.securityIncident.findMany.mock.calls[0][0] as {
        where: Record<string, unknown>;
        skip: number;
      };
      expect(callArgs.where).toMatchObject({
        status: 'investigating',
        severity: 'critical',
        incident_type: 'brute_force',
      });
      expect(callArgs.where.detected_at).toBeDefined();
      expect(callArgs.skip).toBe(10);
    });
  });

  // ─── findOne ────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('should return incident with events', async () => {
      const incidentRow = {
        ...buildBaseIncident(),
        created_by: MOCK_USER,
        assigned_to: MOCK_ASSIGNED_USER,
        events: [
          {
            id: EVENT_ID,
            incident_id: INCIDENT_ID,
            event_type: 'status_change',
            description: 'Incident created manually',
            created_by_user_id: USER_ID,
            created_at: NOW,
            created_by: MOCK_USER,
          },
        ],
      };

      mockPrisma.securityIncident.findUnique.mockResolvedValue(incidentRow);

      const result = await service.findOne(INCIDENT_ID);

      expect(result.id).toBe(INCIDENT_ID);
      expect(result.created_by_name).toBe('John Doe');
      expect(result.assigned_to_name).toBe('Jane Smith');
      expect(result.events).toHaveLength(1);
      expect(result.events[0]).toMatchObject({
        id: EVENT_ID,
        event_type: 'status_change',
        created_by_name: 'John Doe',
      });
      // Raw relation should be stripped from events
      expect(result.events[0]!.created_by).toBeUndefined();
      expect(result.created_by).toBeUndefined();
      expect(result.assigned_to).toBeUndefined();

      expect(mockPrisma.securityIncident.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: INCIDENT_ID },
          include: expect.objectContaining({
            events: expect.objectContaining({
              orderBy: { created_at: 'asc' },
            }),
          }),
        }),
      );
    });

    it('should throw NotFoundException for missing incident', async () => {
      mockPrisma.securityIncident.findUnique.mockResolvedValue(null);

      await expect(service.findOne(INCIDENT_ID)).rejects.toThrow(NotFoundException);
      await expect(service.findOne(INCIDENT_ID)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'INCIDENT_NOT_FOUND' }),
      });
    });
  });

  // ─── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('should create incident with initial timeline event', async () => {
      const createdIncident = {
        ...buildBaseIncident(),
        events: [
          {
            id: EVENT_ID,
            incident_id: INCIDENT_ID,
            event_type: 'status_change',
            description: 'Incident created manually',
            created_by_user_id: USER_ID,
            created_at: NOW,
          },
        ],
      };

      mockPrisma.securityIncident.create.mockResolvedValue(createdIncident);

      const result = await service.create(
        {
          severity: 'high',
          incident_type: 'rls_violation',
          description: 'Detected RLS bypass attempt from tenant isolation tests',
          affected_tenants: [TENANT_ID_A],
          affected_data_subjects_count: 5,
          data_categories_affected: ['personal_data'],
        },
        USER_ID,
      );

      expect(result.id).toBe(INCIDENT_ID);
      expect(result.events).toHaveLength(1);

      // Verify create was called with nested event
      const createCall = mockPrisma.securityIncident.create.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(createCall.data).toMatchObject({
        severity: 'high',
        incident_type: 'rls_violation',
        status: 'detected',
        created_by_user_id: USER_ID,
      });
      expect(createCall.data.events).toEqual({
        create: {
          event_type: 'status_change',
          description: 'Incident created manually',
          created_by_user_id: USER_ID,
        },
      });

      // Verify audit log
      expect(mockAuditLog.write).toHaveBeenCalledWith(
        null,
        USER_ID,
        'security_incident',
        INCIDENT_ID,
        'incident_created',
        expect.objectContaining({
          severity: 'high',
          incident_type: 'rls_violation',
        }),
        null,
      );
    });
  });

  // ─── update ─────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('should update incident and validate status transitions', async () => {
      const existing = buildBaseIncident({ status: 'detected' });
      mockPrisma.securityIncident.findUnique.mockResolvedValue(existing);

      const updatedIncident = { ...existing, status: 'investigating' };
      mockPrisma.securityIncident.update.mockResolvedValue(updatedIncident);

      const result = await service.update(INCIDENT_ID, { status: 'investigating' }, USER_ID);

      expect(result.status).toBe('investigating');

      // Verify update includes nested status_change event
      const updateCall = mockPrisma.securityIncident.update.mock.calls[0][0] as {
        data: { events?: { create: { event_type: string; description: string } } };
      };
      expect(updateCall.data.events).toEqual({
        create: {
          event_type: 'status_change',
          description: 'Status changed from "detected" to "investigating"',
          created_by_user_id: USER_ID,
        },
      });

      // Verify audit log
      expect(mockAuditLog.write).toHaveBeenCalledWith(
        null,
        USER_ID,
        'security_incident',
        INCIDENT_ID,
        'incident_updated',
        expect.objectContaining({
          previous_status: 'detected',
        }),
        null,
      );
    });

    it('should throw BadRequestException for invalid status transition', async () => {
      const existing = buildBaseIncident({ status: 'detected' });
      mockPrisma.securityIncident.findUnique.mockResolvedValue(existing);

      await expect(service.update(INCIDENT_ID, { status: 'closed' }, USER_ID)).rejects.toThrow(
        BadRequestException,
      );

      await expect(
        service.update(INCIDENT_ID, { status: 'closed' }, USER_ID),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'INVALID_STATUS_TRANSITION' }),
      });

      // Should not have called update
      expect(mockPrisma.securityIncident.update).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException for missing incident', async () => {
      mockPrisma.securityIncident.findUnique.mockResolvedValue(null);

      await expect(service.update(INCIDENT_ID, { severity: 'critical' }, USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should update non-status fields without adding status_change event', async () => {
      const existing = buildBaseIncident({ status: 'investigating' });
      mockPrisma.securityIncident.findUnique.mockResolvedValue(existing);
      mockPrisma.securityIncident.update.mockResolvedValue({
        ...existing,
        severity: 'critical',
      });

      await service.update(
        INCIDENT_ID,
        { severity: 'critical', root_cause: 'Misconfigured RLS policy' },
        USER_ID,
      );

      const updateCall = mockPrisma.securityIncident.update.mock.calls[0][0] as {
        data: { severity: string; root_cause: string; events?: unknown };
      };
      expect(updateCall.data.severity).toBe('critical');
      expect(updateCall.data.root_cause).toBe('Misconfigured RLS policy');
      expect(updateCall.data.events).toBeUndefined();
    });
  });

  // ─── addEvent ───────────────────────────────────────────────────────────────

  describe('addEvent', () => {
    it('should add timeline event to existing incident', async () => {
      mockPrisma.securityIncident.findUnique.mockResolvedValue({ id: INCIDENT_ID });

      const createdEvent = {
        id: EVENT_ID,
        incident_id: INCIDENT_ID,
        event_type: 'note',
        description: 'Investigation notes: reviewed access logs',
        created_by_user_id: USER_ID,
        created_at: NOW,
      };
      mockPrisma.securityIncidentEvent.create.mockResolvedValue(createdEvent);

      const result = await service.addEvent(
        INCIDENT_ID,
        { event_type: 'note', description: 'Investigation notes: reviewed access logs' },
        USER_ID,
      );

      expect(result.id).toBe(EVENT_ID);
      expect(result.event_type).toBe('note');

      expect(mockPrisma.securityIncidentEvent.create).toHaveBeenCalledWith({
        data: {
          incident_id: INCIDENT_ID,
          event_type: 'note',
          description: 'Investigation notes: reviewed access logs',
          created_by_user_id: USER_ID,
        },
      });

      expect(mockAuditLog.write).toHaveBeenCalledWith(
        null,
        USER_ID,
        'security_incident',
        INCIDENT_ID,
        'event_added',
        expect.objectContaining({
          event_id: EVENT_ID,
          event_type: 'note',
        }),
        null,
      );
    });

    it('should throw NotFoundException for missing incident', async () => {
      mockPrisma.securityIncident.findUnique.mockResolvedValue(null);

      await expect(
        service.addEvent(INCIDENT_ID, { event_type: 'note', description: 'Some note' }, USER_ID),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrisma.securityIncidentEvent.create).not.toHaveBeenCalled();
    });
  });

  // ─── notifyControllers ──────────────────────────────────────────────────────

  describe('notifyControllers', () => {
    it('should record controller notification', async () => {
      mockPrisma.securityIncident.findUnique.mockResolvedValue({ id: INCIDENT_ID });

      const updatedIncident = {
        ...buildBaseIncident(),
        reported_to_controllers_at: NOW,
      };
      mockPrisma.securityIncident.update.mockResolvedValue(updatedIncident);

      const result = await service.notifyControllers(
        INCIDENT_ID,
        {
          tenant_ids: [TENANT_ID_A, TENANT_ID_B],
          message: 'A data breach has been detected affecting your tenant.',
        },
        USER_ID,
      );

      expect(result.reported_to_controllers_at).toBe(NOW);

      // Verify update set the timestamp and created notification event
      const updateCall = mockPrisma.securityIncident.update.mock.calls[0][0] as {
        data: {
          reported_to_controllers_at: Date;
          events: { create: { event_type: string; description: string } };
        };
      };
      expect(updateCall.data.reported_to_controllers_at).toBeInstanceOf(Date);
      expect(updateCall.data.events.create.event_type).toBe('notification');

      expect(mockAuditLog.write).toHaveBeenCalledWith(
        null,
        USER_ID,
        'security_incident',
        INCIDENT_ID,
        'controllers_notified',
        expect.objectContaining({
          tenant_ids: [TENANT_ID_A, TENANT_ID_B],
        }),
        null,
      );
    });

    it('should throw NotFoundException for missing incident', async () => {
      mockPrisma.securityIncident.findUnique.mockResolvedValue(null);

      await expect(
        service.notifyControllers(
          INCIDENT_ID,
          { tenant_ids: [TENANT_ID_A], message: 'Breach notification' },
          USER_ID,
        ),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrisma.securityIncident.update).not.toHaveBeenCalled();
    });
  });

  // ─── notifyDpc ──────────────────────────────────────────────────────────────

  describe('notifyDpc', () => {
    it('should record DPC notification', async () => {
      mockPrisma.securityIncident.findUnique.mockResolvedValue({ id: INCIDENT_ID });

      const updatedIncident = {
        ...buildBaseIncident(),
        reported_to_dpc_at: NOW,
        dpc_reference_number: 'DPC-2026-001',
      };
      mockPrisma.securityIncident.update.mockResolvedValue(updatedIncident);

      const result = await service.notifyDpc(
        INCIDENT_ID,
        { dpc_reference_number: 'DPC-2026-001', notes: 'Filed within 72 hours' },
        USER_ID,
      );

      expect(result.reported_to_dpc_at).toBe(NOW);
      expect(result.dpc_reference_number).toBe('DPC-2026-001');

      // Verify update set dpc fields and created notification event
      const updateCall = mockPrisma.securityIncident.update.mock.calls[0][0] as {
        data: {
          reported_to_dpc_at: Date;
          dpc_reference_number: string;
          events: { create: { event_type: string; description: string } };
        };
      };
      expect(updateCall.data.reported_to_dpc_at).toBeInstanceOf(Date);
      expect(updateCall.data.dpc_reference_number).toBe('DPC-2026-001');
      expect(updateCall.data.events.create.event_type).toBe('notification');
      expect(updateCall.data.events.create.description).toContain('DPC-2026-001');
      expect(updateCall.data.events.create.description).toContain('Filed within 72 hours');

      expect(mockAuditLog.write).toHaveBeenCalledWith(
        null,
        USER_ID,
        'security_incident',
        INCIDENT_ID,
        'dpc_notified',
        expect.objectContaining({
          dpc_reference_number: 'DPC-2026-001',
          notes: 'Filed within 72 hours',
        }),
        null,
      );
    });

    it('should throw NotFoundException for missing incident', async () => {
      mockPrisma.securityIncident.findUnique.mockResolvedValue(null);

      await expect(
        service.notifyDpc(INCIDENT_ID, { dpc_reference_number: 'DPC-2026-002' }, USER_ID),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrisma.securityIncident.update).not.toHaveBeenCalled();
    });
  });

  // ─── findOrCreateForAnomaly ─────────────────────────────────────────────────

  describe('findOrCreateForAnomaly', () => {
    it('should return existing open incident when found', async () => {
      const existingIncident = buildBaseIncident({ status: 'investigating' });
      mockPrisma.securityIncident.findFirst.mockResolvedValue(existingIncident);

      const evidenceEvent = {
        id: EVENT_ID,
        incident_id: INCIDENT_ID,
        event_type: 'evidence',
        description: 'New anomaly detected: 50 failed logins in 5 minutes',
        created_by_user_id: USER_ID,
        created_at: NOW,
      };
      mockPrisma.securityIncidentEvent.create.mockResolvedValue(evidenceEvent);

      const result = await service.findOrCreateForAnomaly(
        'brute_force',
        'high',
        'New anomaly detected: 50 failed logins in 5 minutes',
        [TENANT_ID_A],
        USER_ID,
      );

      expect(result.id).toBe(INCIDENT_ID);
      expect(result.status).toBe('investigating');

      // Should NOT create a new incident
      expect(mockPrisma.securityIncident.create).not.toHaveBeenCalled();

      // Should add evidence event
      expect(mockPrisma.securityIncidentEvent.create).toHaveBeenCalledWith({
        data: {
          incident_id: INCIDENT_ID,
          event_type: 'evidence',
          description: 'New anomaly detected: 50 failed logins in 5 minutes',
          created_by_user_id: USER_ID,
        },
      });

      // Should NOT audit log (dedup path is silent)
      expect(mockAuditLog.write).not.toHaveBeenCalled();
    });

    it('should create new incident when none exists', async () => {
      mockPrisma.securityIncident.findFirst.mockResolvedValue(null);

      const createdIncident = {
        ...buildBaseIncident({
          incident_type: 'data_exfiltration',
          severity: 'critical',
          description: 'Bulk data export detected outside business hours',
          affected_tenants: [TENANT_ID_A, TENANT_ID_B],
        }),
        events: [
          {
            id: EVENT_ID,
            incident_id: INCIDENT_ID,
            event_type: 'status_change',
            description: 'Incident auto-detected by anomaly scan',
            created_by_user_id: USER_ID,
            created_at: NOW,
          },
        ],
      };
      mockPrisma.securityIncident.create.mockResolvedValue(createdIncident);

      const result = await service.findOrCreateForAnomaly(
        'data_exfiltration',
        'critical',
        'Bulk data export detected outside business hours',
        [TENANT_ID_A, TENANT_ID_B],
        USER_ID,
      );

      expect(result.id).toBe(INCIDENT_ID);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test assertion on Prisma include result
      expect((result as any).events).toHaveLength(1);

      // Should NOT add evidence event to existing
      expect(mockPrisma.securityIncidentEvent.create).not.toHaveBeenCalled();

      // Should create with nested event
      const createCall = mockPrisma.securityIncident.create.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(createCall.data).toMatchObject({
        severity: 'critical',
        incident_type: 'data_exfiltration',
        status: 'detected',
        affected_tenants: [TENANT_ID_A, TENANT_ID_B],
      });

      // Should audit log the new creation
      expect(mockAuditLog.write).toHaveBeenCalledWith(
        null,
        USER_ID,
        'security_incident',
        INCIDENT_ID,
        'incident_auto_created',
        expect.objectContaining({
          severity: 'critical',
          incident_type: 'data_exfiltration',
          affected_tenants: [TENANT_ID_A, TENANT_ID_B],
        }),
        null,
      );
    });

    it('should not match resolved or closed incidents for deduplication', async () => {
      mockPrisma.securityIncident.findFirst.mockResolvedValue(null);

      const createdIncident = {
        ...buildBaseIncident({ incident_type: 'auth_spike' }),
        events: [
          {
            id: EVENT_ID,
            incident_id: INCIDENT_ID,
            event_type: 'status_change',
            description: 'Incident auto-detected by anomaly scan',
            created_by_user_id: USER_ID,
            created_at: NOW,
          },
        ],
      };
      mockPrisma.securityIncident.create.mockResolvedValue(createdIncident);

      await service.findOrCreateForAnomaly(
        'auth_spike',
        'medium',
        'Authentication spike detected',
        [TENANT_ID_A],
        USER_ID,
      );

      // Verify the findFirst query excludes resolved and closed
      const findFirstCall = mockPrisma.securityIncident.findFirst.mock.calls[0][0] as {
        where: { status: { notIn: string[] } };
      };
      expect(findFirstCall.where.status.notIn).toEqual(
        expect.arrayContaining(['resolved', 'closed']),
      );
    });
  });
});
