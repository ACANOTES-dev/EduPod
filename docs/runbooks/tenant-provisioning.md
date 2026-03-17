# Tenant Provisioning Runbook

Last updated: 2026-03-16

---

## Overview

This runbook covers the process of onboarding a new school onto the platform. Tenant provisioning is performed by a platform administrator through the platform admin panel or via direct API calls. The process creates the tenant record, configures domains, enables modules, invites the initial school owner, and seeds system data.

---

## Prerequisites

- Platform administrator credentials (user with `platform_owner` role)
- School details: name, slug (URL-safe identifier), timezone, currency, default locale
- DNS access for custom domain configuration (if applicable)
- School branding assets: logo (PNG/SVG, min 200x200px), primary colours

---

## Step 1: Create Tenant

### Via Platform Admin API

```bash
curl -X POST https://api.edupod.app/api/v1/admin/tenants \
  -H "Authorization: Bearer <platform-admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Al Noor International School",
    "slug": "al-noor",
    "default_locale": "ar",
    "timezone": "Asia/Riyadh",
    "currency_code": "SAR",
    "date_format": "DD/MM/YYYY",
    "academic_year_start_month": 9
  }'
```

**Required fields:**
| Field | Type | Description |
|---|---|---|
| `name` | string | Display name of the school (max 255 chars) |
| `slug` | string | URL-safe identifier, must be unique (max 100 chars) |
| `default_locale` | string | `en` or `ar` |
| `timezone` | string | IANA timezone (e.g., `Asia/Riyadh`, `Asia/Dubai`) |
| `currency_code` | string | ISO 4217 code (e.g., `SAR`, `AED`, `USD`) |
| `date_format` | string | Date display format (e.g., `DD/MM/YYYY`) |
| `academic_year_start_month` | number | 1-12, month when the academic year begins |

**Response:** Returns the created tenant object with a generated UUID `id`.

### What Happens Automatically

On tenant creation, the system automatically seeds:

1. **Default roles**: `school_owner`, `school_admin`, `teacher`, `accountant`, `hr_manager`, `registrar`, `parent`
2. **Permissions**: Full permission set linked to each default role
3. **Notification templates**: Platform-level templates cloned for the tenant
4. **Sequence counters**: Receipt, invoice, application, payslip number sequences initialised at 0

---

## Step 2: Domain Configuration

### 2.1 Platform Subdomain (Automatic)

Every tenant automatically gets a platform subdomain:

```
https://{slug}.edupod.app
```

For example: `https://al-noor.edupod.app`

This is configured automatically via Cloudflare for SaaS and requires no manual DNS setup.

### 2.2 Custom Domain (Optional)

If the school wants to use their own domain (e.g., `portal.alnoor.edu.sa`):

**Step 1: Add the domain via API**

```bash
curl -X POST https://api.edupod.app/api/v1/admin/tenants/<tenant-id>/domains \
  -H "Authorization: Bearer <platform-admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "hostname": "portal.alnoor.edu.sa",
    "domain_type": "app",
    "is_primary": true
  }'
```

Domain types:
- `app` -- the main school management portal
- `public_site` -- the public-facing school website

**Step 2: DNS verification**

The API response includes DNS records that the school must configure:

```json
{
  "verification_record": {
    "type": "TXT",
    "name": "_cf-custom-hostname.portal.alnoor.edu.sa",
    "value": "<verification-token>"
  },
  "cname_record": {
    "type": "CNAME",
    "name": "portal.alnoor.edu.sa",
    "value": "edupod.app"
  }
}
```

**Step 3: Verify DNS propagation**

After the school configures their DNS:

```bash
# Check DNS propagation
dig TXT _cf-custom-hostname.portal.alnoor.edu.sa
dig CNAME portal.alnoor.edu.sa

# The platform periodically checks verification status
# Or trigger manually via the platform admin panel
```

**Step 4: SSL provisioning**

Once DNS is verified, Cloudflare automatically provisions an SSL certificate. Status transitions:
- `pending` -> `verified` (DNS verified) -> `active` (SSL provisioned)

