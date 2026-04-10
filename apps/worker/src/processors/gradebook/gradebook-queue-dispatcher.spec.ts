import { Job } from 'bullmq';

import { BULK_IMPORT_PROCESS_JOB } from './bulk-import.processor';
import { GradebookQueueDispatcher } from './gradebook-queue-dispatcher';
import { GRADEBOOK_DETECT_RISKS_JOB } from './gradebook-risk-detection.processor';
import { MASS_REPORT_CARD_PDF_JOB } from './mass-report-card-pdf.processor';
import { REPORT_CARD_AUTO_GENERATE_JOB } from './report-card-auto-generate.processor';
import { REPORT_CARD_GENERATION_JOB } from './report-card-generation.processor';

// ─── Test doubles ────────────────────────────────────────────────────────────

function buildMockProcessor() {
  return { process: jest.fn().mockResolvedValue(undefined) };
}

function buildJob(name: string): Job {
  return { id: 'job-1', name, data: {} } as unknown as Job;
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('GradebookQueueDispatcher', () => {
  afterEach(() => jest.clearAllMocks());

  it('routes report-cards:generate to ReportCardGenerationProcessor only', async () => {
    const rcGen = buildMockProcessor();
    const rcAuto = buildMockProcessor();
    const massPdf = buildMockProcessor();
    const bulkImport = buildMockProcessor();
    const riskDetect = buildMockProcessor();

    const dispatcher = new GradebookQueueDispatcher(
      rcGen as never,
      rcAuto as never,
      massPdf as never,
      bulkImport as never,
      riskDetect as never,
    );

    const job = buildJob(REPORT_CARD_GENERATION_JOB);
    await dispatcher.process(job);

    expect(rcGen.process).toHaveBeenCalledWith(job);
    expect(rcAuto.process).not.toHaveBeenCalled();
    expect(massPdf.process).not.toHaveBeenCalled();
    expect(bulkImport.process).not.toHaveBeenCalled();
    expect(riskDetect.process).not.toHaveBeenCalled();
  });

  it.each([
    [REPORT_CARD_AUTO_GENERATE_JOB, 'rcAuto'],
    [MASS_REPORT_CARD_PDF_JOB, 'massPdf'],
    [BULK_IMPORT_PROCESS_JOB, 'bulkImport'],
    [GRADEBOOK_DETECT_RISKS_JOB, 'riskDetect'],
  ])('routes %s to the matching processor', async (jobName, targetKey) => {
    const processors = {
      rcGen: buildMockProcessor(),
      rcAuto: buildMockProcessor(),
      massPdf: buildMockProcessor(),
      bulkImport: buildMockProcessor(),
      riskDetect: buildMockProcessor(),
    };

    const dispatcher = new GradebookQueueDispatcher(
      processors.rcGen as never,
      processors.rcAuto as never,
      processors.massPdf as never,
      processors.bulkImport as never,
      processors.riskDetect as never,
    );

    const job = buildJob(jobName);
    await dispatcher.process(job);

    for (const [key, proc] of Object.entries(processors)) {
      if (key === targetKey) {
        expect(proc.process).toHaveBeenCalledWith(job);
      } else {
        expect(proc.process).not.toHaveBeenCalled();
      }
    }
  });

  it('throws on an unknown job name so BullMQ retries instead of silently completing', async () => {
    const dispatcher = new GradebookQueueDispatcher(
      buildMockProcessor() as never,
      buildMockProcessor() as never,
      buildMockProcessor() as never,
      buildMockProcessor() as never,
      buildMockProcessor() as never,
    );

    await expect(dispatcher.process(buildJob('gradebook:unknown'))).rejects.toThrow(
      'No handler registered for gradebook job "gradebook:unknown"',
    );
  });
});
