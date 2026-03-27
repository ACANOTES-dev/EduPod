---
name: Production Infrastructure
description: Production on Hetzner VPS (edupod-prod-1), PM2 process manager, GitHub Actions CI/CD, edupod.app domain
type: project
---

Production runs on a Hetzner VPS (hostname `edupod-prod-1`), not AWS/GCP/Azure.

- **Process manager:** PM2 (api, web, worker services)
- **CI/CD:** GitHub Actions deploys on push to main
- **Domain:** edupod.app with tenant subdomains
- **Database:** PostgreSQL with PgBouncer (transaction mode)
- **Cache/Queues:** Redis (BullMQ)
- **No staging environment** — production is the only deployed environment

**Why:** Hetzner was chosen for cost-effectiveness during pre-launch. Single VPS keeps ops simple for a solo founder.

**How to apply:** All deployment references assume this stack. There is no staging — changes deploy directly to production via GitHub Actions. Treat every push to main as a production deploy.
