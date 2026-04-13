# Admissions Bug Log — Decisions Journal

Running record of judgement calls made while executing the bug log. Each
entry includes the bug ID, date, decision, and one-line reason.

---

- ADM-001 (2026-04-13): Built dedicated `/admissions/overrides` page (Option A) instead of redirecting hub tile. — Claude Opus 4.6
- ADM-004 (2026-04-13): Re-framed bug after user clarified NHQS is EUR not AED. Fixed Payment tab to use tenant currency (Option B) instead of stale `application.currency_code`. Parent dashboard `€450` is correct for an EUR tenant — no change needed there. — Claude Opus 4.6
- ADM-002 (2026-04-13): Used `unwrap()` (Option A — defensive destructure) instead of redirecting `/apply` to a static page. The root cause was the missing envelope unwrap, not a deprecated tenant picker. — Claude Opus 4.6
- ADM-003 (2026-04-13): Inline string formatter for note body (`18 Apr 2026, 12:13 UTC`) instead of structured-storage refactor. Reasons: minimal blast radius, no schema migration, audit-trail backwards-compat preserved (existing ISO notes left alone). — Claude Opus 4.6
- ADM-005 (2026-04-13): Inject single-option label list into the two target comboboxes (Option A/B hybrid) instead of swapping them for plain text (Option C). Keeps the renderer generic and the form schema unchanged. — Claude Opus 4.6
