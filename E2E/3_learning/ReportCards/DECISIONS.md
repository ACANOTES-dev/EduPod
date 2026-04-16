# Report Cards Bug-Fix Decisions Log

- RC-C001 (2026-04-16): Removed parent_id from request body, derive from JWT via ParentReadFacade. Old check compared user.id with parent.id (different tables, always mismatched). Added parent-specific endpoint. — Claude Opus 4.6
- RC-C004 (2026-04-16): Added Puppeteer request interception blocking all non-data/about network requests in both API and worker renderers. Added extra Chromium flags. — Claude Opus 4.6
- RC-C005 (2026-04-16): Set Handlebars `strict: true` to block prototype traversal SSTI. Combined with existing `noEscape: false` and new request interception. — Claude Opus 4.6
- RC-C007 (2026-04-16): No code change — vulnerability already mitigated by PostgreSQL `SET LOCAL` semantics (transaction-scoped, auto-reverts). — Claude Opus 4.6
- RC-L001 (2026-04-16): Added frontend admin-only guard on analytics page (useRoleCheck + ADMIN_ROLES). Backend already had the permission decorator. — Claude Opus 4.6
- RC-C006 (2026-04-16): No code change — revise() already filters by tenant_id in the initial lookup. Cross-tenant revision is impossible. — Claude Opus 4.6
- RC-C020 (2026-04-16): No code change — AI endpoint is hardcoded via Anthropic SDK, not tenant-configurable. SSRF vector does not exist. — Claude Opus 4.6
- RC-L007 (2026-04-16): Added UUID regex guard before API call. Non-UUID classId renders "Class not found" instead of raw error toast. — Claude Opus 4.6
- RC-L009 (2026-04-16): Added 403 → "permission denied" and 404 → "class not found" differentiation. Generic "Failed to load" only on 500/network errors. — Claude Opus 4.6
