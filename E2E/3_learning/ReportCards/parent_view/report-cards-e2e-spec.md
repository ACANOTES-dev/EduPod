# E2E Test Specification: Report Cards (Parent View)

## 1. Scope Statement

> **IMPORTANT — This module has no dedicated parent portal pages.** The Report Cards module does NOT mount any routes under the parent hub of the morph-shell navigation. Parents never see a "Report Cards" tab, a `/report-cards/*` page, or any admin/teacher affordance. There is no parent-facing inbox of report cards anywhere in `/en/parent/*` or `/en/dashboard/parent/*`.
>
> This spec therefore covers only the surfaces a parent CAN reach:
>
> 1. **Delivery receipt** — email / WhatsApp / in-app notification containing a signed link to their child's report card.
> 2. **Delivery landing + PDF viewer** — the page the signed link opens (no new dedicated route: the link lands on an ephemeral token-gated viewer).
> 3. **Acknowledgment flow** — the "I have read this report card" action that fires `POST /v1/report-cards/:id/acknowledge`.
> 4. **Public verification viewer** — `/verify/:token` — a public, unauthenticated page that anyone (parent, employer, government) can open to confirm a report card is authentic.
> 5. **Parent dashboard surfacing** — if `GradesTab` or a future "Recent Report Cards" card lists children's report cards (currently the dashboard's `GradesTab` shows gradebook performance; report-card listing is a GAP — see §25).
>
> Because the module is intentionally closed to the parent hub, roughly half of this spec's rows are **NEGATIVE ASSERTIONS** — parent opens an admin URL, API rejects with 403. Every row is marked [POS] (positive) or [NEG] (negative) for clarity.
>
> **Matching specs:** `../admin_view/report-cards-e2e-spec.md` and `../teacher_view/report-cards-e2e-spec.md`. Run all three as a set to get full role coverage.

**Base URL:** `https://nhqs.edupod.app`
**Tenant:** Nurul Huda School (NHQS)

---

## 2. Prerequisites & Test Data

| #   | Item                                                                                                                                                                                                                                                                            | Expected Result                                                                                                                                           | Pass/Fail |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 2.1 | **Parent account exists.** Email `parent.hassan@nhqs.test`, password `Password123!`, name **Fatima Hassan**, role `parent`, active membership in tenant NHQS.                                                                                                                   | Account can log in at `https://nhqs.edupod.app/en/login`. If the account does not exist, create it as a test-data precondition before running this spec.  |           |
| 2.2 | **Two linked children.** Fatima has exactly two rows in `student_parents` linking her to two active NHQS students (e.g. a Year 5 child and a Year 2 child).                                                                                                                     | `GET /api/v1/dashboard/parent` returns `data.students.length === 2`.                                                                                      |           |
| 2.3 | **A published & delivered report card targeting one of her children.** Admin has run `POST /v1/report-cards/generate` → `POST /v1/report-cards/:id/publish` → `POST /v1/report-cards/:id/deliver` for one child's S1 report card. A `ReportCardDelivery` row exists for Fatima. | Row exists in `report_card_deliveries` with `parent_id = Fatima's parent_id`, `channel ∈ {email, whatsapp, in_app}`, `status ∈ {pending_delivery, sent}`. |           |
| 2.4 | **A verification token exists.** `POST /v1/report-cards/:id/verification-token` was called by admin → a `ReportCardVerificationToken` row exists with a 64-hex-char token.                                                                                                      | `SELECT token FROM report_card_verification_tokens WHERE report_card_id = :id` returns exactly one row.                                                   |           |
| 2.5 | **Delivery channel configured.** `tenant_settings.settings.reportCards.deliveryChannel` is one of `email` (default) / `whatsapp` / `in_app`. Inspect `GET /api/v1/configuration` or fall back to `email` if unset.                                                              | Channel is one of the three valid values. If unset, `ReportCardDeliveryService.getDeliveryChannel()` defaults to `email`.                                 |           |
| 2.6 | **Cross-tenant parent (for §17).** A parent account in a different tenant exists — e.g. use `parent.test@other-tenant.edupod.app` or a staging tenant's parent. Needed for the RLS leakage check.                                                                               | Account can log in to a tenant that is NOT NHQS.                                                                                                          |           |
| 2.7 | **Fresh incognito windows** for each spec run — JWTs in memory, no localStorage/sessionStorage reuse.                                                                                                                                                                           | Two independent incognito profiles available (one for Fatima, one for the cross-tenant parent).                                                           |           |

---

## 3. Login & Parent Landing

| #   | What to Check                                                        | Expected Result                                                                                                                                      | Pass/Fail |
| --- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 3.1 | [POS] Open `https://nhqs.edupod.app/en/login` in fresh incognito     | Login form renders. No console errors.                                                                                                               |           |
| 3.2 | [POS] Enter `parent.hassan@nhqs.test` / `Password123!` → **Log in**  | Browser navigates to `/en/dashboard/parent` (NOT `/en/dashboard`). The parent-specific landing page is the only dashboard the parent role can reach. |           |
| 3.3 | [POS] Top-right profile avatar                                       | Initials **FH**, name **Fatima Hassan**, role label **Parent**.                                                                                      |           |
| 3.4 | [POS] Greeting                                                       | "Good [morning/afternoon/evening], Fatima" — rendered from `data.greeting` returned by `GET /api/v1/dashboard/parent`.                               |           |
| 3.5 | [POS] Tabs under the greeting                                        | Exactly four: **Overview**, **Grades**, **Timetable**, **Finances**. Overview is active by default. No **Report Cards** tab.                         |           |
| 3.6 | [NEG] Attempt direct navigation to `/en/dashboard` (admin dashboard) | Either redirects back to `/en/dashboard/parent` or renders an access-denied state. Parent JWT must not unlock the admin dashboard.                   |           |

---

## 4. Parent Hub Navigation (No Report Cards Tab Visible)

