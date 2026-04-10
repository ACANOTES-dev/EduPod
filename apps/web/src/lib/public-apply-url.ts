// ─── Public admissions apply URL helper ──────────────────────────────────────
//
// Single source of truth for building the public URL a parent visits to submit
// an online admission application. Consumed by the admin form-preview page
// (impl 13) and the public apply route (impl 14). Keep both callers in sync:
// a URL mismatch between the preview / QR code and the actual landing route
// will silently 404 for parents.
//
// Pattern: `https://<host>/<locale>/apply/<tenant_slug>`
//
// `host` is resolved from `window.location.host` at call time so the URL
// naturally follows the tenant's custom domain (e.g. `nhqs.edupod.app`) or
// falls back to whatever host the admin is using right now. SSR callers
// should pass an explicit host.

const FALLBACK_HOST = 'edupod.app';

export interface BuildPublicApplyUrlInput {
  tenantSlug: string;
  locale: string;
  /** Browser host (defaults to `window.location.host`). Pass explicitly for SSR. */
  host?: string;
  /** Protocol (defaults to `window.location.protocol` or `https:`). */
  protocol?: string;
}

export function buildPublicApplyUrl(input: BuildPublicApplyUrlInput): string {
  const host =
    input.host ??
    (typeof window !== 'undefined' && window.location?.host ? window.location.host : FALLBACK_HOST);
  const protocol =
    input.protocol ??
    (typeof window !== 'undefined' && window.location?.protocol
      ? window.location.protocol
      : 'https:');

  const safeLocale = input.locale.trim() || 'en';
  const safeSlug = input.tenantSlug.trim();
  return `${protocol}//${host}/${safeLocale}/apply/${encodeURIComponent(safeSlug)}`;
}
