# Report Cards World-Class Enhancement — Design Spec

## Overview

19 features that transform report cards from a basic generate-and-publish system into a fully customizable, AI-powered, workflow-driven report card platform. Every feature is tenant-configurable.

**Golden Rule:** Everything configurable by the tenant. The system adapts to the school.

**UX Principle:** Complex operations in the background, simple and friendly interface for the user.

---

## R1. Report Card Template Designer

**Purpose:** Let tenants customize their report card layout with section-based design + style presets.

**Data Model:**
- `report_card_templates` — tenant_id, name, is_default (boolean), locale (en/ar), sections_json (JSON array), branding_overrides_json (JSON, nullable), created_by_user_id, created_at, updated_at
  - Each section: `{ id: string, type: enum, order: number, style_variant: string, enabled: boolean, config: Record<string, unknown> }`
  - Section types: `header`, `student_info`, `grades_table`, `attendance_summary`, `competency_summary`, `conduct`, `extracurriculars`, `custom_text`, `teacher_comment`, `principal_comment`, `threshold_remarks`, `comparative_indicators`, `qr_code`, `signature_area`
  - Style variants per section: e.g., grades_table has "compact", "expanded", "bordered", "minimal"
  - Branding overrides: primary_color, font_family, logo_position, custom_css
  - Unique on (tenant_id, name, locale)

**Behavior:**
- Tenant opens template designer → sees section list with toggle on/off, drag to reorder, style variant picker per section
- Live preview panel shows how the report card will look with sample data
- Can create multiple templates (e.g., "Primary School", "Secondary School", "IB Diploma")
- One template marked as default per locale
- Existing "classic" and "modern" become system templates (non-editable, always available)

**UI:**
- Settings > "Report Card Templates" page
- Template editor: left panel = section list with toggles/reorder, right panel = live preview
- Each section expandable to configure options (e.g., grades_table: show assessment detail yes/no, show percentage yes/no)

---

## R2. AI Template Converter

**Purpose:** School uploads their existing report card (PDF/image), AI converts to HTML template.

**Behavior:**
- In template designer: "Import from Existing" button
- Upload PDF or image of current report card
- System sends to Claude Vision with prompt: "Convert this report card layout to a structured template definition matching our section types"
- AI returns a sections_json configuration matching the uploaded layout
- Template saved as draft — school can edit in designer before activating
- One-shot conversion, then manual editing if needed

**AI Prompt includes:** uploaded image + list of available section types with their config options + school branding info

**Rate limit:** 10 template conversions per tenant per month (this is an expensive operation)

---

## R3. Multi-Step Approval Workflow

**Purpose:** Configurable approval pipeline before report cards can be published.

**Data Model:**
- `report_card_approval_configs` — tenant_id, name, steps_json (JSON array), is_active (boolean), created_at, updated_at
  - Each step: `{ order: number, role_key: string, label: string, required: boolean }`
  - Preset configs auto-created: "Direct Publish" (0 steps), "Two-Step" (teacher → principal), "Three-Step" (teacher → HOD → principal)
  - Unique on (tenant_id, name)
- `report_card_approvals` — tenant_id, report_card_id, step_order (int), role_key (string), status ('pending' | 'approved' | 'rejected'), actioned_by_user_id (nullable), actioned_at (nullable), rejection_reason (text, nullable), created_at, updated_at
  - Unique on (tenant_id, report_card_id, step_order)

**Behavior:**
- When a report card is submitted for approval, system creates approval records for each step
- Each approver sees pending items on their dashboard
- Approve → advances to next step. Reject → sends back to teacher with reason.
- All steps approved → auto-publishes (or becomes ready-to-publish based on tenant setting)
- Bulk approve: approver can approve all pending for their step at once

**Tenant Settings:**
- `reportCardApprovalConfigId` — which approval config is active (nullable = direct publish)

---

## R4. Bulk Operations Pipeline

**Purpose:** End-to-end bulk flow for generating, reviewing, approving, and publishing report cards.

**No new tables** — orchestrates existing endpoints.

**UI:**
- Report Cards > "Bulk Operations" page
- Step 1: Select class + period → "Generate All Drafts"
- Step 2: Review dashboard — table showing all students, completion status, comment status (filled/empty), approval status
- Step 3: "Submit All for Approval" (if approval workflow enabled) or "Publish All"
- Step 4: "Notify All Parents" (triggers delivery)
- Progress indicators throughout
- Can filter and act on subsets (e.g., publish only students whose comments are complete)

