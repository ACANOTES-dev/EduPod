# External Connections & Credentials Reference

Every external service, API, token, and credential this project requires — organised by when you'll need them.

---

## NEEDED FROM DAY ONE (Phase 0 — Local Development)

### 1. PostgreSQL 16+

**Purpose**: Primary database. All application data, all tenants, RLS enforcement.
**Local**: Run via Docker — `docker run --name school-db -e POSTGRES_PASSWORD=... -p 5432:5432 postgres:16`
**Production**: AWS RDS PostgreSQL (set up later)
**Credentials needed**:

```
DATABASE_URL=postgresql://{user}:{password}@{host}:{port}/{database}?schema=public
```

**Notes**: Enable the `CITEXT` extension (`CREATE EXTENSION IF NOT EXISTS citext;`). Local dev uses a simple password. Production uses IAM auth or a strong rotated password.

---

### 2. Redis 7

**Purpose**: Session storage, permission caching, rate limiting, BullMQ job queue coordination, tenant suspension flags.
**Local**: Run via Docker — `docker run --name school-redis -p 6379:6379 redis:7`
**Production**: AWS ElastiCache
**Credentials needed**:

```
REDIS_URL=redis://{host}:{port}
```

**Notes**: No auth needed locally. Production uses ElastiCache with in-transit encryption and auth token.

---

### 3. GitHub Repository

**Purpose**: Source code hosting, CI/CD via GitHub Actions.
**What you need**:

- A GitHub repo (private)
- A Personal Access Token or GitHub App for CI/CD if deploying from Actions
  **Credentials needed** (for CI/CD — stored as GitHub Secrets):

```
# These are set in GitHub repo Settings → Secrets, not in your .env
GITHUB_TOKEN (auto-provided by Actions)
```

**Notes**: You'll add AWS, Sentry, and other deploy-time secrets to GitHub Secrets later when you set up production CI/CD.

---

## NEEDED FOR PHASE 1 (Tenancy, Auth, Branding)

### 4. JWT Signing Secret

**Purpose**: Signs access tokens (JWTs) issued on login.
**What you need**: A strong random secret string (256-bit minimum).
**Credentials needed**:

```
JWT_SECRET=<random-256-bit-string>
JWT_REFRESH_SECRET=<different-random-256-bit-string>
```

**Notes**: Generate with `openssl rand -hex 32`. Different secrets for access and refresh tokens. Production stores these in AWS Secrets Manager, not in `.env`.

---

## NEEDED FOR PHASE 2 (Students, Staff, Search)

### 5. Meilisearch

**Purpose**: Fast fuzzy search for students, parents, staff, households, invoices, applications. Tenant-safe indexes with `tenant_id` filtering.
**Local**: Run via Docker — `docker run --name school-search -p 7700:7700 -e MEILI_MASTER_KEY=... getmeili/meilisearch:latest`
**Production**: Self-hosted on ECS or Meilisearch Cloud
**Credentials needed**:

```
MEILISEARCH_HOST=http://localhost:7700
MEILISEARCH_API_KEY=<master-key>
```

**Notes**: The master key is used server-side only. Create a search-only API key for any client-facing queries (though in this architecture, all search goes through the backend).

---

## NEEDED FOR PHASE 6 (Finance)

### 6. Stripe

**Purpose**: Online payment processing. Each school has its own Stripe account — keys are stored encrypted per tenant, not in `.env`.
**What you need**:

- A **Stripe account** for each school (or test accounts for development)
- **Stripe test mode** keys for development
  **Credentials needed** (for development/testing — per-school):

```
# These are NOT in .env — they're entered by each school_owner in the admin UI
# and stored AES-256 encrypted in tenant_stripe_configs table
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

**Platform-level** (for the encryption key that protects school Stripe keys):

```
# This IS in your infrastructure config / AWS Secrets Manager
STRIPE_ENCRYPTION_KEY_ARN=arn:aws:secretsmanager:region:account:secret:name
```

**Notes**: Each school enters their own Stripe keys in the settings UI. Your platform encrypts them with AES-256 using a key stored in AWS Secrets Manager. You need a Stripe account in test mode for development. Use the Stripe CLI (`stripe listen --forward-to localhost:3000/api/webhooks/stripe`) to forward webhook events locally.

**Stripe CLI** (for local webhook testing):

```bash
brew install stripe/stripe-cli/stripe   # macOS
stripe login
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

---

### 7. AWS Secrets Manager

**Purpose**: Stores the encryption keys used to encrypt/decrypt Stripe keys and staff bank details. Never stores the actual Stripe keys — those are in the database, encrypted.
**What you need**: An AWS account with Secrets Manager access.
**Credentials needed**:

