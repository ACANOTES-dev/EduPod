/**
 * Wire shapes for the snapshots list / detail / publish surface.
 *
 * Mirrors `SnapshotSummary` and `SnapshotWithSignedUrls` from
 * apps/api/src/modules/budgeting/snapshots/snapshots.types.ts. The list
 * endpoint returns `SnapshotSummary` rows; the detail endpoint adds a
 * full `payload` plus pre-signed PDF / Excel URLs.
 *
 * Render status is derived (not transmitted): if `pdf_object_key` is
 * null AND `rendered_at` is null, the worker is still rendering; once
 * `pdf_object_key` lands, treat the artefact as ready. There is no
 * explicit "failed" status — a 5-minute pending heuristic is what we
 * surface to the UI.
 */

import type { SnapshotPayload } from '@school/shared/budgeting';

export interface SnapshotSummary {
  id: string;
  parent_model_id: string;
  version_number: number;
  executive_summary: string | null;
  /** ISO timestamp */
  published_at: string;
  /** User id of the publisher (the name lives in payload.published_by). */
  published_by: string;
  pdf_object_key: string | null;
  excel_object_key: string | null;
  rendered_at: string | null;
}

export interface SnapshotDetail extends SnapshotSummary {
  payload: SnapshotPayload;
  pdf_signed_url: string | null;
  excel_signed_url: string | null;
}

export type RenderStatus = 'pending' | 'ready' | 'failed';

const FAILED_AFTER_MS = 5 * 60 * 1000;

/**
 * Derive the render status from the wire fields. We don't have an
 * explicit `failed` enum on the row — falling back to a 5-minute
 * heuristic so a stuck render at least doesn't read as "still working"
 * forever.
 */
export function deriveRenderStatus(objectKey: string | null, publishedAt: string): RenderStatus {
  if (objectKey) return 'ready';
  const elapsed = Date.now() - new Date(publishedAt).getTime();
  if (elapsed > FAILED_AFTER_MS) return 'failed';
  return 'pending';
}
