---
name: Autonomous Commit/Deploy Workflow
description: Autonomous commit/deploy workflow + mandatory CI pre-flight — turbo type-check and turbo lint before every push
type: feedback
---

The workflow is fully autonomous once approved: implement → test → commit → push → monitor deploy → verify on production.

**Mandatory CI pre-flight before every push:**
1. `turbo type-check` — must pass
2. `turbo lint` — must pass

Never push code that fails type-check or lint. Run both locally before pushing. If either fails, fix before committing.

**Why:** There is no staging environment. Every push to main deploys to production. A broken push means broken production. The pre-flight catches issues before they reach the server.

**How to apply:** After completing work and before `git push`, always run type-check and lint. This is non-negotiable regardless of how small the change is.
