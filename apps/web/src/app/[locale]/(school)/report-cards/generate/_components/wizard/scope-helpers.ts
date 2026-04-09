// ─── Wizard scope helpers ────────────────────────────────────────────────────
// Shared utilities for converting the wizard's flat (mode, ids[]) state into
// the shape the backend's discriminated scope schema expects.

import type { GenerationScope, GenerationScopeMode } from '@school/shared';

export function buildScopePayload(mode: GenerationScopeMode, ids: string[]): GenerationScope {
  if (mode === 'year_group') {
    return { mode: 'year_group', year_group_ids: ids };
  }
  if (mode === 'class') {
    return { mode: 'class', class_ids: ids };
  }
  return { mode: 'individual', student_ids: ids };
}
