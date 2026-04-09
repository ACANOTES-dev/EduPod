# Report Cards Redesign — Session State

Snapshot of where we are so a fresh (or compacted) session can pick up without re-briefing.

## What's been designed and committed

Full design + implementation plan lives at `/Users/ram/Desktop/SDB/report-card-spec/` and is committed on `main` (commit `77ee2ec7`, unpushed).

```
report-card-spec/
├── README.md                     ← index + dependency graph + parallelisation matrix
├── design-spec.md                ← authoritative product + architecture design (833 lines)
├── implementation-log.md         ← running log — agents append entries here when done
├── SESSION-STATE.md              ← this file
├── template-01.html              ← Template 1 — Editorial Academic (Fraunces + green + gold)
├── template-02.html              ← Template 2 — Modern Editorial Cobalt Swiss (Bricolage Grotesque + cobalt)
├── template-03.html              ← Template 3 — Warm Contemporary Terracotta (Instrument Serif + terracotta)
└── implementations/
    ├── 00-common-knowledge.md    ← non-negotiable rules, RLS, testing, commits, governance
    ├── 01-database-foundation.md ← schema, migrations, RLS, Zod, seeds  ← COMPLETED on main
    ├── 02-comment-system-backend.md
    ├── 03-settings-and-templates.md
    ├── 04-generation-backend.md
    ├── 05-teacher-requests-backend.md
    ├── 06-matrix-and-library-backend.md
    ├── 07-frontend-overview-library.md
    ├── 08-frontend-report-comments.md
    ├── 09-frontend-wizard-settings.md
    ├── 10-frontend-teacher-requests.md
    ├── 11-pdf-template-rendering.md  ← held for visual design (now unblocked — templates exist)
    └── 12-cleanup-and-docs.md
```

## Implementation progress

| #   | Name                             | Status                         | Notes                                                |
| --- | -------------------------------- | ------------------------------ | ---------------------------------------------------- |
| 01  | Database Foundation              | ✅ Completed on main           | User did it directly                                 |
| 02  | Comment System Backend           | Pending                        | Next up, or in parallel                              |
| 03  | Settings & Templates Backend     | Pending                        | Can run parallel with 02                             |
| 04  | Generation Backend               | Pending                        | Depends on 03                                        |
| 05  | Teacher Requests Backend         | Pending                        | Can run parallel with 02, 03, 06                     |
| 06  | Matrix & Library Backend         | Pending                        | Can run parallel with 02, 03, 05                     |
| 07  | Frontend Overview/Matrix/Library | Pending                        | Depends on 06                                        |
| 08  | Frontend Report Comments         | Pending                        | Depends on 02                                        |
| 09  | Frontend Wizard & Settings       | Pending                        | Depends on 03 + 04                                   |
| 10  | Frontend Teacher Requests        | Pending                        | Depends on 05                                        |
| 11  | PDF Template Rendering           | Unblocked (templates designed) | Implements the HTML templates as React-PDF renderers |
| 12  | Cleanup & Docs                   | Pending                        | Last, after all others                               |

## Parallelisation reminder

- **Wave 1:** 01 (done)
- **Wave 2 backend:** 02, 03, 05, 06 in parallel after 01 lands. 04 after 03.
- **Wave 3 frontend:** 07, 08, 09, 10 in parallel, each after its respective backend.
- **Wave 4:** 11 (PDF templates — now has visual designs to implement).
- **Wave 5:** 12 cleanup.

## Design decisions locked in

1. **Gating:** Admin-only (`report_cards.manage`) runs the generation wizard. Teachers see a library of admin-initiated runs.
2. **Comment windows:** Admin opens a window for a period. Teachers can only edit comments AND call AI during the window. Unique partial index: one open window per tenant.
3. **Comments model:**
   - `report_card_subject_comments` — one per (student, subject, period), written by subject teacher, AI-seeded
   - `report_card_overall_comments` — one per (student, period), written by homeroom teacher or admin
