---
name: Golden Rule — Tenant Configurable
description: Everything must be tenant-configurable. The system adapts to the school, never the other way around.
type: feedback
---

Everything must be tenant-configurable. The system adapts to the school, never the other way around.

**Why:** Schools have wildly different policies, workflows, terminology, and regulatory requirements. A system that forces schools into a single workflow will lose them. The product's value proposition is that it moulds to the school's existing processes.

**How to apply:** When building any feature, default to making behaviour configurable per tenant (via tenant settings, module toggles, or config tables). Never hardcode a policy that could vary between schools. If unsure whether something should be configurable, assume yes.
