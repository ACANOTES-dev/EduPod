# Seed Data Configuration

This file documents the seed data for local development. The actual seed script
lives at `packages/prisma/seed.ts` (created in Phase 0).

## Tenant 1 — Nurul Huda Quranic School

```json
{
  "name": "Nurul Huda Quranic School",
  "slug": "nhqs",
  "status": "active",
  "default_locale": "en",
  "timezone": "Europe/Dublin",
  "date_format": "DD/MM/YYYY",
  "currency_code": "EUR",
  "academic_year_start_month": 9
}
```

**Fallback domain**: `nhqs.edupod.app`

## Tenant 2 — Midaad UlQalam

```json
{
  "name": "Midaad UlQalam",
  "slug": "mdad",
  "status": "active",
  "default_locale": "ar",
  "timezone": "Africa/Tripoli",
  "date_format": "DD/MM/YYYY",
  "currency_code": "LYD",
  "academic_year_start_month": 11
}
```

**Fallback domain**: `mdad.edupod.app`

## Seed Users (per tenant)

Each tenant gets the following users seeded for development:

| Role | Email | Password | Notes |
|------|-------|----------|-------|
| Platform Owner | `owner@edupod.app` | `Dev123!@#` | Platform-level, not tenant-scoped |
| School Owner (Principal) | `principal@nhqs.test` / `principal@mdad.test` | `Dev123!@#` | Full admin + payroll access |
| School Admin | `admin@nhqs.test` / `admin@mdad.test` | `Dev123!@#` | Admin without payroll |
| Teacher | `teacher@nhqs.test` / `teacher@mdad.test` | `Dev123!@#` | Staff tier |
| Finance Staff | `finance@nhqs.test` / `finance@mdad.test` | `Dev123!@#` | Finance module access |
| Parent | `parent@nhqs.test` / `parent@mdad.test` | `Dev123!@#` | Parent tier |

**Note**: These are development-only credentials. The seed script should never run in production.
