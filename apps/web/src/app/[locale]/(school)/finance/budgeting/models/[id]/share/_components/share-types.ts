/**
 * Wire shapes for the shareable-links surface (impl 19 frontend).
 *
 * Mirrors `ListLinksResponseRow` and `CreateLinkResponse` from
 * apps/api/src/modules/budgeting/shareable-links/shareable-links.types.ts.
 * The backend was shipped in impl 11; this file pins the wire contract on
 * the client side without taking a runtime dep on the Nest types.
 */

export interface ShareableLinkRow {
  id: string;
  token: string;
  full_url: string;
  expires_at: string;
  revoked_at: string | null;
  view_count: number;
  last_viewed_at: string | null;
  scenarios_visible: string[];
  has_password: boolean;
  created_at: string;
  created_by: string;
}

export interface CreateLinkResponse {
  id: string;
  token: string;
  full_url: string;
  expires_at: string;
}

export type LinkLifecycleState = 'active' | 'expired' | 'revoked';

export function deriveLifecycle(link: ShareableLinkRow): LinkLifecycleState {
  if (link.revoked_at) return 'revoked';
  if (new Date(link.expires_at) < new Date()) return 'expired';
  return 'active';
}

export function isLinkActive(link: ShareableLinkRow): boolean {
  return deriveLifecycle(link) === 'active';
}
