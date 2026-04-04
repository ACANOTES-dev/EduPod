import { getQueueToken } from '@nestjs/bullmq';
import { Test, type TestingModule } from '@nestjs/testing';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';

import {
  CRITICAL_ESCALATION_JOB,
  type CriticalEscalationPayload,
  CriticalEscalationProcessor,
} from './critical-escalation.processor';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CONCERN_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const REPORTED_BY_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const DLP_USER_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const DEPUTY_USER_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const FALLBACK_USER_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

interface BuildMockTxOptions {
  concernStatus?: 'acknowledged' | 'reported' | 'resolved';
  dlpFallbackChain?: string[];
  includeDeputy?: boolean;
  includeDlp?: boolean;
  missingConcern?: boolean;
}

function buildJob(
  name: string,
  data: Partial<CriticalEscalationPayload> = {},
): Job<CriticalEscalationPayload> {
  return {
    data: {
      concern_id: CONCERN_ID,
      escalation_step: 0,
      tenant_id: TENANT_ID,
      ...data,
    },
    name,
  } as Job<CriticalEscalationPayload>;
}

function buildMockTx(options: BuildMockTxOptions = {}) {
  const concern = options.missingConcern
    ? null
    : {
        concern_type: 'neglect',
        created_at: new Date('2026-04-01T08:00:00.000Z'),
        id: CONCERN_ID,
        reported_by_id: REPORTED_BY_ID,
        status: options.concernStatus ?? 'reported',
        tenant_id: TENANT_ID,
      };

  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    notification: {
      create: jest.fn().mockResolvedValue({ id: 'notification-id' }),
    },
    safeguardingAction: {
      create: jest.fn().mockResolvedValue({ id: 'action-id' }),
    },
    safeguardingConcern: {
      findFirst: jest.fn().mockResolvedValue(concern),
    },
    tenantSetting: {
      findFirst: jest.fn().mockResolvedValue({
        settings: {
          behaviour: {
            deputy_designated_liaison_user_id:
              options.includeDeputy === false ? null : DEPUTY_USER_ID,
            designated_liaison_user_id: options.includeDlp === false ? null : DLP_USER_ID,
            dlp_fallback_chain: options.dlpFallbackChain ?? [FALLBACK_USER_ID],
          },
        },
      }),
    },
  };

  return { concern, tx };
}

function buildMockPrisma(tx: ReturnType<typeof buildMockTx>['tx']) {
  return {
    $transaction: jest.fn(async (callback: (transactionClient: typeof tx) => Promise<unknown>) =>
      callback(tx),
    ),
  };
}

async function setup(options: BuildMockTxOptions = {}) {
  const { concern, tx } = buildMockTx(options);
  const behaviourQueue = {
    add: jest.fn().mockResolvedValue({ id: 'queued-escalation-id' }),
  };
  const mockPrisma = buildMockPrisma(tx);

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      CriticalEscalationProcessor,
      { provide: 'PRISMA_CLIENT', useValue: mockPrisma },
      {
        provide: getQueueToken(QUEUE_NAMES.BEHAVIOUR),
        useValue: behaviourQueue,
      },
    ],
  }).compile();

  return {
    behaviourQueue,
    concern,
    module,
    processor: module.get(CriticalEscalationProcessor),
    tx,
  };
}

describe('CriticalEscalationProcessor', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should ignore jobs with a different name', async () => {
    const { module, processor, tx } = await setup();

    await processor.process(buildJob('behaviour:some-other-job'));

    expect(tx.safeguardingConcern.findFirst).not.toHaveBeenCalled();
    await module.close();
  });

  it('should reject jobs without tenant_id', async () => {
    const { module, processor } = await setup();

    await expect(
      processor.process(buildJob(CRITICAL_ESCALATION_JOB, { tenant_id: undefined })),
    ).rejects.toThrow('missing tenant_id');

    await module.close();
  });

  it('should notify the designated liaison and re-enqueue the next escalation step', async () => {
    const { behaviourQueue, module, processor, tx } = await setup();

    await processor.process(buildJob(CRITICAL_ESCALATION_JOB));

    expect(tx.safeguardingAction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action_by_id: DLP_USER_ID,
        concern_id: CONCERN_ID,
        description: `Critical escalation step 0 — notified user ${DLP_USER_ID}`,
        tenant_id: TENANT_ID,
      }),
    });

    expect(tx.notification.create).toHaveBeenCalledTimes(2);
    expect(
      tx.notification.create.mock.calls.map(
        (call) => (call[0] as { data: { channel: string } }).data.channel,
      ),
    ).toEqual(['in_app', 'email']);

    expect(behaviourQueue.add).toHaveBeenCalledWith(
      CRITICAL_ESCALATION_JOB,
      {
        concern_id: CONCERN_ID,
        escalation_step: 1,
        tenant_id: TENANT_ID,
      },
      {
        delay: 30 * 60 * 1000,
        jobId: `critical-esc-${CONCERN_ID}-step-1`,
      },
    );

    await module.close();
  });

  it('should target later users in the fallback chain based on escalation_step', async () => {
    const { behaviourQueue, module, processor, tx } = await setup();

    await processor.process(buildJob(CRITICAL_ESCALATION_JOB, { escalation_step: 2 }));

    expect(tx.safeguardingAction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action_by_id: FALLBACK_USER_ID,
        description: `Critical escalation step 2 — notified user ${FALLBACK_USER_ID}`,
      }),
    });
    expect(behaviourQueue.add).not.toHaveBeenCalled();

    await module.close();
  });

  it('should terminate the escalation chain when the concern is no longer reported', async () => {
    const { behaviourQueue, module, processor, tx } = await setup({
      concernStatus: 'acknowledged',
    });

    await processor.process(buildJob(CRITICAL_ESCALATION_JOB));

    expect(tx.safeguardingAction.create).not.toHaveBeenCalled();
    expect(tx.notification.create).not.toHaveBeenCalled();
    expect(behaviourQueue.add).not.toHaveBeenCalled();

    await module.close();
  });

  it('should record a manual-intervention note when the escalation chain is exhausted', async () => {
    const { behaviourQueue, module, processor, tx } = await setup({
      dlpFallbackChain: [],
      includeDeputy: false,
      includeDlp: true,
    });

    await processor.process(buildJob(CRITICAL_ESCALATION_JOB, { escalation_step: 1 }));

    expect(tx.safeguardingAction.create).toHaveBeenCalledWith({
      data: {
        action_by_id: DLP_USER_ID,
        action_type: 'note_added',
        concern_id: CONCERN_ID,
        description:
          'Critical escalation chain exhausted at step 1. No further contacts available. Manual intervention required.',
        tenant_id: TENANT_ID,
      },
    });
    expect(tx.notification.create).not.toHaveBeenCalled();
    expect(behaviourQueue.add).not.toHaveBeenCalled();

    await module.close();
  });

  it('should skip cleanly when the concern cannot be found', async () => {
    const { behaviourQueue, module, processor, tx } = await setup({
      missingConcern: true,
    });

    await processor.process(buildJob(CRITICAL_ESCALATION_JOB));

    expect(tx.safeguardingAction.create).not.toHaveBeenCalled();
    expect(tx.notification.create).not.toHaveBeenCalled();
    expect(behaviourQueue.add).not.toHaveBeenCalled();

    await module.close();
  });
});
