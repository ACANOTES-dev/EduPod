---
name: P-POD Integration
description: NON-NEGOTIABLE — Automated sync with Post-Primary Online Database for student data and CBA results. Cannot sell to any Irish post-primary school without this.
type: project
---

**Priority:** Non-negotiable. Blocker for Irish post-primary market entry.

**What it is:**
- P-POD (Post-Primary Online Database) is the DES central database for all post-primary student and school data
- Accessed via the Department's Esinet secure portal
- Schools must generate October Returns (no later than 7 October each year)
- Junior Cycle CBA (Classroom-Based Assessment) results uploaded via P-POD
- Senior cycle data also managed through P-POD

**What EduPod must do:**
- Automated daily student data sync to P-POD (like Compass does)
- CBA result upload
- October Returns generation
- Student data validation before submission
- Sync status tracking and error handling

**Competitor status:**
- Compass: automated daily P-POD sync including CBA uploads
- VSware: full P-POD sync — battle-tested across 400+ schools for 10+ years
- Tyro: assumed to have this (market entry requirement)

**Effort estimate:** Medium — it's a defined API/file format. Student data already exists in EduPod. Main work is understanding the P-POD submission format and building the sync pipeline.

**How to apply:** Must be built before approaching any Irish post-primary school. Could be a Phase 2 task or early in a dedicated "Irish market readiness" sprint.
