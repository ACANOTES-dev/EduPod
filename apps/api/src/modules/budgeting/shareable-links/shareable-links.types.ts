/**
 * Internal API-side response shapes for the shareable-links surface.
 *
 * The DTO + Zod schemas (`createShareableLinkSchema`,
 * `CreateShareableLinkDto`, `shareableLinkSummarySchema`) live in
 * `@school/shared/budgeting` and were shipped by impl 01. Phase 11
 * imports them and adds the wire shapes that the controllers return.
 */

export interface CreateLinkResponse {
  id: string;
  token: string;
  full_url: string;
  expires_at: string;
}

export interface ListLinksResponseRow {
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

export interface ListLinksResponse {
  data: ListLinksResponseRow[];
}

/**
 * Public payload returned by the unauthenticated resolver. The
 * `payload` field is a sanitised projection of `financial_model_snapshots.payload`
 * with PII (households / students / staff salaries / per-row source
 * arrays / line-item `computed_from`) stripped — see
 * {@link filterPayloadForPublic}.
 */
export interface PublicShareResponse {
  tenant_name: string;
  currency_code: string;
  model_id: string;
  model_name: string;
  version_number: number;
  published_at: string;
  fiscal_year_label: string;
  payload: Record<string, unknown>;
}