| #   | What to Check                                                                                                                                                                                | Expected Result                                                                                                                                                                                                                 | Pass/Fail |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 4.1 | [POS] Morph-bar hubs visible to parent                                                                                                                                                       | Only parent-relevant hubs: **Home**, **My Children** (or equivalent), **Engagement**, **Finance** (their invoices), potentially **SEN**. No **Learning** hub, no **Reports** hub, no **Operations** hub.                        |           |
| 4.2 | [NEG] Open every visible hub's sub-strip one by one                                                                                                                                          | No **Report Cards** link appears anywhere in the morph bar or any sub-strip. No **Assessment** sub-strip is reachable for the parent role.                                                                                      |           |
| 4.3 | [NEG] Open the command palette (search) and type `report cards`                                                                                                                              | No Report Cards page is offered as a navigation target. (If command palette is disabled for parents, verify it returns empty or is not rendered.)                                                                               |           |
| 4.4 | [NEG] Direct-URL-test `/en/report-cards`                                                                                                                                                     | Page either: (a) redirects to `/en/dashboard/parent`, (b) renders a 403 access-denied state, or (c) redirects to `/en/login`. Must NOT render the admin dashboard shell, must NOT call `GET /api/v1/report-cards` successfully. |           |
| 4.5 | [NEG] Direct-URL-test `/en/report-cards/library`, `/en/report-cards/generate`, `/en/report-cards/settings`, `/en/report-cards/analytics`, `/en/report-comments`, `/en/report-cards/requests` | All of these either redirect to parent dashboard or render 403. None of them reveal report-card data through the admin UI to the parent.                                                                                        |           |

---

## 5. Parent Dashboard — Children's Recent Report Cards Card

> **GAP NOTE:** As of the current build, `/en/dashboard/parent` does NOT surface a "Recent Report Cards" card. The **Grades** tab (`GradesTab`) shows gradebook performance, not published report cards. This is flagged in §25. The rows below describe the **expected** behaviour if/when such a card is implemented, and the **observed** behaviour today.

| #   | What to Check                                                        | Expected Result                                                                                                                                                                                          | Pass/Fail |
| --- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 5.1 | [POS-expected] A "Recent Report Cards" card on the Overview tab      | Each linked child with a published report card for the active period shows a row: **{child name} — {period name} — View**.                                                                               |           |
| 5.2 | [POS-expected] Clicking **View** on a child's row                    | Opens the PDF viewer for that report card (`GET /api/v1/report-cards/:id/pdf` authenticated as parent, succeeds because parent is in `student_parents` for the subject student).                         |           |
| 5.3 | [NEG-expected] Child belonging to another parent appears in the card | Must NEVER appear. The endpoint that populates the card must filter by `student_parents.parent_id = Fatima.parent_id`.                                                                                   |           |
| 5.4 | [NEG-observed-today] Card absent                                     | Today the card is not rendered. Flag in §25 as `GAP-PARENT-REPORTCARDS-001 — no dashboard surfacing`.                                                                                                    |           |
| 5.5 | [POS] **Grades** tab shows children's grades                         | `GradesTab` renders with a per-child dropdown switcher. Content is gradebook snapshots, not published report cards. Acceptable — this spec does not require the Grades tab to surface full report cards. |           |

---

## 6. Email Delivery Receipt — Open Email Link → Landing Page

> Uses Mailpit / Mailhog / production SMTP log to retrieve the email. Replace `$EMAIL_INBOX` with the actual inbox source.

