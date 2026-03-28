---
name: Multilingual Strategy
description: Phase 3 adds 8 languages beyond English/Arabic — French, Spanish, Irish, Polish, Romanian, German, Chinese, Japanese. RTL-first architecture is intentional.
type: project
---

Phase 3 (pre-launch) includes a codebase refactor to add French, Spanish, Irish, Polish, Romanian, German, Chinese, and Japanese — making EduPod a 10-language multilingual platform.

Arabic/RTL was built first deliberately: (1) confirmed Arabic-speaking tenant needed it, and (2) RTL is architecturally painful to retrofit, so solving it first means all future LTR languages are straightforward additions (translation files + font support).

**Why:** The positioning is "every parent engages with their child's school in their own language." This is a competitive differentiator — Compass uses Google Translate, VSware and Tyro are English-only. Irish is specifically important for 300+ Gaeltacht/Irish-medium schools. Polish and Romanian are the largest immigrant language communities in Irish schools.

**How to apply:** Never frame the product as "Arabic-first" or bilingual. Frame it as multilingual-by-architecture. When building any user-facing feature, ensure it uses the i18n system so it automatically works across all 10 locales. The Irish demo should showcase English + Irish, not English + Arabic.
