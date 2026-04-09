import type { ReportCardRenderPayload } from '@school/shared';

/**
 * Contract between the generation processor and whatever renderer is bound at
 * DI time. Impl 04 ships a placeholder implementation so the worker pipeline
 * can be exercised end-to-end; impl 11 will swap in the production React-PDF
 * templates without touching the processor.
 */
export interface ReportCardRenderer {
  render(payload: ReportCardRenderPayload): Promise<Buffer>;
}

/**
 * Injection token for the renderer. Bound in `worker.module.ts` to a concrete
 * implementation (placeholder today, production later).
 */
export const REPORT_CARD_RENDERER_TOKEN = 'REPORT_CARD_RENDERER';