```
AWS_REGION=eu-west-1                    # or your region
AWS_ACCESS_KEY_ID=AKIA...               # for local dev
AWS_SECRET_ACCESS_KEY=...               # for local dev
```

**Notes**: In production, ECS tasks use IAM roles — no access keys needed. For local dev, you either use real AWS credentials or mock the encryption layer with a local key. I'd recommend a local fallback for development:

```
# Local development override — skip Secrets Manager, use a local key
ENCRYPTION_KEY_LOCAL=<random-256-bit-hex>
```

---

## NEEDED FOR PHASE 6B (Payroll)

### 8. Staff Bank Detail Encryption

**Purpose**: Encrypts staff bank account numbers and IBANs at rest.
**What you need**: Uses the SAME AWS Secrets Manager setup as Stripe key encryption (item 7). No additional credentials.
**Notes**: The `bank_encryption_key_ref` column on `staff_profiles` points to the same (or a separate) Secrets Manager ARN. For local dev, the same `ENCRYPTION_KEY_LOCAL` fallback works.

---

## NEEDED FOR PHASE 7 (Communications)

### 9. Resend (Email)

**Purpose**: All transactional email — invitations, password resets, notifications, announcement delivery, WhatsApp fallback.
**What you need**:

- A Resend account (https://resend.com)
- A verified sending domain (e.g., `mail.edupod.app`)
- A webhook endpoint configured for delivery/bounce/complaint events
  **Credentials needed**:

```
RESEND_API_KEY=re_...
RESEND_WEBHOOK_SECRET=whsec_...         # for verifying inbound webhook signatures
RESEND_FROM_EMAIL=info@edupod.app
```

**Notes**: Resend has a free tier (100 emails/day) that's fine for development. You'll need a paid plan for production. The webhook secret is used to verify that incoming delivery status webhooks actually came from Resend. Each school's branding (sender name, reply-to) is applied at send time from `tenant_branding` — but the actual sending domain is platform-level.

---

### 10. Twilio (WhatsApp Business API)

**Purpose**: WhatsApp message delivery to parents who opted in to WhatsApp notifications.
**What you need**:

- A Twilio account (https://www.twilio.com)
- WhatsApp Business API access (requires Facebook Business verification)
- Pre-approved WhatsApp message templates (submitted through Twilio console)
- A Twilio phone number enabled for WhatsApp
  **Credentials needed**:

```
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886   # your Twilio WhatsApp number
```

**Notes**: WhatsApp Business API approval takes time — apply early. Templates must be pre-approved by WhatsApp via Twilio before they can be sent. For development, Twilio provides a sandbox WhatsApp number you can test with. This is platform-level — schools don't have their own Twilio accounts.

**Template approval process**:

1. Design templates in Twilio console (with variable placeholders for school name, student name, etc.)
2. Submit for WhatsApp approval (24–48 hours typically)
3. Store approved template SIDs in your notification_templates table

---

## NEEDED FOR PRODUCTION DEPLOYMENT

### 11. AWS Account (Core Infrastructure)

**Purpose**: Hosts everything — database, cache, compute, storage, secrets.
**Services used**:

- **RDS PostgreSQL** — database
- **ElastiCache Redis** — sessions, cache, queues
- **ECS/Fargate** — frontend, backend, worker containers
- **S3** — logos, website media, temporary import files
- **ALB** — load balancer
- **Secrets Manager** — encryption keys
- **CloudWatch** — infrastructure monitoring and logs
- **ECR** — Docker container registry
  **Credentials needed**:

```
AWS_REGION=eu-west-1
AWS_ACCESS_KEY_ID=AKIA...               # local dev only
AWS_SECRET_ACCESS_KEY=...               # local dev only
AWS_ACCOUNT_ID=123456789012

# S3
S3_BUCKET_NAME=school-platform-assets
S3_REGION=eu-west-1

# RDS (production)
DATABASE_URL=postgresql://...@rds-endpoint:5432/school_platform

# ElastiCache (production)
REDIS_URL=rediss://...@elasticache-endpoint:6379
```

**Notes**: For local development, only S3 and Secrets Manager need real AWS credentials (or you mock them). Everything else runs in Docker locally. In production, ECS tasks use IAM task roles — no hardcoded AWS keys.

---

### 12. Cloudflare for SaaS

**Purpose**: Custom domain routing, SSL certificates, CDN, DDoS protection, edge caching for each school's branded domain.
**What you need**:

- A Cloudflare account (Pro plan or above for SaaS features)
- Your platform's base domain added to Cloudflare (e.g., `edupod.app`)
- Cloudflare for SaaS configured (allows custom hostnames like `app.schoolname.com` to route to your origin)
  **Credentials needed**:

```
CLOUDFLARE_API_TOKEN=...                # API token with Zone and SSL permissions
CLOUDFLARE_ZONE_ID=...                  # your platform domain's zone ID
CLOUDFLARE_ACCOUNT_ID=...
```

**Notes**: Each school gets a free fallback subdomain (`{slug}.edupod.app`). Custom domains (`app.schoolname.com`) are verified and SSL-provisioned through Cloudflare's API. The platform admin triggers this — it's not self-service.

---

### 13. Sentry

**Purpose**: Error tracking and performance monitoring for frontend and backend.
**What you need**: A Sentry account (https://sentry.io). One project for frontend, one for backend.
**Credentials needed**:

```
SENTRY_DSN_BACKEND=https://...@sentry.io/...
SENTRY_DSN_FRONTEND=https://...@sentry.io/...
SENTRY_AUTH_TOKEN=...                   # for source map uploads in CI
SENTRY_ORG=your-org
SENTRY_PROJECT_BACKEND=school-api
SENTRY_PROJECT_FRONTEND=school-web
```

**Notes**: Free tier works for development. You'll want a paid plan for production (for volume and retention). Source maps should be uploaded during CI/CD so stack traces are readable.

---

### 14. Domain & DNS

**Purpose**: Your platform needs a base domain.
**What you need**:

- A registered domain (e.g., `edupod.app`)
- DNS managed by Cloudflare (you'll transfer nameservers)
  **Subdomains you'll use**:

```
edupod.app                        # marketing site (optional, not part of this build)
admin.edupod.app                  # platform admin
{school-slug}.edupod.app          # fallback school access
api.edupod.app                    # backend API (or use path-based routing)
```

---

## SUMMARY: YOUR .env.local FILE

This is what your local development `.env.local` looks like with everything filled in:

```bash
# ============================================================
# DATABASE
# ============================================================
DATABASE_URL=postgresql://postgres:localpassword@localhost:5432/school_platform

# ============================================================
# REDIS
# ============================================================
REDIS_URL=redis://localhost:6379

# ============================================================
# AUTH
# ============================================================
JWT_SECRET=<openssl rand -hex 32>
JWT_REFRESH_SECRET=<openssl rand -hex 32>

# ============================================================
# SEARCH
# ============================================================
MEILISEARCH_HOST=http://localhost:7700
MEILISEARCH_API_KEY=<your-master-key>

# ============================================================
# ENCRYPTION (local dev fallback — skips AWS Secrets Manager)
# ============================================================
ENCRYPTION_KEY_LOCAL=<openssl rand -hex 32>

# ============================================================
# STRIPE (test mode — for finance module development)
# ============================================================
STRIPE_TEST_SECRET_KEY=sk_test_...
STRIPE_TEST_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# ============================================================
# EMAIL (Resend)
# ============================================================
RESEND_API_KEY=re_...
RESEND_WEBHOOK_SECRET=whsec_...
RESEND_FROM_EMAIL=info@edupod.app

# ============================================================
# WHATSAPP (Twilio)
# ============================================================
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886

# ============================================================
# AWS (local dev — only needed if using real S3/Secrets Manager)
# ============================================================
AWS_REGION=eu-west-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
S3_BUCKET_NAME=school-platform-dev

# ============================================================
# CLOUDFLARE (not needed for local dev)
# ============================================================
# CLOUDFLARE_API_TOKEN=...
# CLOUDFLARE_ZONE_ID=...
# CLOUDFLARE_ACCOUNT_ID=...

# ============================================================
# MONITORING (not needed for local dev)
# ============================================================
# SENTRY_DSN_BACKEND=...
# SENTRY_DSN_FRONTEND=...

# ============================================================
# APP
# ============================================================
NODE_ENV=development
APP_URL=http://localhost:3000
API_URL=http://localhost:3001
```

---

## WHAT YOU NEED TO SIGN UP FOR

| Service              | URL                               | Free tier?               | When needed              |
| -------------------- | --------------------------------- | ------------------------ | ------------------------ |
| **GitHub**           | github.com                        | Yes                      | Day one                  |
| **Stripe**           | stripe.com                        | Yes (test mode)          | Phase 6                  |
| **Resend**           | resend.com                        | Yes (100/day)            | Phase 7                  |
| **Twilio**           | twilio.com                        | Trial credit             | Phase 7                  |
| **AWS**              | aws.amazon.com                    | Free tier (12 months)    | Phase 0 (S3), production |
| **Cloudflare**       | cloudflare.com                    | Pro plan needed for SaaS | Production               |
| **Sentry**           | sentry.io                         | Yes (limited)            | Production               |
| **Domain registrar** | Any (Namecheap, Cloudflare, etc.) | No                       | Production               |
