---
name: Server SSH Access
description: Production server SSH login and manual deploy commands — verify exact command with user if needed
type: reference
---

Production server is `edupod-prod-1` on Hetzner. SSH access is used for:
- Checking service health (`pm2 status`, `pm2 logs`)
- Manual deploys when GitHub Actions pipeline fails
- Server-side debugging

**Note:** The exact SSH command (user, IP, key path) was in a previous memory that was lost. Verify with user before first SSH in a new session.

Manual deploy sequence on server:
1. `cd /path/to/app` (verify actual path)
2. `git pull origin main`
3. `pnpm install --frozen-lockfile`
4. `npx prisma migrate deploy`
5. `pnpm build`
6. `pm2 restart all`
