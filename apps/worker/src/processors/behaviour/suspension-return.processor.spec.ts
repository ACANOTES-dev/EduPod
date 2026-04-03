import { PrismaClient } from '@prisma/client';

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SANCTION_ID_1 = 'sanction-1';
const STUDENT_ID = 'student-1';
const SUPERVISOR_ID = 'supervisor-1';
const PRINCIPAL_ID = 'principal-1';

// ─── Mock the addSchoolDays import ────────────────────────────────────────────

const mockAddSchoolDays = jest.fn();

jest.mock('@school/shared/behaviour', () => ({
  addSchoolDays: (...args: unknown[]) => mockAddSchoolDays(...args),
}));

// Import AFTER the mock so the module picks up the mocked version
// eslint-disable-next-line import/order
import {
  BehaviourSuspensionReturnProcessor,
  BEHAVIOUR_SUSPENSION_RETURN_JOB,
} from './suspension-return.processor';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildMockTx() {
  return {
    schoolClosure: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    behaviourSanction: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    behaviourTask: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'task-1' }),
    },
    student: {
      findFirst: jest.fn().mockResolvedValue({ id: STUDENT_ID, year_group_id: 'yg-1' }),
    },
    tenantMembership: {
      findFirst: jest.fn().mockResolvedValue({ user_id: PRINCIPAL_ID }),
    },
    $executeRaw: jest.fn().mockResolvedValue(undefined),
  };
}

function buildMockPrisma(mockTx: ReturnType<typeof buildMockTx>) {
  return {
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
  } as unknown as PrismaClient;
}

function buildSanction(overrides?: Record<string, unknown>) {
  return {
    id: SANCTION_ID_1,
    tenant_id: TENANT_ID,
    status: 'scheduled',
    type: 'suspension_external',
    suspension_end_date: new Date('2026-04-03T00:00:00.000Z'),
    supervised_by_id: SUPERVISOR_ID,
    student_id: STUDENT_ID,
    retention_status: 'active',
    student: { id: STUDENT_ID, first_name: 'John', last_name: 'Smith' },
    ...overrides,
  };
}

function buildJob(name: string) {
  return {
    name,
    data: { tenant_id: TENANT_ID },
  };
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('BehaviourSuspensionReturnProcessor', () => {
  let processor: BehaviourSuspensionReturnProcessor;
  let mockTx: ReturnType<typeof buildMockTx>;

  beforeEach(() => {
    mockTx = buildMockTx();
    const mockPrisma = buildMockPrisma(mockTx);

    processor = new BehaviourSuspensionReturnProcessor(mockPrisma);

    // Default: addSchoolDays returns a date 3 days from now
    mockAddSchoolDays.mockResolvedValue(new Date('2026-04-03'));
  });

  afterEach(() => jest.clearAllMocks());

  it('should create return_check_in task 3 school days before suspension_end_date', async () => {
    const sanction = buildSanction();
    mockTx.behaviourSanction.findMany.mockResolvedValue([sanction]);
    mockTx.behaviourTask.findFirst.mockResolvedValue(null);

    await processor.process(buildJob(BEHAVIOUR_SUSPENSION_RETURN_JOB) as never);

    expect(mockTx.behaviourTask.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenant_id: TENANT_ID,
        task_type: 'return_check_in',
        entity_type: 'sanction',
        entity_id: SANCTION_ID_1,
        priority: 'high',
        status: 'pending',
      }),
    });
  });

  it('should not create duplicate task if one already exists for the sanction', async () => {
    const sanction = buildSanction();
    mockTx.behaviourSanction.findMany.mockResolvedValue([sanction]);
    mockTx.behaviourTask.findFirst.mockResolvedValue({
      id: 'existing-task',
      task_type: 'return_check_in',
      entity_id: SANCTION_ID_1,
      status: 'pending',
    });

    await processor.process(buildJob(BEHAVIOUR_SUSPENSION_RETURN_JOB) as never);

    expect(mockTx.behaviourTask.create).not.toHaveBeenCalled();
  });

  it('should skip school_closures when counting 3 school days', async () => {
    // addSchoolDays is called with 3 days and a closure checker;
    // the closure checker queries schoolClosure — verify it is wired correctly
    mockTx.behaviourSanction.findMany.mockResolvedValue([]);

    await processor.process(buildJob(BEHAVIOUR_SUSPENSION_RETURN_JOB) as never);

    // addSchoolDays should have been called with (now, 3, closureChecker)
    expect(mockAddSchoolDays).toHaveBeenCalledWith(
      expect.any(Date),
      3,
      expect.any(Function),
    );
  });

  it('should fall back to principal if supervised_by_id is null', async () => {
    const sanction = buildSanction({ supervised_by_id: null });
    mockTx.behaviourSanction.findMany.mockResolvedValue([sanction]);
    mockTx.behaviourTask.findFirst.mockResolvedValue(null);
    mockTx.tenantMembership.findFirst.mockResolvedValue({ user_id: PRINCIPAL_ID });

    await processor.process(buildJob(BEHAVIOUR_SUSPENSION_RETURN_JOB) as never);

    expect(mockTx.behaviourTask.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        assigned_to_id: PRINCIPAL_ID,
      }),
    });
  });

  it('should fall back to student ID when principal also not found', async () => {
    const sanction = buildSanction({ supervised_by_id: null });
    mockTx.behaviourSanction.findMany.mockResolvedValue([sanction]);
    mockTx.behaviourTask.findFirst.mockResolvedValue(null);
    mockTx.student.findFirst.mockResolvedValue({ id: STUDENT_ID, year_group_id: null });
    mockTx.tenantMembership.findFirst.mockResolvedValue(null);

    await processor.process(buildJob(BEHAVIOUR_SUSPENSION_RETURN_JOB) as never);

    // Last resort fallback: student ID used as assignee
    expect(mockTx.behaviourTask.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        assigned_to_id: STUDENT_ID,
      }),
    });
  });
});