| #   | What to Check                                                                                               | Expected Result                                                                                                                                                                                                                             | Pass/Fail |
| --- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 6.1 | [POS] Inspect the inbox for `parent.hassan@nhqs.test` after admin fired `POST /v1/report-cards/:id/deliver` | One email received with subject matching the pattern **"{school_name} — Report card ready for {student_name} ({period_name})"** or the tenant-configured template equivalent.                                                               |           |
| 6.2 | [POS] Email "from" address                                                                                  | Tenant-branded sender (e.g. `no-reply@nhqs.edupod.app` or the tenant's configured SMTP identity).                                                                                                                                           |           |
| 6.3 | [POS] Email body contains a **View Report Card** CTA button with a signed link                              | Link shape: `https://nhqs.edupod.app/en/report-cards/delivery/{delivery_id}?token={signed_token}` **OR** a deep link that resolves to a token-gated PDF. Record the exact shape. Link is HTTPS. Token is opaque (non-guessable, ≥32 chars). |           |
| 6.4 | [POS] Click the link (or open in a fresh incognito window, simulating a parent clicking from Gmail)         | Page loads the delivery landing / PDF viewer without requiring a password. Token is the only auth.                                                                                                                                          |           |
| 6.5 | [POS] Opening the link marks the delivery as `viewed`                                                       | `report_card_deliveries.viewed_at` becomes non-null and `status` transitions to `viewed`. Verify via admin endpoint `GET /v1/report-cards/:id/delivery-status`.                                                                             |           |
| 6.6 | [NEG] Email does NOT contain raw grades, marks, or teacher comments                                         | Body is a notification only — full content is behind the gated link. This preserves confidentiality if the email is forwarded by mistake.                                                                                                   |           |
| 6.7 | [POS] Email footer includes unsubscribe / contact-school line                                               | Compliance footer with tenant support contact and link to the privacy notice.                                                                                                                                                               |           |

---

## 7. Delivery Link Token Handling

| #   | What to Check                                                                                    | Expected Result                                                                                                                                                                     | Pass/Fail |
| --- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 7.1 | [POS] Valid, unexpired token → GET delivery landing                                              | Page renders with PDF viewer + acknowledgment button. HTTP 200.                                                                                                                     |           |
| 7.2 | [NEG] Tampered token (flip one hex char) → GET delivery landing                                  | Page renders a non-leaking error: "This link is invalid or has expired." No report card data. HTTP 404. Backend returns `{ error: { code: 'TOKEN_NOT_FOUND' } }` or equivalent.     |           |
| 7.3 | [NEG] Expired token (if tokens have a TTL; document if none exists today) → GET delivery landing | Same non-leaking error. HTTP 404. Flag in §25 as a GAP if tokens have no expiry — delivery tokens SHOULD expire after ~90 days per security policy.                                 |           |
| 7.4 | [NEG] Token for a different tenant's report card (cross-tenant)                                  | Backend rejects — even if the token string was somehow guessed. RLS prevents the `report_card_deliveries` row from matching.                                                        |           |
| 7.5 | [NEG] Token for an unpublished (draft/revised) report card                                       | Backend rejects with `REPORT_CARD_NOT_PUBLISHED` — see `ReportCardDeliveryService.deliver()` which enforces `status === 'published'`. Parent cannot view a draft via a leaked link. |           |
| 7.6 | [POS] Token URL-encoding edge cases (trailing space, `%20`, etc.)                                | Server trims/validates; invalid → 404 with the non-leaking error.                                                                                                                   |           |

---

## 8. Report Card PDF Viewer (In-Browser)

| #    | What to Check                                    | Expected Result                                                                                                                                                 | Pass/Fail |
| ---- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 8.1  | [POS] PDF renders inline in the browser          | `Content-Type: application/pdf`, `Content-Disposition: inline; filename="report-card.pdf"` — see `ReportCardsController.renderPdf()`.                           |           |
| 8.2  | [POS] PDF header                                 | School logo, school name, school name in Arabic (if set), report card title from tenant branding.                                                               |           |
| 8.3  | [POS] PDF student block                          | Child's full name, student number, year group, class, academic period name, issue date.                                                                         |           |
| 8.4  | [POS] PDF subjects section                       | Table of subjects with marks / grades / overall comment per subject. Locale-correct (EN or AR per `template_locale`).                                           |           |
| 8.5  | [POS] PDF overall comment section                | Principal's / homeroom teacher's overall comment text.                                                                                                          |           |
| 8.6  | [POS] PDF footer                                 | QR code linking to `https://nhqs.edupod.app/verify/{verification_token}` (or equivalent public URL). Verification note in human language.                       |           |
| 8.7  | [POS] Download button in the browser PDF toolbar | Works — file saves as `report-card.pdf` (or a tenant-configured filename with the student name + period).                                                       |           |
| 8.8  | [POS] Print button in the browser PDF toolbar    | Works — print preview opens, PDF is printable on A4.                                                                                                            |           |
| 8.9  | [POS] Arabic locale PDF                          | If child's template_locale is `ar`, the PDF renders right-to-left, Arabic font, Arabic numerals for UI labels but Western numerals for marks (per i18n policy). |           |
| 8.10 | [NEG] Browser console errors while rendering PDF | No errors. Any error = fail.                                                                                                                                    |           |

---

## 9. Acknowledgment Modal — Flow

| #   | What to Check                                                                                                             | Expected Result                                                                                                                                                                                                                       | Pass/Fail |
| --- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 9.1 | [POS] Delivery landing renders an **Acknowledge** button below or beside the PDF                                          | Button text: "I have read my child's report card" (or `t('reportCards.acknowledge')` equivalent). Disabled until the PDF has been rendered / scrolled (nice-to-have; document actual behaviour).                                      |           |
| 9.2 | [POS] Click **Acknowledge**                                                                                               | Modal opens: "Confirm you have read {student_name}'s report card for {period_name}." Buttons **Confirm** + **Cancel**.                                                                                                                |           |
| 9.3 | [POS] Click **Confirm**                                                                                                   | Fires `POST /api/v1/report-cards/:id/acknowledge` with body `{ parent_id: "<Fatima.parent_id>" }`. Response 201 Created (or 200 if idempotent replay). Toast: **"Acknowledgment recorded"**.                                          |           |
| 9.4 | [POS] Response body shape                                                                                                 | Contains `{ id, tenant_id, report_card_id, parent_id, acknowledged_at, ip_address }` per `ReportCardAcknowledgmentService.acknowledge()`.                                                                                             |           |
| 9.5 | [POS] UI state after acknowledgment                                                                                       | Acknowledge button is replaced by a confirmation badge: **"You acknowledged this report card on {date} at {time}"**. Button cannot be clicked again.                                                                                  |           |
| 9.6 | [POS] Re-click (if still clickable) triggers idempotent behaviour                                                         | Service detects existing row: "Check if already acknowledged … Idempotent — return existing" (see `ReportCardAcknowledgmentService.acknowledge()` lines 48–53). No duplicate row created.                                             |           |
| 9.7 | [NEG] Send `POST /api/v1/report-cards/:id/acknowledge` with `parent_id` of the OTHER parent (another Fatima acquaintance) | Backend rejects. Expected: 403 or 404 — parent_id must match the JWT's membership. (If the endpoint currently accepts any parent_id because `@RequiresPermission('gradebook.view')` is the only guard, flag as `GAP-PARENT-ACK-001`.) |           |
| 9.8 | [NEG] Send POST with a report card id that targets a student NOT linked to Fatima                                         | Backend should reject (parent has no `student_parents` link). Verify behaviour — if it succeeds, flag as `GAP-PARENT-ACK-002 — acknowledgment scope check missing`.                                                                   |           |

---

## 10. Acknowledgment Status — Immutable, Timestamp, IP Logged

| #    | What to Check                                             | Expected Result                                                                                                                                                                                                    | Pass/Fail |
| ---- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 10.1 | [POS] Acknowledgment row in `report_card_acknowledgments` | Columns populated: `tenant_id`, `report_card_id`, `parent_id`, `acknowledged_at` (TIMESTAMPTZ, exact time of confirm), `ip_address` (captured from `x-forwarded-for` or socket remoteAddress).                     |           |
| 10.2 | [POS] Cannot be undone                                    | There is no `DELETE /v1/report-cards/:id/acknowledge` endpoint. Once acknowledged, the row persists.                                                                                                               |           |
| 10.3 | [POS] Admin can view acknowledgment status                | Admin `GET /v1/report-cards/:id/acknowledgment-status` shows Fatima as `acknowledged: true` with the timestamp.                                                                                                    |           |
| 10.4 | [POS] Replay of the POST returns the same row             | Idempotent — second POST returns existing row, does NOT update `acknowledged_at` or `ip_address`.                                                                                                                  |           |
| 10.5 | [NEG] Unpublished / draft report card                     | Service rejects with 409 `REPORT_CARD_NOT_PUBLISHED`. Parent cannot acknowledge a draft.                                                                                                                           |           |
| 10.6 | [POS] IP address captured behind a proxy                  | When the request traverses Cloudflare / Nginx, `x-forwarded-for` header is populated and stored. If the server misconfigures `trust proxy`, IP may be logged as the proxy's IP — flag as an ops issue if observed. |           |

---

## 11. Public Verification Viewer — `/verify/:token` Contract

> The verification viewer is **public** — no login, no tenant context in headers. The token IS the authorisation. It is designed so that employers, universities, and government bodies can confirm a PDF was really issued by the school without needing an account.

| #    | What to Check                                                                                       | Expected Result                                                                                                                                                                                                               | Pass/Fail |
| ---- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 11.1 | [POS] Open `https://nhqs.edupod.app/en/verify/{validToken}` in fresh incognito (no cookies, no JWT) | Page loads — does NOT redirect to login. HTTP 200. Renders school logo (if set), green success icon, title **"Verification confirmed"** (or locale equivalent from `messages/{locale}.json → reportCards.verificationTitle`). |           |
| 11.2 | [POS] Network panel shows `GET /api/v1/verify/{token}`                                              | Exactly one call. No Authorization header. Response shape: `{ data: { valid: true, school_name, student_name, period_name, published_at } }` (or the page wraps it in `{ data }`).                                            |           |
| 11.3 | [POS] Fields displayed                                                                              | Rows: **School**, **Student**, **Period**, **Issued at**. `published_at` is formatted via `.toLocaleDateString()` with monospace font.                                                                                        |           |
| 11.4 | [NEG] Grades, marks, comments are NOT shown                                                         | The viewer confirms authenticity only. No subject rows, no marks, no teacher comment. This is enforced in `ReportCardVerificationService.verify()` — only identity fields are returned.                                       |           |
| 11.5 | [POS] Privacy note                                                                                  | Small-print below the card: "This verification only confirms the report card exists and was published by the school. It does not expose academic content." (`verificationPrivacyNote` translation key.)                       |           |

---

## 12. Verification Viewer — Valid Token → Report Card Summary

| #    | What to Check                                                         | Expected Result                                                                                                                                                                                | Pass/Fail |
| ---- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 12.1 | [POS] QR code in the PDF (from §8.6) scanned → opens `/verify/:token` | Camera opens the URL in the default browser. Page loads the summary.                                                                                                                           |           |
| 12.2 | [POS] Student name matches the PDF                                    | Exact string match — first + last name.                                                                                                                                                        |           |
| 12.3 | [POS] School name matches the tenant                                  | `tenant.name` from the DB — NOT the tenant's slug or subdomain.                                                                                                                                |           |
| 12.4 | [POS] Full-year report card (no academic period)                      | `period_name` is shown as **"Full Year"** (see `ReportCardVerificationService.verify()` line 118). Not null, not empty.                                                                        |           |
| 12.5 | [POS] `issued_at` / `published_at`                                    | Non-null ISO date, rendered as localized date. If null (report card published_at missing), page shows "—" or hides the row.                                                                    |           |
| 12.6 | [POS] Locale switch — open `/ar/verify/:token`                        | Page renders in Arabic, RTL, with Arabic translations for labels (**المدرسة**, **الطالب**, **الفترة**, **تاريخ الإصدار**). Student name and school name render as stored (potentially Arabic). |           |
| 12.7 | [POS] Page is shareable                                               | URL can be copied and pasted into another browser — works the same (public endpoint, no cookie/JWT dependency).                                                                                |           |

---

## 13. Verification Viewer — Expired / Tampered / Missing Token

| #    | What to Check                                                                            | Expected Result                                                                                                                                                                                                                   | Pass/Fail |
| ---- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 13.1 | [NEG] Flip one hex character in a valid token → open `/verify/{tamperedToken}`           | Page renders the "Invalid" card: red X icon, title **"Verification failed"**, description **"This report card could not be verified. It may be fake or the link may be malformed."** Backend returns 404 `TOKEN_NOT_FOUND`.       |           |
| 13.2 | [NEG] Random 64-hex string                                                               | Same invalid card. HTTP 404.                                                                                                                                                                                                      |           |
| 13.3 | [NEG] Token belonging to a report card whose status was later changed to `revised`       | If the old token is still valid (verification tokens are NOT tied to status lifecycle currently), backend returns 404 `REPORT_CARD_NOT_PUBLISHED`. Verify and flag `GAP-PARENT-VERIFY-001` if old tokens leak revised-state data. |           |
| 13.4 | [NEG] Empty token — `/en/verify/` (no segment)                                           | Next.js returns 404 page (dynamic route requires the `[token]` param).                                                                                                                                                            |           |
| 13.5 | [NEG] Non-hex garbage token with SQL-injection attempt: `/en/verify/' OR 1=1 --`         | Safe — Prisma parameterises. Backend returns 404 with no DB error leakage.                                                                                                                                                        |           |
| 13.6 | [NEG] Error responses do not leak tenant names, student names, or internal error details | Response body is the generic `TOKEN_NOT_FOUND` or `REPORT_CARD_NOT_PUBLISHED` code. No stack trace, no SQL error, no tenant info in error payload.                                                                                |           |

---

## 14. Verification Viewer — Rate Limiting

> Expected behaviour based on platform norms. If absent, flag as GAP.

| #    | What to Check                                                                                     | Expected Result                                                                                                                                      | Pass/Fail |
| ---- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 14.1 | [POS-expected] Burst 100 requests from one IP to `/api/v1/verify/{randomToken}` within 10 seconds | After ~30–50 requests, server returns HTTP 429 with `Retry-After` header. Prevents brute-forcing tokens.                                             |           |
| 14.2 | [POS-expected] After cool-down, requests succeed again                                            | Rate limit resets (sliding or fixed window).                                                                                                         |           |
| 14.3 | [NEG] Valid-token requests are rate-limited in the same bucket as invalid ones                    | Legitimate verifiers should not be blocked — the limit should key on source IP + invalid-token count, not total requests. Document actual behaviour. |           |
| 14.4 | [POS-expected] Response does NOT reveal valid-vs-invalid information in the rate-limit timing     | No timing side-channel — invalid lookups should take similar time to valid ones (use constant-time comparison or add a small jitter).                |           |
| 14.5 | [POS-observed] If no rate limit exists today                                                      | Flag `GAP-PARENT-VERIFY-002 — /verify/:token not rate-limited; brute-force feasible`.                                                                |           |

---

## 15. In-App Notification (Delivery Channel: `in_app`)

> `ReportCardDeliveryService.deliver()` always creates a secondary `in_app` delivery even when the primary channel is email or whatsapp (see lines 88–101 of the service). So the parent notification centre must show an entry.

| #    | What to Check                                                                 | Expected Result                                                                                                                                                                                           | Pass/Fail |
| ---- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 15.1 | [POS] After admin fires `POST /v1/report-cards/:id/deliver`, log in as Fatima | Open the notifications bell in the morph bar. A new unread notification appears: **"Report card for {student_name} is ready"** (or the tenant-configured copy for `notifications.report_card_delivered`). |           |
| 15.2 | [POS] Click the notification                                                  | Navigates to the delivery landing (same as clicking the email link). Notification becomes read.                                                                                                           |           |
| 15.3 | [POS] Notification record                                                     | `report_card_deliveries` row with `channel = 'in_app'`, `status = 'sent'` (marked sent immediately — see lines 107–118 of the service).                                                                   |           |
| 15.4 | [NEG] Fatima sees notifications for OTHER parents' children                   | Must NEVER happen. `parent_id` filter on the notifications feed must match her `parent_id`.                                                                                                               |           |
| 15.5 | [POS] Second child's report card (a second delivery)                          | Separate notification — one per delivery, not merged.                                                                                                                                                     |           |
| 15.6 | [POS] If tenant delivery channel is `in_app` only                             | `ReportCardDeliveryService.deliver()` does not create a secondary `in_app` (it checks `if (channel !== 'in_app')`). Parent receives exactly one in_app notification, no email.                            |           |

---

## 16. WhatsApp / SMS Delivery — Template & Link Format

> Only relevant if tenant `tenant_settings.settings.reportCards.deliveryChannel === 'whatsapp'`. Document expected shape — this channel may be integrated via Twilio / WA Business API or queued for a worker job.

| #    | What to Check                                                    | Expected Result                                                                                                                                                                                                                                                       | Pass/Fail |
| ---- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 16.1 | [POS] Flip tenant setting to `whatsapp`, fire deliver            | `report_card_deliveries.channel = 'whatsapp'`, `status = 'pending_delivery'`. A BullMQ job in the `notifications` queue (or the gradebook queue) picks it up and sends through the provider.                                                                          |           |
| 16.2 | [POS] WhatsApp message format                                    | Approved template: **"Hello {parent_first_name}, the report card for {student_name} ({period_name}) from {school_name} is ready. View: {link}"**. Link format: `https://nhqs.edupod.app/en/report-cards/delivery/{delivery_id}?token={signed}` (same shape as email). |           |
| 16.3 | [POS] Arabic-speaking parents get an Arabic template             | Template language matches parent preferred language (or tenant default locale). RTL-safe formatting — link appears LTR inside RTL text.                                                                                                                               |           |
| 16.4 | [NEG] WhatsApp message does NOT include grades                   | Same rule as email — message is notification + link only. Full content behind the gated link.                                                                                                                                                                         |           |
| 16.5 | [POS] Delivery status transitions                                | `pending_delivery` → `sent` (on provider webhook ack) → `viewed` (on link click).                                                                                                                                                                                     |           |
| 16.6 | [NEG] WhatsApp failure (e.g. parent blocked the business number) | Status transitions to `failed` with a reason. Admin delivery-status page surfaces this. Fallback behaviour — admin can retry or switch channel.                                                                                                                       |           |
| 16.7 | [POS] SMS fallback (if enabled)                                  | Document whether SMS is implemented. If not — flag as informational, NOT a gap unless the tenant has requested SMS.                                                                                                                                                   |           |

---

## 17. Cross-Tenant Safety — Parent B Cannot Acknowledge Tenant A's Card

> **Critical RLS leakage test.** Scenario: somehow Fatima (tenant NHQS) obtains the report card id and verification token of a report card in tenant **Acme School**. She tries to acknowledge it using her NHQS JWT.

| #    | What to Check                                                                                                                   | Expected Result                                                                                                                                                              | Pass/Fail |
| ---- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 17.1 | [NEG] `POST /api/v1/report-cards/{acmeReportCardId}/acknowledge` with Fatima's NHQS JWT, body `{ parent_id: Fatima.parent_id }` | Backend returns 404 `REPORT_CARD_NOT_FOUND`. Tenant context set to NHQS via middleware → the `findFirst({ id, tenant_id: 'NHQS' })` lookup fails. No acknowledgment created. |           |
| 17.2 | [NEG] `GET /api/v1/report-cards/{acmeReportCardId}` with Fatima's NHQS JWT                                                      | 404 — same RLS isolation.                                                                                                                                                    |           |
| 17.3 | [NEG] `GET /api/v1/report-cards/{acmeReportCardId}/pdf` with Fatima's NHQS JWT                                                  | 404 — PDF not rendered.                                                                                                                                                      |           |
| 17.4 | [POS] `GET /api/v1/verify/{acmeValidToken}` unauthenticated (public endpoint)                                                   | Succeeds — returns Acme's data. This is by design: verification is public, token-based. The purpose is for anyone holding a PDF to verify it. NOT a cross-tenant leak.       |           |
| 17.5 | [NEG] `POST /api/v1/report-cards/{acmeId}/acknowledge` with Fatima's JWT and `parent_id: someAcmeParentId`                      | 404 — tenant context mismatch blocks it at the service layer.                                                                                                                |           |
| 17.6 | [NEG] Audit log for the rejected attempt                                                                                        | Security event logged with parent user id, target report card id, tenant context. Surface in platform-admin audit review.                                                    |           |

---

## 18. Sibling Visibility — Parent Sees Only Their Own Children

| #    | What to Check                                                                                                                      | Expected Result                                                                                                                                                         | Pass/Fail |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 18.1 | [POS] `GET /api/v1/dashboard/parent`                                                                                               | `data.students` contains exactly Fatima's 2 children. No other students.                                                                                                |           |
| 18.2 | [POS] Any "Recent Report Cards" card (if/when implemented) lists only those 2 children                                             | Endpoint filters by `student_parents.parent_id = Fatima.parent_id`.                                                                                                     |           |
| 18.3 | [NEG] Attempt `GET /api/v1/report-cards/:id` for a classmate's report card (another student in the same class, not Fatima's child) | 403 or 404 — parent-scoped enforcement. If it succeeds, flag `GAP-PARENT-SCOPE-001` — parent can read any tenant report card via direct id.                             |           |
| 18.4 | [NEG] Attempt `GET /api/v1/report-cards?student_id={classmateId}`                                                                  | Even with `gradebook.view` permission, list should filter by parent's linked students. If the list returns results for unlinked students — flag `GAP-PARENT-SCOPE-002`. |           |
| 18.5 | [POS] `GET /api/v1/report-cards` (no filter) with parent JWT                                                                       | Returns only report cards for Fatima's children. OR returns 403 (if the endpoint's `gradebook.view` guard rejects the parent role entirely). Document actual behaviour. |           |
| 18.6 | [NEG] A coparent (e.g. Fatima's husband, another `student_parents` row) tries to acknowledge on Fatima's behalf                    | Succeeds only if his `parent_id` is passed in the body AND the record is his. Posting Fatima's `parent_id` from his JWT should be rejected.                             |           |

---

## 19. What Parents MUST NOT See or Do (Negative Matrix)

> **Exhaustive 403/redirect matrix.** Every admin and teacher route must deny parent access.

| #     | Route / Endpoint                                                                          | Method    | Expected Response for Parent JWT                   | Pass/Fail |
| ----- | ----------------------------------------------------------------------------------------- | --------- | -------------------------------------------------- | --------- |
| 19.1  | `/en/report-cards`                                                                        | GET       | Redirect to `/en/dashboard/parent` or 403          |           |
| 19.2  | `/en/report-cards/library`                                                                | GET       | Redirect or 403                                    |           |
| 19.3  | `/en/report-cards/generate`                                                               | GET       | Redirect or 403                                    |           |
| 19.4  | `/en/report-cards/settings`                                                               | GET       | Redirect or 403                                    |           |
| 19.5  | `/en/report-cards/analytics`                                                              | GET       | Redirect or 403                                    |           |
| 19.6  | `/en/report-cards/{classId}`                                                              | GET       | Redirect or 403                                    |           |
| 19.7  | `/en/report-comments`                                                                     | GET       | Redirect or 403                                    |           |
| 19.8  | `/en/report-comments/overall/{classId}`                                                   | GET       | Redirect or 403                                    |           |
| 19.9  | `/en/report-comments/subject/{classId}/{subjectId}`                                       | GET       | Redirect or 403                                    |           |
| 19.10 | `/en/report-cards/requests`                                                               | GET       | Redirect or 403                                    |           |
| 19.11 | `/api/v1/report-cards` (list)                                                             | GET       | 403 (parent lacks `gradebook.view` for admin list) |           |
| 19.12 | `/api/v1/report-cards/generate`                                                           | POST      | 403                                                |           |
| 19.13 | `/api/v1/report-cards/:id/publish`                                                        | POST      | 403                                                |           |
| 19.14 | `/api/v1/report-cards/:id/revise`                                                         | POST      | 403                                                |           |
| 19.15 | `/api/v1/report-cards/:id`                                                                | PATCH     | 403                                                |           |
| 19.16 | `/api/v1/report-cards/:id`                                                                | DELETE    | 403                                                |           |
| 19.17 | `/api/v1/report-cards/:id/deliver`                                                        | POST      | 403                                                |           |
| 19.18 | `/api/v1/report-cards/:id/delivery-status`                                                | GET       | 403                                                |           |
| 19.19 | `/api/v1/report-cards/:id/verification-token`                                             | POST      | 403                                                |           |
| 19.20 | `/api/v1/report-cards/library`, `/library/grouped`, `/library/bundle-pdf`                 | GET       | 403                                                |           |
| 19.21 | `/api/v1/report-cards/templates` (all CRUD)                                               | ALL       | 403                                                |           |
| 19.22 | `/api/v1/report-cards/approval-configs` (all CRUD)                                        | ALL       | 403                                                |           |
| 19.23 | `/api/v1/report-cards/approvals/pending`, `/approve`, `/reject`, `/bulk-approve`          | ALL       | 403                                                |           |
| 19.24 | `/api/v1/report-cards/custom-fields` (all CRUD)                                           | ALL       | 403                                                |           |
| 19.25 | `/api/v1/report-cards/grade-thresholds` (all CRUD)                                        | ALL       | 403                                                |           |
| 19.26 | `/api/v1/report-cards/generation-runs` + `/dry-run`                                       | ALL       | 403                                                |           |
| 19.27 | `/api/v1/report-cards/bulk/generate` / `/bulk/publish` / `/bulk/deliver` / `/bulk-delete` | POST      | 403                                                |           |
| 19.28 | `/api/v1/report-cards/batch-pdf`                                                          | POST      | 403                                                |           |
| 19.29 | `/api/v1/report-cards/analytics/dashboard` / `/class-comparison`                          | GET       | 403                                                |           |
| 19.30 | `/api/v1/report-cards/students/:studentId/transcript`                                     | GET       | 403                                                |           |
| 19.31 | `/api/v1/report-cards/classes/:classId/matrix`                                            | GET       | 403                                                |           |
| 19.32 | `/api/v1/report-cards/:id/custom-field-values`                                            | PUT/GET   | 403                                                |           |
| 19.33 | `/api/v1/report-comments/**` (windows, subject comments, overall comments)                | ALL       | 403                                                |           |
| 19.34 | `/api/v1/report-cards/teacher-requests/**`                                                | ALL       | 403                                                |           |
| 19.35 | `/api/v1/report-cards/tenant-settings`                                                    | GET/PATCH | 403                                                |           |

---

## 20. Permission Denials — Direct URL Attempts

> Same matrix as §19, run with explicit assertions on the JSON error shape.

| #     | What to Check                                                                                    | Expected Result                                                                                                                                                                                                                 | Pass/Fail |
| ----- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 20.1  | [NEG] cURL `POST /api/v1/report-cards/generate` with parent JWT                                  | HTTP 403. Body: `{ error: { code: 'FORBIDDEN' or 'INSUFFICIENT_PERMISSIONS', message: '...' } }`. Error code follows UPPER_SNAKE_CASE.                                                                                          |           |
| 20.2  | [NEG] cURL admin endpoints (19.11–19.35)                                                         | All return 403 with the structured `{ error: { code, message } }` shape.                                                                                                                                                        |           |
| 20.3  | [NEG] Error responses do not leak row data                                                       | No student names, no report card ids, no tenant names in error body.                                                                                                                                                            |           |
| 20.4  | [NEG] No stack traces                                                                            | In production, stack traces suppressed. Only the code + message returned.                                                                                                                                                       |           |
| 20.5  | [NEG] 401 (not 403) if the JWT is missing or expired                                             | Without a valid JWT → 401 `UNAUTHORIZED`. Distinct from the 403 case.                                                                                                                                                           |           |
| 20.6  | [POS-allowed] `GET /api/v1/report-cards/:id` where `:id` is one of Fatima's children's cards     | 200 OK. Response includes the report card snapshot, subjects, overall comment. (Scoped access via `gradebook.view`; guard allows read.) If this returns 403 for parents, flag as `GAP-PARENT-READ-001 — own-child read denied`. |           |
| 20.7  | [POS-allowed] `GET /api/v1/report-cards/:id/pdf` where `:id` is one of Fatima's children's cards | 200 OK, `Content-Type: application/pdf`. Binary PDF body.                                                                                                                                                                       |           |
| 20.8  | [POS-allowed] `POST /api/v1/report-cards/:id/acknowledge` where `:id` is own child               | 201 Created with acknowledgment row.                                                                                                                                                                                            |           |
| 20.9  | [POS-allowed] `GET /api/v1/verify/:token` (any token, public)                                    | 200 with summary or 404 if invalid. Unauthenticated.                                                                                                                                                                            |           |
| 20.10 | [NEG] Parent tries the teacher-scoped endpoints (subject comments, overall comments)             | 403 — teacher requires `report_cards.comment` / `report_cards.comment_overall`.                                                                                                                                                 |           |

---

## 21. Arabic / RTL

| #    | What to Check                                           | Expected Result                                                                                                                                                                        | Pass/Fail |
| ---- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 21.1 | [POS] Switch locale to Arabic from the profile dropdown | `/ar/dashboard/parent` loads. `<html dir="rtl">`. UI mirrors.                                                                                                                          |           |
| 21.2 | [POS] Delivery email received in Arabic locale          | Subject + body translated. Link URL is LTR-embedded in RTL text — link renders correctly without breaking direction (uses `<bdo dir="ltr">` or equivalent for the URL).                |           |
| 21.3 | [POS] Delivery landing page in Arabic                   | All labels translated. Acknowledge button reads "أؤكد أنني قرأت بطاقة التقرير" (or the project's translation key equivalent). PDF renders in Arabic locale if template_locale is `ar`. |           |
| 21.4 | [POS] Verification viewer at `/ar/verify/:token`        | Labels translated: **المدرسة**, **الطالب**, **الفترة**, **تاريخ الإصدار**. RTL layout. Dates in Gregorian calendar, Western numerals.                                                  |           |
| 21.5 | [POS] Logical CSS properties on the landing page        | No `ml-`/`mr-`/`left-`/`right-` usage — all `ms-`/`me-`/`start-`/`end-`. Inspect computed styles in DevTools.                                                                          |           |
| 21.6 | [POS] Acknowledgment modal in Arabic                    | Modal confirm/cancel buttons translated. Confirm button on the start (right) side in RTL.                                                                                              |           |
| 21.7 | [POS] Numbers in Arabic locale                          | Marks, dates, student numbers use Western numerals (0-9) per project i18n policy.                                                                                                      |           |

---

## 22. Mobile Responsiveness (375px — iPhone SE)

| #    | What to Check                                                | Expected Result                                                                                                                                                              | Pass/Fail |
| ---- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 22.1 | [POS] Resize to 375px, open parent dashboard                 | No horizontal scroll. Morph bar collapses to hamburger. Tabs (Overview/Grades/Timetable/Finances) scroll horizontally with `overflow-x-auto`. No flashing during tab switch. |           |
| 22.2 | [POS] Resize to 375px, open delivery landing from email link | PDF viewer fits viewport width. Download / print controls accessible via the browser's native PDF toolbar. No 100vw overflow.                                                |           |
| 22.3 | [POS] Acknowledgment modal at 375px                          | Modal width ≤ viewport with `p-4` padding. Confirm/Cancel buttons full-width stacked, ≥44px tap targets. No content cut off.                                                 |           |
| 22.4 | [POS] `/en/verify/:token` at 375px                           | Card centered, `max-w-md`, `p-8` padding. Rows stack cleanly. No horizontal scroll.                                                                                          |           |
| 22.5 | [POS] Logical properties used throughout                     | `text-end` instead of `text-right` on value columns (see `verify/[token]/page.tsx` line 122).                                                                                |           |
| 22.6 | [POS] In-app notification drawer on mobile                   | Slide-in overlay. Notification rows ≥44px tall. Tapping navigates cleanly.                                                                                                   |           |
| 22.7 | [POS] Email client (Gmail iOS) rendering                     | Email template renders responsively. CTA button large enough to tap (≥44px).                                                                                                 |           |
| 22.8 | [POS] Landscape orientation                                  | Rotate to landscape. Content re-flows. No fixed heights that cut content.                                                                                                    |           |

---

## 23. Console & Network Health

| #    | What to Check                                                      | Expected Result                                                                                                                                                                              | Pass/Fail |
| ---- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 23.1 | [POS] Open devtools on `/en/dashboard/parent`                      | Zero console errors. Zero React warnings (key props, hook deps, etc.).                                                                                                                       |           |
| 23.2 | [POS] Open devtools on delivery landing                            | Zero console errors. PDF fetch succeeds (200). No 4xx/5xx in network tab.                                                                                                                    |           |
| 23.3 | [POS] Open devtools on `/en/verify/:token`                         | Zero console errors. Exactly one `GET /api/v1/verify/:token` call. No other API calls (no cross-tenant fetches).                                                                             |           |
| 23.4 | [NEG] Network panel never shows requests to other tenants' domains | All calls go to `nhqs.edupod.app` or the shared platform domain. No request to `acme.edupod.app` or any other tenant's subdomain.                                                            |           |
| 23.5 | [NEG] Empty `catch {}` blocks                                      | No silent failures. Each `.catch(...)` in the parent dashboard has either a toast or `console.error('[context]', err)` (see `apps/web/src/app/[locale]/(school)/dashboard/parent/page.tsx`). |           |
| 23.6 | [POS] Performance: initial dashboard TTI                           | < 3s on a throttled Fast 3G profile. Acknowledgment round-trip < 1s.                                                                                                                         |           |
| 23.7 | [POS] No 401/403/500 responses during normal flow                  | All endpoints in the allowed set return 2xx. Any 4xx outside §19 matrix = bug.                                                                                                               |           |

---

## 24. Backend Endpoint Map (Parent Scope)

> **Legend:** `[ALLOWED]` — parent JWT succeeds. `[DENIED]` — parent JWT returns 403. `[PUBLIC]` — no JWT required.

| Method | Path                                                                                                | Parent Access           | Expected Response (parent)                                                                                                        |
| ------ | --------------------------------------------------------------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/v1/verify/:token`                                                                                 | [PUBLIC]                | 200 with summary if token valid; 404 `TOKEN_NOT_FOUND` or `REPORT_CARD_NOT_PUBLISHED` otherwise.                                  |
| GET    | `/v1/report-cards/:id`                                                                              | [ALLOWED for own child] | 200 with report card snapshot. 404 if id not in tenant. Scope-check: verify guard resolves via `student_parents` for parent role. |
| GET    | `/v1/report-cards/:id/pdf`                                                                          | [ALLOWED for own child] | 200 `application/pdf` binary. 404 otherwise.                                                                                      |
| POST   | `/v1/report-cards/:id/acknowledge`                                                                  | [ALLOWED for own child] | 201 Created with `{ id, report_card_id, parent_id, acknowledged_at, ip_address }`. Idempotent. 409 if report card not published.  |
| GET    | `/v1/dashboard/parent`                                                                              | [ALLOWED]               | 200 with `{ data: { greeting, students: LinkedStudent[] } }`.                                                                     |
| GET    | `/v1/report-cards` (list)                                                                           | [DENIED]                | 403 (parent lacks `gradebook.view` for the admin list surface).                                                                   |
| POST   | `/v1/report-cards/generate`                                                                         | [DENIED]                | 403 `gradebook.manage` required.                                                                                                  |
| POST   | `/v1/report-cards/:id/publish`                                                                      | [DENIED]                | 403 `gradebook.publish_report_cards` required.                                                                                    |
| POST   | `/v1/report-cards/:id/revise`                                                                       | [DENIED]                | 403 `gradebook.manage` required.                                                                                                  |
| PATCH  | `/v1/report-cards/:id`                                                                              | [DENIED]                | 403 `gradebook.manage` required.                                                                                                  |
| DELETE | `/v1/report-cards/:id`                                                                              | [DENIED]                | 403 `report_cards.manage` required.                                                                                               |
| POST   | `/v1/report-cards/bulk-delete`                                                                      | [DENIED]                | 403                                                                                                                               |
| POST   | `/v1/report-cards/:id/deliver`                                                                      | [DENIED]                | 403 `gradebook.publish_report_cards` required.                                                                                    |
| GET    | `/v1/report-cards/:id/delivery-status`                                                              | [DENIED]                | 403                                                                                                                               |
| POST   | `/v1/report-cards/:id/verification-token`                                                           | [DENIED]                | 403 `gradebook.manage` required.                                                                                                  |
| POST   | `/v1/report-cards/templates` (+ CRUD)                                                               | [DENIED]                | 403 `report_cards.manage_templates` required.                                                                                     |
| POST   | `/v1/report-cards/approval-configs` (+ CRUD)                                                        | [DENIED]                | 403                                                                                                                               |
| POST   | `/v1/report-cards/:id/submit-approval`                                                              | [DENIED]                | 403                                                                                                                               |
| POST   | `/v1/report-cards/approvals/:id/approve` / `/reject`                                                | [DENIED]                | 403 `report_cards.approve` required.                                                                                              |
| GET    | `/v1/report-cards/approvals/pending`                                                                | [DENIED]                | 403                                                                                                                               |
| POST   | `/v1/report-cards/approvals/bulk-approve`                                                           | [DENIED]                | 403                                                                                                                               |
| GET    | `/v1/report-cards/library` + `/grouped` + `/bundle-pdf`                                             | [DENIED]                | 403 `report_cards.view` / `.manage` required.                                                                                     |
| GET    | `/v1/report-cards/classes/:classId/matrix`                                                          | [DENIED]                | 403                                                                                                                               |
| POST   | `/v1/report-cards/generation-runs` + `/dry-run`                                                     | [DENIED]                | 403 `report_cards.manage` required.                                                                                               |
| GET    | `/v1/report-cards/generation-runs` + `/:id`                                                         | [DENIED]                | 403                                                                                                                               |
| POST   | `/v1/report-cards/custom-fields` (+ CRUD + values PUT/GET)                                          | [DENIED]                | 403 `gradebook.manage` required.                                                                                                  |
| POST   | `/v1/report-cards/grade-thresholds` (+ CRUD)                                                        | [DENIED]                | 403                                                                                                                               |
| GET    | `/v1/report-cards/:id/acknowledgment-status`                                                        | [DENIED]                | 403 `gradebook.view` admin context. (Parent uses their own acknowledgment receipt, not this aggregated view.)                     |
| GET    | `/v1/report-cards/analytics/dashboard` + `/class-comparison`                                        | [DENIED]                | 403 `gradebook.view_analytics` required.                                                                                          |
| POST   | `/v1/report-cards/bulk/generate` / `/publish` / `/deliver`                                          | [DENIED]                | 403 `report_cards.bulk_operations` required.                                                                                      |
| POST   | `/v1/report-cards/batch-pdf`                                                                        | [DENIED]                | 403                                                                                                                               |
| GET    | `/v1/report-cards/students/:studentId/transcript`                                                   | [DENIED]                | 403 `transcripts.generate` required.                                                                                              |
| ALL    | `/v1/report-comments/**`, `/v1/report-card-tenant-settings`, `/v1/report-cards/teacher-requests/**` | [DENIED]                | 403 — teacher/admin-only surfaces.                                                                                                |

---

## 25. Observations & Gaps Flagged

> Populate during test execution. Template rows provided — delete unused, add real findings.

| #     | ID                             | Severity | Summary                                                                                                                                                                                         | Evidence |
| ----- | ------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 25.1  | GAP-PARENT-REPORTCARDS-001     | Medium   | Parent dashboard has no "Recent Report Cards" surface. Parents rely entirely on external delivery (email / WhatsApp / in-app notifications) to discover new cards.                              | §5       |
| 25.2  | GAP-PARENT-ACK-001             | High     | `POST /v1/report-cards/:id/acknowledge` accepts arbitrary `parent_id` in body — if the endpoint does not verify the JWT owner matches the body's parent_id, any parent can impersonate another. | §9.7     |
| 25.3  | GAP-PARENT-ACK-002             | High     | Acknowledge endpoint does not scope-check that the report card is for one of the acting parent's linked students. Verify and fix if reproducible.                                               | §9.8     |
| 25.4  | GAP-PARENT-VERIFY-001          | Medium   | Verification tokens are not tied to the current report card status — a revised card may leak old metadata through an old token.                                                                 | §13.3    |
| 25.5  | GAP-PARENT-VERIFY-002          | High     | `/verify/:token` is not rate-limited. 64-hex token space is computationally infeasible to brute force, but rate limiting is still expected as defence-in-depth.                                 | §14.5    |
| 25.6  | GAP-PARENT-SCOPE-001           | High     | `GET /v1/report-cards/:id` returns any tenant report card when the parent is not a linked parent.                                                                                               | §18.3    |
| 25.7  | GAP-PARENT-SCOPE-002           | High     | `GET /v1/report-cards?student_id=...` returns results for students unlinked to the authenticated parent.                                                                                        | §18.4    |
| 25.8  | GAP-PARENT-READ-001            | Medium   | `GET /v1/report-cards/:id` returns 403 for parents even on their own child's card — if reproduced, parents cannot fetch the JSON snapshot, only the PDF.                                        | §20.6    |
| 25.9  | GAP-PARENT-DELIVERY-EXPIRY-001 | Low/Med  | Delivery link tokens have no expiry. Long-lived links risk being shared forever.                                                                                                                | §7.3     |
| 25.10 | GAP-PARENT-AUDIT-001           | Low      | Rejected cross-tenant attempts (§17) may not be recorded in an audit log surface that platform admins can review.                                                                               | §17.6    |

---

## 26. Sign-Off

| Role              | Name | Date | Signature |
| ----------------- | ---- | ---- | --------- |
| Test Executor     |      |      |           |
| Engineering Lead  |      |      |           |
| Product Owner     |      |      |           |
| Security Reviewer |      |      |           |

**Execution notes:**

- This spec is intentionally heavy on NEGATIVE assertions (§4, §17, §19, §20) because the Report Cards module deliberately has no parent-hub surface. Any positive rendering of admin or teacher UI / endpoints to the parent role is a security bug.
- Run this spec alongside the admin and teacher specs for full role coverage.
- All observed gaps must be triaged into `docs/governance/recovery-backlog.md` with owners and due dates before sign-off.

---

**End of Parent View Spec.**
