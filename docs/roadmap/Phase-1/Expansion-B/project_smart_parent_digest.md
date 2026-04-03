---
name: Smart Parent Daily Digest
description: SHOULD-HAVE — Automated daily push summary per child (attendance, grades, behaviour, homework) in parent's language. Flips engagement from pull to push.
type: project
---

**Priority:** Should-have. Low effort (notification system exists). Massive engagement impact.

**What it is:**
Instead of requiring parents to log into a portal to check on their child, push a personalised daily summary at a configurable time (e.g., 4pm). Short, scannable, in the parent's language.

**Example digest:**

> **Amira — Tuesday 15 October**
> Attended all 6 classes today
> Received a merit in Science (Mrs. O'Brien)
> Maths homework due Thursday
> No fees outstanding
> [View full details →]

**What EduPod should build:**

- **Daily digest worker:** BullMQ job that runs at configurable time per tenant
- **Per-child aggregation:** pull today's attendance, any grades entered, any behaviour events, upcoming homework/deadlines, outstanding fees
- **Multi-child support:** parents with multiple children get one digest with sections per child
- **Language rendering:** digest rendered in the parent's preferred language (leverages existing i18n)
- **Channel delivery:** push notification (app), WhatsApp, email — parent's preferred channel
- **Smart content:** only include sections with activity. If nothing happened today, send "All good today — attended all classes, no new updates"
- **Opt-out:** parents can disable or change frequency (daily, weekly summary, off)
- **Engagement tracking:** track open rates, click-through to portal. Feed into parent engagement score for predictive early warning.
- **School configuration:** schools choose which data types appear in digest, what time it sends, whether to include financial info

**Why it's revolutionary:**

- No school MIS does this. Parents must actively log in to check portals.
- The Polish mother who never logs into VSware's portal WILL read a WhatsApp message in Polish at 4pm
- This is the feature that makes parents say "this school really communicates well"
- Parent engagement data feeds into the predictive early warning system — a parent who stops opening digests is a signal
- It costs almost nothing to build — the data exists, the notification infrastructure exists, the i18n exists

**Effort estimate:** Low — this is a BullMQ job that aggregates existing data and renders it through the existing notification/template system. The architectural patterns are all in place.

**How to apply:** Build early — this is low effort, high impact, and immediately visible to parents. Could be one of the first features shipped after statutory integrations. Every school demo should show this: "every parent, every day, in their own language."
