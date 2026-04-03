---
name: ETB Cluster Analytics Dashboard
description: Post-launch vision for ETB-level analytics dashboards — cross-school performance comparison within ETB clusters, optional cross-network benchmarking
type: project
---

Strategic product idea: build an ETB-tier analytics dashboard that gives ETB boards visibility across all schools in their cluster.

**The concept:**

- New role tier: ETB Admin (between Platform Admin and School Admin)
- ETB Admin sees aggregate and comparative analytics across their cluster's schools
- Metrics: attendance, behaviour, assessments, and any other cross-school data
- Data is private to the ETB unless they opt into cross-network benchmarking

**Benchmarking layers:**

- Intra-ETB (easy): shared frameworks, coordinated policies, same assessment structures — apples to apples
- Cross-ETB (harder but valuable): normalise on universal metrics (attendance rates, absence patterns, retention, grade distributions)
- National (aspirational): if enough ETBs adopt, becomes de facto national benchmarking

**Business model:**

- School MIS: per-student pricing to schools (Layer 1)
- ETB dashboard: flat annual fee per ETB (~€15-30K/year) (Layer 2)
- Cross-network benchmarking: opt-in, additional fee or incentive (Layer 3)
- The flywheel: ETB wants dashboard → needs all schools on EduPod → mandates cluster adoption → more schools = better benchmarking → attracts more ETBs

**Valuation impact:**

- Shifts positioning from "vendor" (6-8x ARR) to "platform" (10-15x ARR)
- Creates data network effects no competitor can replicate
- At national scale: policy influence, research partnerships, government contracts

**Why it matters:**

- Creates a new buyer (ETB board, not individual principals) — one decision onboards 10-35 schools
- No competitor offers this (Compass has UK MAT features but nothing Irish ETB-specific)
- Multi-tenant RLS architecture already supports scoped cross-tenant analytics
- Lock-in is value-driven — pulling one school out breaks the network's data

**How to apply:** This is post-launch. Do not build it now. But ensure architectural decisions today don't prevent it — e.g., keep tenant grouping possible, ensure analytics queries can be scoped to tenant sets, keep assessment/attendance data structures normalisation-friendly. When approaching ETBs for pilot schools, mention this vision — it differentiates the pitch from competitors who can only sell single-school.