---

## R5. Automated Parent Delivery

**Purpose:** Auto-send report card to parents on publish via email/WhatsApp.

**Data Model:**
- `report_card_deliveries` — tenant_id, report_card_id, parent_id, channel ('email' | 'whatsapp' | 'in_app'), status ('pending' | 'sent' | 'failed' | 'viewed'), sent_at, viewed_at, created_at
  - Index on (tenant_id, report_card_id)

**Behavior:**
- On publish: system looks up student's parents/guardians
- Sends via tenant's configured primary channel (email or WhatsApp) + in-app notification
- Email includes PDF attachment
- WhatsApp sends notification with link to parent portal
- Tracks delivery status and view status
- Retry failed deliveries

**Tenant Settings:**
- `reportCardAutoDelivery` — boolean (default: true)
- `reportCardDeliveryChannel` — 'email' | 'whatsapp' | 'both' (default: 'email')

---

## R6. Async Batch PDF Generation

**Purpose:** Move heavy PDF generation to background worker for large schools.

**Data Model:**
- `report_card_batch_jobs` — tenant_id, class_id, academic_period_id, template_id (nullable), status ('queued' | 'processing' | 'completed' | 'failed'), total_count (int), completed_count (int), file_url (text, nullable — path to ZIP), requested_by_user_id, error_message (text, nullable), created_at, updated_at

**Behavior:**
- Admin clicks "Generate Batch PDF" → creates a batch job → queued to BullMQ
- Worker processes: renders each student's PDF, combines into ZIP
- Stores ZIP on local filesystem (or S3 future)
- Admin gets notification when ready, downloads ZIP
- Progress tracking: completed_count updates as each PDF renders

**Worker Job:** `report-cards:batch-pdf` in GRADEBOOK queue

---

## R7. AI Subject Remarks

**Purpose:** Auto-generate per-subject short remarks based on grade + trend.

**No new tables** — remarks stored in snapshot_payload_json under each subject entry.

**Behavior:**
- During report card generation or on-demand, AI generates a 1-2 sentence remark per subject per student
- Context: subject grade, class average, trend, assessment breakdown, competency level
- Examples: "Ahmed excels in algebra but needs support with geometry." / "Consistent improvement throughout the term."
- Teacher can edit the remark before publishing
- Follows tenant AI comment style setting

**Data flow:** Remark stored as `subject_remark` field within each subject entry in snapshot_payload_json

---

## R8. Custom Sections & Fields

**Purpose:** Tenant-defined extra report card sections beyond grades and attendance.

**Data Model:**
- `report_card_custom_field_defs` — tenant_id, name, label (string), label_ar (string, nullable), field_type ('text' | 'select' | 'rating'), options_json (JSON, nullable — for select type), section_type ('conduct' | 'extracurricular' | 'custom'), display_order (int), created_at, updated_at
  - Unique on (tenant_id, name)
- `report_card_custom_field_values` — tenant_id, report_card_id, field_def_id, value (text), entered_by_user_id, created_at, updated_at
  - Unique on (tenant_id, report_card_id, field_def_id)

**Behavior:**
- Tenant defines custom fields in settings (e.g., "Conduct" as select: Excellent/Good/Satisfactory/Needs Improvement)
- When editing a report card, teachers see these fields and fill them in
- Values rendered in the report card PDF in the appropriate section (based on section_type → matches template section)

---

## R9. Cumulative Academic Transcript

**Purpose:** All-terms/all-years academic record in one document.

**No new tables** — aggregates from existing period_grade_snapshots, gpa_snapshots, and report_cards.

**Behavior:**
- Transcript pulls all period grades for a student across all academic years
- Groups by year → period → subject
- Shows GPA per period + cumulative GPA
- Rendered as PDF using a dedicated transcript template
- Available from student profile and parent portal

**UI:**
- Student profile: "Download Transcript" button
- Parent portal: "Academic Transcript" button per student
- Admin: bulk transcript generation for graduating class

---

## R10. Report Card Analytics Dashboard

**Purpose:** School-wide stats on report card generation and publishing.

**No new tables** — computed from existing data.

