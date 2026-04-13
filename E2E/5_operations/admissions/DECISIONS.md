# Admissions Bug Log — Decisions Journal

Running record of judgement calls made while executing the bug log. Each
entry includes the bug ID, date, decision, and one-line reason.

---

- ADM-001 (2026-04-13): Built dedicated `/admissions/overrides` page (Option A) instead of redirecting hub tile. — Claude Opus 4.6
- ADM-004 (2026-04-13): Re-framed bug after user clarified NHQS is EUR not AED. Fixed Payment tab to use tenant currency (Option B) instead of stale `application.currency_code`. Parent dashboard `€450` is correct for an EUR tenant — no change needed there. — Claude Opus 4.6
