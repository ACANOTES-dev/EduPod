---
name: Local Dev Environment Quirks
description: iCloud cache eviction causes missing node_modules, .app TLD has HSTS preloaded, API proxy setup for local dev
type: feedback
---

Known local development environment issues:

1. **iCloud cache eviction:** The repo lives in iCloud Drive. macOS can evict large directories (especially `node_modules`) to free local storage. If builds fail with missing modules, re-run `pnpm install`.

2. **.app HSTS:** The `edupod.app` TLD has HSTS preloaded in all browsers. This means browsers will refuse HTTP connections to any `.app` domain. Local dev must use `localhost`, not a `.app` domain.

3. **API proxy:** The Next.js frontend proxies API requests to the NestJS backend in development. The proxy configuration is in the Next.js config.

**How to apply:** If something that was working suddenly fails with missing file/module errors, suspect iCloud eviction before debugging the code.