**Metrics:**
- Total generated / published / pending approval per period
- Average grades by class/subject
- Completion rate (% of students with published report cards)
- Comment fill rate (% with teacher/principal comments)
- Comparison across terms (grade trends)
- Bottleneck detection: which approval step is holding things up

**UI:**
- Report Cards > "Analytics" tab
- Cards: total counts, completion %, comment fill rate
- Charts: class comparison, term-over-term trends
- Permission: gradebook.view_analytics

---

## R11. Grade Threshold Remarks

**Purpose:** Auto-apply labels like "Distinction", "Merit", "Pass", "Fail" based on configurable score thresholds.

**Data Model:**
- `grade_threshold_configs` — tenant_id, name, thresholds_json (JSON array), is_default (boolean), created_at, updated_at
  - Each threshold: `{ min_score: number, label: string, label_ar: string }`
  - Example: [{ min: 90, label: "Distinction" }, { min: 70, label: "Merit" }, { min: 50, label: "Pass" }, { min: 0, label: "Below Expectations" }]
  - Unique on (tenant_id, name)

**Behavior:**
- During report card generation, each subject grade is mapped to a threshold label
- Label shown on report card next to the grade (in template's threshold_remarks section)
- Tenant configures thresholds in settings
- Can have multiple configs for different year groups/levels

---

## R12. Comparative Indicators

**Purpose:** Show student's standing relative to class.

**No new tables** — computed at generation time, stored in snapshot.

**Options (tenant-configurable):**
- Above/Average/Below label per subject (toggle)
- Percentile range per subject (toggle)
- Top 3 positions only: "1st", "2nd", "3rd" shown, everyone else just sees grade (toggle)

**Behavior:**
- At report card generation: compute class average, rank, and percentile for each subject
- Store in snapshot per subject: `{ comparative_label: "Above Average", percentile: 85, class_rank: 2, show_rank: true }`
- Template section renders whichever indicators are enabled

**Tenant Settings (stored in tenant_settings.settings.reportCards):**
- `showComparativeLabel` — boolean (default: false)
- `showPercentile` — boolean (default: false)
- `showTopThreeRank` — boolean (default: false)

---

## R13. Parent Digital Signature

**Purpose:** Parents acknowledge receipt of report card.

**Data Model:**
- `report_card_acknowledgments` — tenant_id, report_card_id, parent_id, acknowledged_at (timestamptz), ip_address (varchar, nullable), created_at
  - Unique on (tenant_id, report_card_id, parent_id)

**Behavior:**
- Parent views report card in portal → "I acknowledge receipt" checkbox + confirm button
- Records timestamp and IP
- Admin can see acknowledgment status per student on the bulk dashboard
- Optional: tenant can require acknowledgment (reminder sent if not acknowledged within X days)

**Tenant Settings:**
- `requireParentAcknowledgment` — boolean (default: false)
- `acknowledgmentReminderDays` — number (default: 7)

---

## R14. Report Card History Portal

**Purpose:** Parents see all report cards across all terms/years on one timeline.

**No new tables** — queries existing report_cards filtered by student + status=published.

**UI (Parent Portal):**
- Student > "Report Card History" tab
- Timeline view: grouped by academic year, then by period
- Each card shows: period name, published date, grade summary (GPA or top-line average), download button
- Can compare two periods side-by-side (select two, see grade changes per subject)

---

## R15. QR Code Verification

**Purpose:** Each PDF gets a unique QR code for authenticity verification.

**Data Model:**
- `report_card_verification_tokens` — tenant_id, report_card_id, token (varchar(64), unique), created_at
  - Token: random 64-char hex string
  - Unique on (tenant_id, report_card_id)

**Behavior:**
- On PDF render: generate verification token, store in DB, embed QR code in PDF footer
- QR links to: `https://{tenant_domain}/verify/{token}`
- Verification page (public, no login): shows "This report card is authentic. Issued by [School Name] for [Student Name], [Period], on [Date]."
- No grades shown — privacy preserved

**UI:**
- Public verification page: clean, branded, shows school logo + verification result
- Template section: QR code rendered in footer area of PDF

---

## R16. Multi-Format Export

**Purpose:** Export report cards in multiple formats.

**Formats:**
- PDF (existing — Puppeteer)
- Printable HTML (opens in browser for direct printing)
- Excel summary (one row per student with all subject grades — for admin records)
- CSV (same data as Excel, for data analysis)

**Behavior:**
- Individual report card: PDF + HTML options
- Bulk export: PDF (ZIP), Excel, CSV
- Export from overview page or bulk operations page

---

## R17. Scheduled Auto-Generation

**Purpose:** Auto-generate draft report cards at end of term.

**Data Model:**
- Uses existing `cron`/BullMQ repeatable job pattern

**Behavior:**
- Tenant setting: `autoGenerateReportCards` — boolean (default: false)
- When enabled: system checks daily if any academic period ended today (or within X days)
- If period ended and report cards not yet generated for any class in that period → auto-generate drafts
- Notification sent to admin: "Draft report cards generated for [Period]. Review and publish."
- Does NOT auto-publish — always generates as drafts

**Tenant Settings:**
- `autoGenerateReportCards` — boolean (default: false)
- `autoGenerateDaysAfterPeriodEnd` — number (default: 1)

---

## R18. Standards/Competency Integration

**Purpose:** Show competency levels from the gradebook standards-based grading system on report cards.

**No new tables** — reads from student_competency_snapshots (built in gradebook enhancement).

**Behavior:**
- At report card generation: load competency snapshots for the student + period
- Group by subject, include in snapshot_payload_json under each subject entry
- Template section "competency_summary" renders competency bars/labels per subject per standard
- Only shows if tenant has competency scales + standards configured

---

## R19. Attendance & Behavior Integration

**Purpose:** Detailed attendance breakdown and behavior data on report cards.

**No new tables** — reads from existing attendance_records, attendance_pattern_alerts.

**Behavior:**
- At report card generation, pull detailed attendance:
  - Total days, present, absent (excused/unexcused), late, left early
  - Attendance percentage
  - Pattern alerts (if any) — "Recurring Wednesday absences detected"
- Behavior data from custom fields (R8) — conduct rating, behavior notes
- Template sections: "attendance_summary" (enhanced version) and "conduct"

---

## New Database Tables Summary

| Table | Purpose |
|---|---|
| `report_card_templates` | Tenant-customizable report card layouts |
| `report_card_approval_configs` | Approval workflow step definitions |
| `report_card_approvals` | Individual approval step records |
| `report_card_deliveries` | Parent delivery tracking |
| `report_card_batch_jobs` | Async batch PDF generation jobs |
| `report_card_custom_field_defs` | Tenant-defined extra fields |
| `report_card_custom_field_values` | Per-report-card custom field values |
| `grade_threshold_configs` | Configurable grade → label mappings |
| `report_card_acknowledgments` | Parent receipt acknowledgment |
| `report_card_verification_tokens` | QR code verification tokens |

All tables tenant-scoped with RLS.

---

## New Tenant Settings Summary

**reportCards section (in tenant_settings.settings):**
- `approvalConfigId` — UUID (nullable, null = direct publish)
- `autoDelivery` — boolean (default: true)
- `deliveryChannel` — 'email' | 'whatsapp' | 'both' (default: 'email')
- `showComparativeLabel` — boolean (default: false)
- `showPercentile` — boolean (default: false)
- `showTopThreeRank` — boolean (default: false)
- `requireParentAcknowledgment` — boolean (default: false)
- `acknowledgmentReminderDays` — number (default: 7)
- `autoGenerateReportCards` — boolean (default: false)
- `autoGenerateDaysAfterPeriodEnd` — number (default: 1)

---

## New Permissions

| Permission | Description |
|---|---|
| `report_cards.approve` | Approve/reject report cards in workflow |
| `report_cards.manage_templates` | Create/edit report card templates |
| `report_cards.bulk_operations` | Access bulk operations pipeline |

---

## Implementation Order

1. **Foundation:** R1 (Template Designer) + R8 (Custom Fields) + R11 (Threshold Remarks) — these change how report cards are structured
2. **Workflow:** R3 (Approval) + R4 (Bulk Pipeline) + R17 (Auto-Generation) — operational flow
3. **Delivery:** R5 (Parent Delivery) + R13 (Digital Signature) + R14 (History Portal) — parent experience
4. **AI & Intelligence:** R2 (AI Template Converter) + R7 (AI Subject Remarks) + R12 (Comparative Indicators)
5. **Infrastructure:** R6 (Async PDF) + R15 (QR Verification) + R16 (Multi-Format Export)
6. **Integration:** R9 (Transcript) + R10 (Analytics) + R18 (Standards) + R19 (Attendance/Behavior)
