import { z } from 'zod';

/**
 * Shareable-link DTOs for the budgeting module's public read-only
 * snapshot route. The full implementation ships in Wave 3 impl 11
 * (`shareable-links.service.ts`) and Wave 4 impls 19 / 20.
 *
 * Phase 01 ships these schemas so impl 11 / 19 / 20 can import them
 * without re-declaration. The persisted shape lives in the Prisma
 * `ShareableLink` model; these DTOs cover the create / list / revoke
 * action surface.
 *
 * See modeling/PLAN.md §11.2.
 */

// ─── Allowed expiry windows (modal "7 / 14 / 30 / 90 days") ────────────────

export const SHAREABLE_LINK_EXPIRY_DAYS = [7, 14, 30, 90] as const;
export type ShareableLinkExpiryDays = (typeof SHAREABLE_LINK_EXPIRY_DAYS)[number];

export const shareableLinkExpiryDaysSchema = z.union([
  z.literal(7),
  z.literal(14),
  z.literal(30),
  z.literal(90),
]);

// ─── Create ────────────────────────────────────────────────────────────────

/**
 * Body for POST /api/v1/budgeting/snapshots/:id/shareable-links.
 *
 *  - `parent_snapshot_id` is supplied via the URL, not the body.
 *  - `password` is plaintext on the wire and bcrypt-hashed on save
 *    (column: `password_hash VARCHAR(255)`). Optional.
 *  - `scenarios_visible` lists the scenario keys (or 'base') the
 *    recipient may toggle on the public page; base is always visible
 *    even if omitted.
 */
export const createShareableLinkSchema = z
  .object({
    expires_in_days: shareableLinkExpiryDaysSchema,
    password: z.string().min(6).max(128).optional(),
    scenarios_visible: z.array(z.string().min(1)).default(['base']),
  })
  .strict();

export type CreateShareableLinkDto = z.infer<typeof createShareableLinkSchema>;

// ─── List ──────────────────────────────────────────────────────────────────

/**
 * Public-facing shape for a single shareable-link row (admin list view).
 * Excludes `password_hash` — never returned over the wire.
 */
export const shareableLinkSummarySchema = z.object({
  id: z.string().uuid(),
  token: z.string().uuid(),
  parent_model_id: z.string().uuid(),
  parent_snapshot_id: z.string().uuid(),
  expires_at: z.string().datetime(),
  has_password: z.boolean(),
  scenarios_visible: z.array(z.string()),
  view_count: z.number().int().nonnegative(),
  last_viewed_at: z.string().datetime().nullable(),
  revoked_at: z.string().datetime().nullable(),
  created_by: z.string().uuid(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type ShareableLinkSummary = z.infer<typeof shareableLinkSummarySchema>;

// ─── Revoke ────────────────────────────────────────────────────────────────

/**
 * Body for POST /api/v1/budgeting/shareable-links/:id/revoke.
 *
 * No fields today; revoke is intentionally body-less so a future audit
 * reason can be added without a breaking change. Existing callers that
 * send `{}` keep working when the field arrives.
 */
export const revokeShareableLinkSchema = z.object({}).strict();

export type RevokeShareableLinkDto = z.infer<typeof revokeShareableLinkSchema>;