4. **Finalisation:** Strict — generation blocks on any unfinalised/missing comment. Admin override available.
5. **Languages:** English + Arabic only for v1. Never mixed in one PDF.
   - Every student always gets an English report.
   - Students with `preferred_second_language = 'ar'` _also_ get an Arabic copy.
   - English is legally authoritative (Ireland compliance).
6. **Templates = content scope**, not visual style: grades-only for v1; grades+homework, grades+attendance, grades+behaviour, full-master come later when those modules land.
7. **Runs overwrite.** No stacking. Regenerate replaces the old PDF. Generation scope: year group / class / individual.
8. **Class rank:** top 3 only, never show ranks below 3.
9. **Personal info fields:** tenant-level default + per-run override in the wizard.
10. **Principal signature:** stored in tenant settings, pre-filled automatically on generated PDFs.
11. **Teacher request flow:** Teachers can submit "reopen window" or "regenerate for scope" requests. Principal reviews and approves → routes into the wizard/modal pre-filled.

## Report card structure (all three templates)

### Page 1

- **Masthead:** tenant logo watermark, school name, "REPORT CARD", academic year, period ("Semester 1" or "End of Year Report" if all periods), issue date, student photo (toggleable)
- **Section 1 — Student details:** configurable fields (name, DOB, nationality, class, year level, etc.) — admin picks at generation time
- **Section 2 — Academic Results:** subject / mark / grade / remark table (remark pulled from teacher's finalised subject comment)
- **Section 3 — Overall Performance:** performance chart vs class average + overall marks (period breakdowns, final score using tenant period weights, final grade)

### Page 2

- **Section 4 — Assignments** (toggleable — default ON, admin can untoggle at generation)
- **Section 5 — Behavioural** (toggleable — default ON)
- **Section 6 — Attendance** (toggleable — default ON)
- **Principal signature block** with pre-filled digital signature

Every page has a tenant logo watermark in the background at low opacity.

## The three templates

### Template 1 — Editorial Academic (file: `template-01.html`)

- **Use case:** primary printed template for formal, timeless schools
- **Palette:** warm cream paper `#faf6ec`, deep forest green `#1f3a2a`, antique gold `#a37f3e`
- **Fonts:** Fraunces (variable serif, display + body) + Archivo (labels) + JetBrains Mono (figures)
- **Layout:** symmetric, centred
- **Data viz:** 8-axis radar chart (green student polygon vs dashed gold class average)
- **Decoration:** double-ruled page frame, gold diamond corners, monogram watermark, ornamental flourish dividers
- **Vibe:** Oxbridge certificate, ceremonial, timeless
- **User feedback:** "genuinely excellent, truly fantastic"

### Template 2 — Modern Editorial Cobalt Swiss (file: `template-02.html`)

- **Use case:** second printed template for modern, data-forward schools
- **Palette:** near-white `#fafaf7`, cobalt blue `#0b2d82`, mustard accent `#d6a93a`
- **Fonts:** Bricolage Grotesque (variable width + weight, display) + Source Serif 4 (body) + JetBrains Mono
- **Layout:** asymmetric, flush-left, Swiss grid
- **Data viz:** horizontal bar chart — student cobalt bar + mustard tick for class avg
- **Key moves:** outlined "01." section numerals, grade pills, huge "A−" in cobalt dark card, typographic "25/26" watermark bleeding off page
- **Vibe:** The Economist meets Apple annual report
- **User feedback:** liked it

### Template 3 — Warm Contemporary Terracotta (file: `template-03.html`)

- **Use case:** ONLINE-ONLY viewing template (user decided not to use for print)
- **Palette:** blush cream `#faf3ea`, terracotta `#b85c38`, sage `#5e7a5c`
- **Fonts:** Instrument Serif italic (display) + Manrope (body) + JetBrains Mono
- **Layout:** photo-forward, softer rounded corners
- **Data viz:** radial rings grid (4×2, one ring per subject with grade letter in centre)
- **Key moves:** circular grade badges, laurel wreath watermark, terracotta gradient overall card, attendance circular ring on page 2
- **Vibe:** dashboard-y, boutique hotel, warm modern
- **User decision:** "very dashboard-y... might just be an online thing they can view whereas the first two would be actual printed ones"

## Sample data used in all three templates (for consistency)

- **School:** Nurul Huda Language School
- **Student:** Clark Mitchell, NHL-2024-0147
- **DOB:** 14 March 2018, Irish, Second Class 2A
- **Homeroom:** Ms Fatima Al-Awadhi
- **Academic year:** 2025/26, Semester 1
- **Issue date:** 9 April 2026
- **Subjects (8):** Mathematics 92/A, English 88/B+, Science 85/B+, History 79/B, Geography 91/A, Arabic 83/B, Islamic Studies 87/B+, PE 94/A
- **Class averages:** 84, 80, 78, 75, 82, 79, 81, 85
- **Overall:** Period 1 85.2%, Period 2 89.6%, Final 87.4%, Grade A−
- **Assignments:** Completion 5, Punctuality 4, Quality 4
- **Behavioural:** Respect 5, Conduct 5, Attention 4, Participation 5, Responsibility 4
- **Attendance:** 82 total days, 79 present, 3 absent, 2 authorised, 1 unauthorised, 2 late, 0 early, 96.3% rate
- **Principal:** Mr John Doe

## Next task queued after context compaction

**Create Arabic RTL variants of all three templates.**

User's requirements for the Arabic versions:

- Same exact layout as English — no structural changes
- Right-to-left direction (`dir="rtl"` on `<html>`)
- All text translated to Arabic
- Numbers stay in Western numerals (0-9) per project i18n rule
- Gregorian calendar in Arabic formatting
- Logical CSS properties already used throughout all three templates, so flipping `dir` should Just Work for layout
- Arabic font needed — likely Noto Naskh Arabic or Noto Sans Arabic from Google Fonts (SIL OFL, safe for commercial use)
- One new file per template: `template-01-ar.html`, `template-02-ar.html`, `template-03-ar.html`
- Preserve the English versions untouched

Translation notes for the next session:

- "Academic Report" → "بطاقة التقرير الأكاديمي" or "التقرير الأكاديمي"
- "Report Card" → "بطاقة التقرير" (Ireland context — check if school prefers "بطاقة تقرير")
- "Academic Year" → "العام الدراسي"
- "Semester 1" → "الفصل الأول"
- "Student" → "الطالب"
- "First Name" → "الاسم الأول"
- "Last Name" → "اسم العائلة"
- Subject names need Arabic (Mathematics → الرياضيات, English → اللغة الإنجليزية, Science → العلوم, History → التاريخ, Geography → الجغرافيا, Arabic → اللغة العربية, Islamic Studies → التربية الإسلامية, Physical Education → التربية البدنية)
- Remarks need to be freshly authored in Arabic (don't machine-translate from English — the tone should be natural)
- "School Principal" → "مدير المدرسة"
- "Mr John Doe" → "السيد جون دو" (transliterated)
- School name stays English for this tenant since it's a real school — Nurul Huda is already a transliteration, could also show as "مدرسة نور الهدى للغات"

Font URL to add to the Arabic templates:

```
https://fonts.googleapis.com/css2?family=Noto+Naskh+Arabic:wght@400;500;600;700&display=swap
```

Then in CSS, set Arabic font as primary with English fallback for the Latin glyphs that remain (student ID, numbers, dates).

## How to resume after /compact

1. Read this file (`report-card-spec/SESSION-STATE.md`)
2. Read `report-card-spec/design-spec.md` if you need the full design
3. Open the three existing templates to see the reference layouts
4. Build the Arabic variants as described above
