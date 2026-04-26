# Implementation 13 — Form Preview Page

> **Wave:** 4 (parallelizable with 10, 11, 12, 14)
> **Depends on:** 01, 04
> **Deploys:** Web restart only

---

## Goal

Build a read-only preview of the single system admission form, plus the public URL and downloadable QR code the school can put on posters or their website. Replaces the old `/admissions/forms/*` area which is deleted in impl 15.

## What the page shows

### 1. Header

- `PageHeader` with title "Admission Form" and description "This is the form parents see when they apply online. It mirrors the walk-in registration wizard — one source of truth."

### 2. Public link panel

- Section titled "Public link" with:
  - The resolved public URL for the tenant, e.g. `https://apply.<tenant-domain>/<locale>/apply/<tenant-slug>`.
  - "Copy link" button — copies to clipboard, shows toast.
  - "Download QR code" button — triggers a PNG download.
  - QR code is rendered inline at 256×256 with the school logo embedded in the centre (or without logo if not configured).
  - Optional: "Email myself this link" button that sends the URL + QR to the current admin's email — low priority, skip if time-constrained.

### 3. Form preview panel

- Section titled "Form fields" showing every field in the canonical system form, rendered read-only with its label, type, required flag, and help text.
- Use the existing `DynamicFormRenderer` in read-only mode. Feed it the fields from `GET /v1/admission-forms/system`.
- Grouped visually into the sections the walk-in wizard uses (Parent, Household, Student) — read the `display_order` + section hints from the field list.
- A disabled "Submit" button at the bottom so the admin can see what the parent will see.

### 4. Rebuild button

- Small section at the bottom: "Need to refresh the form from the wizard?" with a **Rebuild Form** button (admin role only).
- Button calls `POST /v1/admission-forms/system/rebuild`. On success, toast "Form rebuilt from the latest wizard field set." Then re-fetches the form.
- Disabled by default with explanatory text: "Use this only after the wizard field configuration has changed. Existing applications keep their original form reference."

## QR code generation

Use a lightweight QR library. Options:

- `qrcode.react` — React component, renders to SVG or canvas. Download as PNG by canvas-to-blob.
- `qr-code-styling` — supports logo embedding, cleaner API.

Pick one and install it in `apps/web` only (not root). Keep the bundle impact minimal.

Generation happens **client-side** — no backend QR endpoint needed. The URL is constructed on the frontend from the tenant slug + locale + public apply route.

## Public URL resolution

The public URL pattern is:

```
https://<tenant_public_domain>/<locale>/apply/<tenant_slug>
```

- `tenant_public_domain` — the tenant's custom domain, if configured (e.g. `nhqs.edupod.app`), otherwise `edupod.app`.
- `tenant_slug` — needs a new `slug` column on the `Tenant` model if one doesn't already exist. If not, use `tenant_id` for now and add the slug column in a later follow-up migration.
- The page reads the tenant's domain and slug from the current auth context or a small `GET /v1/tenants/me/public-config` endpoint that returns `{ domain, slug }`.

**Coordinate with impl 14** — both this page and impl 14 need the same URL resolution helper. Extract a shared function `getPublicApplyUrl(tenant, locale)` in a shared location.

## Role gates

- `admissions.view`: can see the preview and the link/QR.
- `admissions.manage`: additionally sees the Rebuild button.
- Non-staff roles don't get here (no link in nav).

## Tests

- Page renders with mocked form definition.
- QR code component renders.
- Copy link button writes to clipboard (mock `navigator.clipboard`).
- Rebuild button is hidden for non-admin roles.
- Rebuild flow shows toast on success and re-fetches.

## Deployment

1. Commit locally.
2. Patch → production.
3. Install new QR library in `apps/web/package.json`, run `pnpm install` on server.
4. Build `@school/web`, restart web.
5. Smoke test: navigate to `/en/admissions/form-preview`, verify form fields render + QR shows + copy link works.
6. Update `IMPLEMENTATION_LOG.md`.

## Definition of done

- Form preview page built.
- QR code renders and downloads.
- Public link resolves correctly for the current tenant.
- Rebuild button works and is role-gated.
- Web restarted on production.
- Completion record added to the log.

## Notes for downstream implementations

- **14 (public form)** consumes the same URL pattern — reuse the helper function from this impl.
- **15 (cleanup)** deletes the old `admissions/forms/` subtree.
