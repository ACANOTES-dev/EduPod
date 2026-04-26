# Implementation 14 — Public Application Form

> **Wave:** 4 (parallelizable with 10, 11, 12, 13)
> **Depends on:** 01, 02, 03, 04
> **Deploys:** Web restart only

---

## Goal

Build the customer-facing public application form — the page a parent actually reaches from a QR code or a link on the school website. No authentication. Rate-limited. Submits to the existing `POST /v1/public/admissions/applications` endpoint which already exists and already does signature/captcha handling via `admissions-rate-limit.service.ts`. This impl is almost entirely frontend work plus some small backend hardening.

## Route structure

Under the `(public)` route group so no school-shell is applied:

```
apps/web/src/app/[locale]/(public)/apply/[tenantSlug]/
├── page.tsx               # the form
├── submitted/page.tsx     # thank-you page with application number
├── payment-success/page.tsx  # Stripe redirect target after successful payment
└── payment-cancelled/page.tsx # Stripe redirect target if user cancels checkout
```

If `(public)` route group doesn't exist yet in the project, create it. It's a layout boundary with no auth guard and minimal chrome.

## Page — `apply/[tenantSlug]/page.tsx`

### Layout

- Top: school logo + name (fetched via the public tenant config endpoint).
- Middle: the dynamic form.
- Bottom: "Submit application" button + legal notice (privacy policy link).
- No navigation shell. No sub-strip. Clean, focused landing page — this is the parent's first impression of the school.

### Data loading

On mount:

1. Resolve the tenant from `tenantSlug` via a new public endpoint `GET /v1/public/tenants/by-slug/:slug`. Returns `{ tenant_id, display_name, logo_url, locale_default, public_domain }`. If the slug doesn't match any tenant → render a 404-style "School not found" page.
2. Fetch the form via `GET /v1/public/admissions/form` passing the tenant slug (or via a header set by middleware that resolves the slug to a tenant). The existing endpoint already returns the form with fields; make sure impl 04's simplified version is what we're consuming.
3. Render via `DynamicFormRenderer` in editable mode.

### Form submission

On submit:

1. Validate required fields on the client (the renderer handles this).
2. POST to `/v1/public/admissions/applications` with:
   ```json
   {
     "target_academic_year_id": "<from the form select>",
     "target_year_group_id": "<from the form select>",
     "payload_json": {
       /* all the other field values */
     }
   }
   ```
3. On success (201), router.push to `/apply/[tenantSlug]/submitted?ref=<application_number>`.
4. On error, show inline error. The rate limiter responds with 429 — show a friendly "too many submissions from this network, please wait" message.

### Rate limiting (backend)

The existing `admissions-rate-limit.service.ts` rate-limits public submissions by IP + client fingerprint. Verify it's still wired into the route after impl 03's state machine rewrite. If the wiring was dropped, re-attach it.

Honeypot field: add a `website` text input that's hidden via CSS and rejected server-side if populated. Standard anti-bot pattern. Minor backend hardening in `public-admissions.controller.ts`.

### No login, no accounts

This form is fully anonymous. The parent doesn't have a user account yet — the account (and the `parents.user_id` link) is created later when the application is approved. The public submission is stored with `submitted_by_parent_id = null`.

## Page — `submitted/page.tsx`

Simple thank-you page:

- Large check icon.
- "Thank you — your application has been received."
- "Your reference number is: **X-2026-0042**" (read from the query string).
- "We'll email {{parent_email}} if we need anything further. If a seat is available for your requested year group, you'll hear from us within 14 days."
- School contact info (email + phone) at the bottom.
- No form fields. No tracking pixels. No analytics (beyond whatever the project already has).

## Page — `payment-success/page.tsx`

Landing page after Stripe checkout completes:

- Large check icon.
- "Payment received. Your application is being finalised."
- "You'll receive a confirmation email shortly."
- Contact info.

This is purely informational — the actual promotion to `approved` happens server-side via the webhook (impl 06), which may arrive before or after the parent lands on this page. Do not attempt to show "student created" status on this page; just acknowledge the payment.

## Page — `payment-cancelled/page.tsx`

- "You cancelled the payment."
- "Your application is still on hold for X days. Use the link in the email to try again."
- Contact info.

## Public tenant slug resolution

The `tenantSlug` path parameter needs to resolve to a tenant in the API layer. Two options:

**Option A:** New public endpoint `GET /v1/public/tenants/by-slug/:slug` that returns the tenant's public config. The form page calls this on mount. Simple.

**Option B:** Middleware that resolves the slug to a `tenant_id` and injects it into the request context, so all public admissions endpoints automatically know which tenant they're serving. Cleaner long-term but more work.

**Recommendation:** Option A for this impl. Add middleware later if a second public route needs it.

Add a `slug` column to the `Tenant` model if not present. Unique per tenant. For initial tenants, seed the slug as a slugified version of the tenant name. Add via a small migration in this impl.

## Rate limit tuning

- Global: 10 submissions per IP per hour.
- Per-tenant: 50 submissions per hour (prevents a single school being DoS'd).
- Circuit breaker on downstream state machine calls.

These numbers are guesses — document them and make them adjustable via tenant settings in a follow-up.

## i18n

The form displays field labels and help text from the form definition. These are currently hardcoded English strings in the canonical field set (impl 04). That's acceptable for now — Arabic parents in the Nurul Huda tenant can still use the form, we just don't localise field labels dynamically yet. Follow-up: move field labels to i18n keys when the wizard becomes tenant-configurable.

The rest of the page chrome (button labels, error messages, thank-you text) uses `next-intl` with keys under a new `publicApplyForm` namespace. Arabic translations mandatory.

## Tests

- Form renders for a valid tenant slug.
- 404 page renders for an unknown slug.
- Submit happy path hits the API and redirects to `/submitted`.
- 429 response shows a friendly rate-limit message.
- Honeypot field rejects bot submissions.
- Payment success/cancelled pages render from query params.

## Deployment

1. Commit locally.
2. Patch → production.
3. Run migration if adding `slug` column.
4. Build `@school/api` (for the new endpoint + slug column) and `@school/web`.
5. Restart api and web.
6. Smoke test:
   - Hit `https://<tenant_domain>/en/apply/<slug>` directly in a browser.
   - Submit a test application.
   - Verify it lands in the staging tenant's Ready to Admit queue.
   - Test rate limit by submitting 11 applications from the same IP.
7. Update `IMPLEMENTATION_LOG.md`.

## Definition of done

- Four public pages built (form, submitted, payment-success, payment-cancelled).
- Public tenant resolver endpoint working.
- `slug` column on Tenant (if not already present).
- Rate limiting verified on production.
- Honeypot working.
- Payment redirect URLs point to the correct pages (coordinate with impl 06's success/cancel URLs).
- Web + api restarted on production.
- Completion record added to the log.

## Notes for downstream implementations

- **15 (cleanup)** removes the old forms builder. The public form route is the only customer-facing entry point to admissions.
