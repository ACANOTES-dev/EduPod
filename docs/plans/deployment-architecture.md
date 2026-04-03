# Deployment Architecture Plan

## Status: Pre-launch planning — not yet actionable

## Current State

- **Local**: Development machine. Code editing, unit/integration tests (Jest, Vitest).
- **Production (edupod.app)**: Single Hetzner VPS. Real domain, real URLs. Currently the only deployed environment. Being used as a development/testing ground since there are no real tenants yet. Deployed via GitHub Actions.
- **No staging environment.**
- **No demo environment.**

## Target Architecture

Three deployed environments plus local development:

| Environment | Server                           | Database                        | Domain             | Purpose                                              |
| ----------- | -------------------------------- | ------------------------------- | ------------------ | ---------------------------------------------------- |
| Local       | Dev machine                      | Local PG                        | localhost          | Development + unit tests                             |
| Staging     | Current Hetzner VPS (repurposed) | Current DB (retains test data)  | staging.edupod.app | Integration testing, QA, pre-production verification |
| Production  | **New** Hetzner VPS              | **Fresh** DB, seed data only    | edupod.app         | Real tenants, real data                              |
| Demo        | Smallest Hetzner instance        | Curated sample data, auto-reset | demo.edupod.app    | Sales tool for prospective tenants                   |

## Rollout Sequence

### Step 1 — Demo (before first tenant onboarding)

The demo is a sales tool, not a dev tool. Target market (schools) is non-technical and risk-averse — they need to experience the product hands-on before committing. Demo must exist before actively pursuing tenants beyond the two already committed.

Demo requirements:

- Curated, realistic school data (not dev/test garbage)
- Role-switching login so prospects can experience different user types
- Auto-reset on a schedule (so one prospect can't break it for the next)
- Smallest viable Hetzner instance (single user at a time)
- Own subdomain: demo.edupod.app

### Step 2 — Fresh Production (at launch)

- Stand up a new Hetzner VPS for production
- Fresh database — seed data only, no test artifacts
- Point edupod.app DNS to the new server
- Onboard the two waiting tenants here

### Step 3 — Current Server Becomes Staging

- Current Hetzner VPS (with all its test data) becomes staging
- Point staging.edupod.app to this server
- Can be downsized to a smaller instance if cost is a concern — only used by the developer, not concurrent users

## Deployment Pipeline (Post-Launch)

- Code changes deploy to staging first (via GitHub Actions)
- Manual promotion to production after verification on staging
- Database migrations apply independently per environment via Prisma
- Code ships between environments; data never crosses environments

## Cost Considerations

- Production: current server spec (sized for real load)
- Staging: can be smaller/cheaper (just one person testing)
- Demo: smallest available instance
- Total cost increase is roughly current + 40-60%, not tripling

## Open Items

- [ ] Define GitHub Actions workflow for multi-environment deploys
- [ ] Plan DNS cutover process (edupod.app → new server)
- [ ] Design demo login/role-switching UX
- [ ] Define demo data seeding and auto-reset mechanism
- [ ] Determine staging server downsize specs