If verification fails, check:
- DNS records are correctly configured
- TTL has expired (can take up to 48 hours for some DNS providers)
- No conflicting A/AAAA records

---

## Step 3: Module Enablement

Enable the modules the school has subscribed to:

```bash
# Enable each required module
curl -X PATCH https://api.edupod.app/api/v1/admin/tenants/<tenant-id>/modules/payroll \
  -H "Authorization: Bearer <platform-admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"is_enabled": true}'
```

**Available modules:**

| Module Key | Description |
|---|---|
| `payroll` | Staff payroll processing, payslip generation |
| `finance` | Fee management, invoicing, payment tracking |
| `attendance` | Student and staff attendance tracking |
| `admissions` | Application processing, enrolment pipeline |
| `scheduling` | Timetable management, auto-scheduling |
| `gradebook` | Grade entry, report cards, transcripts |
| `communications` | Announcements, notifications, messaging |
| `website` | Public-facing school website builder |

Enable modules one at a time. Each module toggle is recorded in the audit log.

To list currently enabled modules:

```bash
curl https://api.edupod.app/api/v1/admin/tenants/<tenant-id>/modules \
  -H "Authorization: Bearer <platform-admin-token>"
```

---

## Step 4: Initial User Invitation

Create the school's first administrator (school_owner role):

### 4.1 Send Invitation

The school owner is invited via the platform admin panel or API. The invitation flow:

1. Platform admin enters the school owner's email and name
2. System creates an invitation record with status `pending`
3. An invitation email is sent via Resend with a secure, time-limited link
4. The school owner clicks the link, sets their password, and optionally configures MFA
5. Invitation status transitions to `accepted`
6. A `tenant_membership` record is created with the `school_owner` role

### 4.2 Verify Invitation Delivery

- Check Resend dashboard for delivery status
- If email bounces, verify the email address and retry
- Invitation links expire after 72 hours; expired invitations can be re-sent

---

## Step 5: Branding Configuration

The school owner (or platform admin) configures the school's visual branding:

1. **Logo upload**: Upload via the school settings page (or platform admin panel)
   - Supported formats: PNG, SVG, JPEG
   - Minimum dimensions: 200x200px
   - Stored in S3, served via CloudFront CDN

2. **School name**: Displayed in the header, emails, and PDF documents
   - Set during tenant creation, editable via settings

3. **Brand colours**: Primary and accent colours for the school's portal
   - Configured via the tenant branding settings
   - Applied as CSS custom properties, overriding the default theme

---

## Step 6: Post-Provisioning Verification

After provisioning, verify:

- [ ] Tenant appears in the platform admin tenant list with `active` status
- [ ] Platform subdomain resolves and shows the login page
- [ ] Custom domain (if configured) resolves and SSL is active
- [ ] Invitation email was delivered to the school owner
- [ ] School owner can log in and access the dashboard
- [ ] Enabled modules appear in the school's navigation
- [ ] Disabled modules return 403 when accessed directly
- [ ] RLS isolation: verify the new tenant cannot see data from other tenants
- [ ] Branding (logo, colours) displays correctly
- [ ] Locale and RTL direction render correctly (for Arabic-default tenants)

---

## Troubleshooting

### Tenant creation fails

- Check that the slug is unique (case-insensitive)
- Check that all required fields are provided
- Check API logs for database constraint violations

### Custom domain not verifying

- Confirm DNS records match exactly (including trailing dots in CNAME targets)
- Wait for DNS propagation (up to 48 hours)
- Check Cloudflare dashboard for the custom hostname status
- Ensure no CAA records block Cloudflare certificate issuance

### School owner cannot log in

- Verify the invitation was accepted (check invitation status)
- Verify the tenant membership exists with the correct role
- Check that the tenant status is `active` (not `suspended`)
- Check Redis for session storage issues

### Modules not appearing

- Verify the module is enabled via the API
- Check that the frontend is reading module toggles correctly
- Hard-refresh the browser to clear any stale cached responses
