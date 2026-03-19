---
name: Self-hosted GitHub Actions runner
description: Pre-launch infrastructure task — replace SSH-based deploys with a self-hosted runner on the Hetzner server to eliminate inbound port 22 exposure
type: project
---

Replace the current SSH-based deploy workflow (appleboy/ssh-action) with a self-hosted GitHub Actions runner installed on the Hetzner production server.

**Why:** The current deploy SSHs from GitHub Actions into the server, which requires port 22 open to the world (or GitHub's IP ranges). A self-hosted runner runs on the server and pulls jobs from GitHub over HTTPS (outbound only), so port 22 can be locked back down to the operator's IP only.

**How to apply:** Before going live, install a self-hosted runner on `edupod-prod-1`, update the deploy workflow to `runs-on: self-hosted`, and re-lock the Hetzner firewall SSH rule to the operator's IP. This is tracked in the pre-launch checklist.
