---
name: GDPR is final module
description: User is intentionally deferring GDPR compliance as the final module — building all features first, then applying GDPR lens across everything
type: project
---

GDPR/compliance is intentionally the last module to be built. User wants to complete all functional modules first, then put everything through the GDPR lens as a unified pass.

**Why:** More efficient to apply compliance holistically once all data flows and features are known, rather than retrofitting piecemeal during development.

**How to apply:** Don't block feature discussions or agentic planning on GDPR gaps. Flag GDPR considerations as design notes for the future compliance pass, not as blockers. Still flag genuinely dangerous patterns (e.g., secrets in git) immediately.
