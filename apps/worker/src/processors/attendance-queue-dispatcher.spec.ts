import { Job } from 'bullmq';

import {
  ATTENDANCE_AUTO_LOCK_JOB,
  AttendanceAutoLockProcessor,
} from './attendance-auto-lock.processor';
import {
  ATTENDANCE_CRON_DISPATCH_GENERATE_JOB,
  ATTENDANCE_CRON_DISPATCH_LOCK_JOB,
  ATTENDANCE_CRON_DISPATCH_PATTERNS_JOB,
  ATTENDANCE_CRON_DISPATCH_PENDING_JOB,
  AttendanceCronDispatchProcessor,
} from './attendance-cron-dispatch.processor';
import {
  ATTENDANCE_DETECT_PATTERNS_JOB,
  AttendancePatternDetectionProcessor,
} from './attendance-pattern-detection.processor';
import {
  ATTENDANCE_DETECT_PENDING_JOB,
  AttendancePendingDetectionProcessor,
} from './attendance-pending-detection.processor';
import { AttendanceQueueDispatcher } from './attendance-queue-dispatcher';
import {
  ATTENDANCE_GENERATE_SESSIONS_JOB,
  AttendanceSessionGenerationProcessor,
} from './attendance-session-generation.processor';

describe('AttendanceQueueDispatcher', () => {
  function buildDispatcher() {
    const sessionGeneration = {
      process: jest.fn(),
    } as unknown as AttendanceSessionGenerationProcessor;
    const autoLock = { process: jest.fn() } as unknown as AttendanceAutoLockProcessor;
    const patternDetection = {
      process: jest.fn(),
    } as unknown as AttendancePatternDetectionProcessor;
    const pendingDetection = {
      process: jest.fn(),
    } as unknown as AttendancePendingDetectionProcessor;
    const cronDispatch = { process: jest.fn() } as unknown as AttendanceCronDispatchProcessor;

    const dispatcher = new AttendanceQueueDispatcher(
      sessionGeneration,
      autoLock,
      patternDetection,
      pendingDetection,
      cronDispatch,
    );

    return {
      dispatcher,
      sessionGeneration,
      autoLock,
      patternDetection,
      pendingDetection,
      cronDispatch,
    };
  }

  it.each([
    [ATTENDANCE_GENERATE_SESSIONS_JOB, 'sessionGeneration'],
    [ATTENDANCE_AUTO_LOCK_JOB, 'autoLock'],
    [ATTENDANCE_DETECT_PATTERNS_JOB, 'patternDetection'],
    [ATTENDANCE_DETECT_PENDING_JOB, 'pendingDetection'],
    [ATTENDANCE_CRON_DISPATCH_GENERATE_JOB, 'cronDispatch'],
    [ATTENDANCE_CRON_DISPATCH_LOCK_JOB, 'cronDispatch'],
    [ATTENDANCE_CRON_DISPATCH_PATTERNS_JOB, 'cronDispatch'],
    [ATTENDANCE_CRON_DISPATCH_PENDING_JOB, 'cronDispatch'],
  ])('routes %s to the %s processor', async (jobName, expectedTarget) => {
    const harness = buildDispatcher();
    const job = { name: jobName, data: { tenant_id: 't1' } } as Job;

    await harness.dispatcher.process(job);

    const targets = [
      'sessionGeneration',
      'autoLock',
      'patternDetection',
      'pendingDetection',
      'cronDispatch',
    ] as const;
    for (const key of targets) {
      const expected = key === expectedTarget ? 1 : 0;
      expect(harness[key].process).toHaveBeenCalledTimes(expected);
    }
  });

  it('throws loudly on unknown job names', async () => {
    const { dispatcher } = buildDispatcher();
    const job = { name: 'attendance:unknown', data: {} } as Job;

    await expect(dispatcher.process(job)).rejects.toThrow(
      'No handler registered for attendance job "attendance:unknown"',
    );
  });
});
