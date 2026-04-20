/**
 * Pure citation-extraction helpers for the AI NL query page (impl 19).
 *
 * The backend's structured_data payload can carry citations in two shapes:
 * - As `{ citations: [{ type, id, label? }, ...] }` on the top-level object
 * - As a flat array under `data_payload.incidents` / `data_payload.students`
 *
 * For impl 19 we only surface the explicit `citations` array, and map each
 * entry to a `{ href, label }` pair the page can render as a link. The
 * backend has already filtered to rows the user can access (impl 05), so
 * the frontend trusts the list and does not re-gate.
 */

export interface Citation {
  href: string;
  label: string;
}

export function extractCitations(structured: unknown): Citation[] {
  if (!structured || typeof structured !== 'object') return [];
  const raw = (structured as { citations?: unknown }).citations;
  if (!Array.isArray(raw)) return [];

  const out: Citation[] = [];
  for (const entry of raw) {
    const mapped = mapEntry(entry);
    if (mapped) out.push(mapped);
  }
  return out;
}

function mapEntry(entry: unknown): Citation | null {
  if (!entry || typeof entry !== 'object') return null;
  const obj = entry as { type?: string; id?: string; label?: string };
  if (typeof obj.type !== 'string' || typeof obj.id !== 'string') return null;

  const label = typeof obj.label === 'string' && obj.label.trim() ? obj.label : obj.id;
  const href = hrefFor(obj.type, obj.id);
  if (!href) return null;
  return { href, label };
}

function hrefFor(type: string, id: string): string | null {
  switch (type) {
    case 'incident':
      return `/behaviour/incidents/${id}`;
    case 'student':
      return `/behaviour/students/${id}`;
    case 'task':
      return `/behaviour/tasks/${id}`;
    case 'sanction':
      return `/behaviour/sanctions/${id}`;
    case 'intervention':
      return `/behaviour/interventions/${id}`;
    case 'concern':
      return `/pastoral/concerns/${id}`;
    default:
      return null;
  }
}
