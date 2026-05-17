---
title: Runbook front-matter schema
description: Metadata contract used by the Platform Admin observability runbook index.
alert_keys: [runbook.index]
audit_actions: []
error_fingerprints: []
components: [api]
severity: p3
tags: [runbooks, observability]
---

# Runbook Front-Matter Schema

Runbooks can opt into the Platform Admin observability index by adding YAML-style front matter at the top of the markdown file.

```markdown
---
title: Sentry alert triage
description: Procedure for resolving Sentry alerts via the agent runbook.
alert_keys: [sentry.alert.fired]
audit_actions: []
error_fingerprints: []
components: [api, worker]
severity: p2
tags: [sentry, triage]
---
```

Fields are intentionally small and operator-owned:

- `title`: Display title in the runbook catalogue.
- `description`: One-sentence summary.
- `alert_keys`: Alert rule keys this runbook helps resolve.
- `audit_actions`: Platform audit actions this runbook relates to.
- `error_fingerprints`: Known error fingerprints, when stable.
- `components`: Affected components such as `api`, `worker`, `postgres`, `redis`, or `bullmq`.
- `severity`: `p1`, `p2`, or `p3`.
- `tags`: Filter labels for the dashboard and future Copilot evidence lookup.
