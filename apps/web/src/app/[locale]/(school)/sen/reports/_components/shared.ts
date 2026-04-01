// ─── Shared helpers for sen/reports tab components ────────────────────────────

export const CHART_COLORS = [
  '#0f766e',
  '#2563eb',
  '#d97706',
  '#dc2626',
  '#7c3aed',
  '#0891b2',
  '#65a30d',
  '#be185d',
];

export function formatDateShort(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-IE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function humanise(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}
