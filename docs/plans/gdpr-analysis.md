# GDPR Expert Analysis: EduPod School Operating System

**Prepared for:** Ram — EduPod Founder
**Date:** 26 March 2026
**Scope:** Full GDPR compliance assessment across all 38 modules, 736 endpoints, and planned post-v1 features
**Regulatory context:** Ireland (DPC jurisdiction) + Libya (no equivalent data protection regime) + EU GDPR

---

## Executive Summary

EduPod is a children-first data platform operating under the direct supervision of the Irish Data Protection Commission — an authority that has explicitly made children's data protection one of its five strategic priorities for 2022–2027 and has published sector-specific guidance (the Data Protection Toolkit for Schools, December 2024, and the "Children Front and Centre" Fundamentals, December 2021). This is not a theoretical regulatory risk. The DPC has a dedicated education sector compliance programme and has stated it will afford no transitional period to organisations processing children's data.

EduPod processes personal data across every GDPR category: ordinary personal data (names, contacts, addresses), special category data (health/allergy records, religious beliefs via admissions, behavioural/wellbeing records, biometric-adjacent attendance data), children's data (the entire student population), financial data (invoices, payments, payroll), and employee data (staff profiles, bank details, payroll). The platform's multi-tenant architecture means EduPod acts as data processor for potentially hundreds of schools simultaneously, each of which is its own data controller.

**Bottom line:** The existing compliance module (Section 25 of the feature map — 8 endpoints, 1 worker job) handles DSARs and erasure at a structural level, and the master plan already includes anonymisation rules, IP retention policies, and audit log partitioning. This is a solid foundation. However, the gap between "structural erasure capability" and "DPC-ready compliance posture" is significant. This analysis maps every gap, prioritised by enforcement risk.

---

## 1. Foundational Legal Architecture

### 1.1 Controller–Processor Relationship

EduPod operates as a **data processor** under Article 28 GDPR. Each tenant school is a **data controller**. This distinction is critical and affects almost every compliance decision.

**What this means concretely:**

- EduPod may only process personal data on documented instructions from the controller (the school). This must be codified in a Data Processing Agreement (DPA) with every tenant — not a clickwrap ToS, but a substantive Article 28-compliant agreement.
- EduPod must maintain its own Record of Processing Activities (ROPA) as a processor under Article 30(2), documenting categories of processing carried out on behalf of each controller, international transfers, and sub-processor details.
- EduPod must assist controllers in fulfilling their GDPR obligations: DSARs, breach notification, DPIAs, and consultation with the DPC.

**Where EduPod is also a controller:**

EduPod acts as data controller for: platform admin user accounts, tenant provisioning data, its own employee/contractor data, website analytics (if any), and marketing/sales data. The platform admin module (Section 27) processes tenant-level data where EduPod determines the purposes and means.

**Gap:** There is no DPA template or signing workflow in the platform. Tenant onboarding (platform admin → create tenant) has no DPA acceptance step. This is a **launch blocker** for any Irish school — no school's board of management can legally engage a processor without a signed DPA.

### 1.2 Lawful Bases for Processing

The DPC's Toolkit for Schools is explicit: schools must identify a specific lawful basis for every processing activity, and consent bundling at the start of the academic year is specifically cautioned against.

EduPod's modules map to these lawful bases:

| Processing Activity                          | Likely Lawful Basis                                       | Notes                                                                         |
| -------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Core student records (name, DOB, enrolment)  | Legal obligation (Education Act 1998) + Public task       | Schools have statutory functions                                              |
| Attendance recording                         | Legal obligation (Education (Welfare) Act 2000)           | Mandatory reporting to Tusla/NEWB                                             |
| Grades and academic records                  | Public task / Legitimate interest                         | Core educational function                                                     |
| Health/allergy data                          | Vital interests of the child + Explicit consent           | Special category — Article 9(2)(c) and (a)                                    |
| Behaviour records                            | Legitimate interest (school safety + educational welfare) | Must pass DPC's "zero interference with child's best interests" test          |
| Financial records (fees, invoices)           | Contract (parent–school enrolment agreement)              | Retention periods governed by tax law                                         |
| Payroll / staff bank details                 | Contract (employment) + Legal obligation (Revenue)        | Encrypted at rest — already handled                                           |
| Parent contact data                          | Legitimate interest + Legal obligation                    | Parental notification duties                                                  |
| AI-powered features (early warning, grading) | Legitimate interest — requires DPIA                       | Profiling children triggers Article 22 + Recital 71 protections               |
| WhatsApp/email communications                | Consent (marketing) / Legitimate interest (operational)   | Channel-specific consent requirements                                         |
| Admissions (pre-enrolment)                   | Legitimate interest                                       | DPC August 2025 blog: data minimisation is strictly enforced at pre-enrolment |
| Website CMS contact forms                    | Consent                                                   | Must be freely given, specific, informed                                      |
| EduPod Intelligence (benchmarking)           | Legitimate interest — requires DPIA                       | Cross-tenant data aggregation is novel processing                             |

**Critical issue — admissions module:** The DPC's August 2025 guidance on pre-enrolment data is directly relevant. EduPod's admissions forms are configurable per tenant, which is good — but there must be guardrails preventing schools from collecting special category data (health, religion, ethnicity) at the application stage. The DPC specifically flags this as a common violation. The form builder should include warnings or blocks when special category fields are added to pre-enrolment forms.

### 1.3 Age of Digital Consent in Ireland

Ireland's digital age of consent is **16** (Data Protection Act 2018, Section 31). For children under 16, parental consent is required for information society services. However, EduPod is not a direct-to-child service — it's provided via the school. The lawful basis for processing student data flows through the school's own basis (legal obligation, public task), not through student consent.

**However**, the DPC Toolkit confirms that once a student turns **17**, their data protection rights should be exercised by them directly, not by their parent/guardian (except in exceptional circumstances). This has UX implications:

- Students aged 17+ should be able to submit their own DSARs
- Parents of 17+ students should not automatically see all data without the student's awareness
- The parent portal's visibility settings need age-awareness

**Gap:** EduPod stores student DOB but has no age-gated logic for data rights. The compliance module treats all students identically regardless of age.

---

## 2. Module-by-Module Risk Assessment

### 2.1 CRITICAL RISK — Special Category Data

**Modules affected:** Students (allergy records), Attendance (health-related absences), future Behaviour Management, future Student Wellbeing/Pastoral Care

Article 9 GDPR provides an exhaustive list of lawful bases for processing special category data. For schools, the most relevant are:

- **Explicit consent** (Art. 9(2)(a)) — for health data collected during enrolment
- **Vital interests** (Art. 9(2)(c)) — for emergency allergy information
- **Substantial public interest** (Art. 9(2)(g)) — with a basis in Irish law

**Current state:** The student model stores allergy data. The allergy report endpoint (`GET v1/students/allergy-report`) serves this to any user with `students.view` permission. This is appropriate for the vital interests basis but needs explicit recording of the legal basis.

**Future state — Behaviour Management:** Behaviour records are ordinary personal data, but if they include references to mental health, SEN, or safeguarding concerns, they become special category data. The planned Tier 3 child protection records (from the wellbeing module) are the most sensitive data in the entire platform. The DPC's position is clear: child protection concerns should not be blocked by data protection — "the GDPR should not be used as an excuse, blocker or obstacle to sharing information where doing so is necessary to protect the vital interests of a child." But the corollary is that access must be tightly controlled and audited.

**Recommendations:**

1. Implement a `data_classification` field on relevant tables (or at the module level) that tags data as `ordinary`, `special_category`, or `child_protection`
2. Special category data access should be logged to `audit_logs` with enhanced detail (not just "viewed" but "accessed allergy report for student X")
3. The planned behaviour module must separate general behaviour records from safeguarding/wellbeing records at the data model level, not just the permission level
4. Consent records need their own table: `consent_records` with `student_id`, `parent_id`, `consent_type`, `granted_at`, `withdrawn_at`, `lawful_basis`, `evidence_type`

### 2.2 HIGH RISK — AI Features and Automated Decision-Making

**Modules affected:** Gradebook (AI grading, AI comment generation, natural language queries), Reports (AI narrative generation, trend prediction), future Predictive Early Warning, future EduPod Intelligence

Article 22 GDPR gives data subjects the right not to be subject to decisions based solely on automated processing that produce legal or similarly significant effects. The DPC's Fundamentals state that profiling children will "rarely be justifiable" and Section 30 of the Data Protection Act 2018 (though not yet commenced) specifically addresses profiling and micro-targeting of children.

**Current AI features:**

- **AI grading** (inline file grading, batch grading with instructions and approval workflow): This is automated decision-making that directly affects a child's academic record. The approval workflow is a strong mitigation — human review before grades are applied. But the architecture must guarantee that AI-generated grades never auto-commit without human approval.
- **AI comment generation** (single + batch for report cards): Lower risk — advisory text that a teacher reviews. But if the teacher rubber-stamps AI comments without review, the practical effect is automated decision-making.
- **AI progress summaries and natural language queries**: Read-only analytics — lower risk, but if used to inform decisions about student interventions, the chain of causation matters.
- **Academic risk detection** (`gradebook:detect-risks` cron job): This is profiling. It runs daily at 02:00 UTC across all tenants and flags at-risk students. Even though it's a flag (not an automatic consequence), the DPC would likely consider this significant enough to require a DPIA.

**Future AI features:**

- **Predictive Early Warning System**: Cross-module risk scoring is textbook profiling under Article 4(4) GDPR. A weighted composite score across attendance, grades, behaviour, and parent engagement — applied to children — is exactly the type of processing the DPC's Fundamentals target.
- **EduPod Intelligence** (cross-tenant benchmarking): Aggregating and comparing student performance across schools involves novel processing that almost certainly requires a DPIA and careful consideration of the anonymisation/pseudonymisation boundary.

**Recommendations:**

1. **Mandatory DPIA for all AI features** — document the necessity, proportionality, and safeguards for each AI processing activity
2. **Human-in-the-loop guarantee**: Codify in architecture (not just policy) that no AI output directly modifies a student's academic record without explicit human confirmation. The existing approval workflow for AI grading instructions is the right pattern — extend it.
3. **Right to explanation**: When a student or parent queries an AI-influenced decision (grade, risk flag, early warning), the system must be able to surface the inputs and logic. This means AI decisions need to be logged with their input features and output rationale.
4. **Opt-out mechanism**: Schools (controllers) must be able to disable AI features per module. The `tenant_settings` JSONB pattern supports this — add AI opt-out flags.
5. **EduPod Intelligence**: The cross-tenant benchmarking feature must use genuinely anonymised data (not pseudonymised). If a school has only 2 students in a particular subject/level combination, the benchmarking data is re-identifiable and not anonymous.

### 2.3 HIGH RISK — Cross-Border Data Transfers

**Current architecture:** EduPod runs on AWS (ECS/Fargate, RDS, S3, ElastiCache). The natural AWS region for Irish schools would be `eu-west-1` (Ireland).

**Sub-processors triggering transfers:**

| Sub-processor                                | Purpose            | Data Location         | Transfer Mechanism Needed                        |
| -------------------------------------------- | ------------------ | --------------------- | ------------------------------------------------ |
| AWS (Ireland)                                | Infrastructure     | EU                    | None — adequate                                  |
| Resend                                       | Email delivery     | US-based              | SCCs + supplementary measures                    |
| Twilio                                       | WhatsApp delivery  | US-based              | SCCs + supplementary measures                    |
| Stripe                                       | Payment processing | US/EU                 | Stripe's DPA covers this, but must be documented |
| Meilisearch Cloud (if used)                  | Search             | Depends on deployment | Self-hosted = no transfer                        |
| Sentry                                       | Error tracking     | US-based              | SCCs needed                                      |
| OpenAI / Anthropic (if used for AI features) | AI processing      | US-based              | SCCs + DPIA + data minimisation                  |

**Libya-specific:** Libya has no GDPR-equivalent data protection law. Data transfers to/from Libya are transfers to a "third country" without an adequacy decision. If the Libyan school's data is stored in the EU (which it should be, given the shared infrastructure), the transfer concern is about access from Libya, not storage. Staff in Libya accessing the platform are "importing" data to a non-adequate country. This requires either SCCs, explicit consent, or a derogation.

**Recommendations:**

1. **Host everything in `eu-west-1`** — already the logical choice
2. **Sub-processor register**: Create a public-facing page listing all sub-processors with their purpose, data categories, and location. This is required by most DPA templates and expected by the DPC.
3. **Transfer Impact Assessment (TIA)** for each US-based sub-processor: Post-Schrems II, SCCs alone are not sufficient — you must assess whether the destination country's laws (US FISA 702, EO 12333) undermine the protections. The EU-US Data Privacy Framework helps for certified US companies.
4. **Libya access**: Implement IP-based access logging that flags non-EU access. Consider requiring VPN for administrative access from Libya.
5. **AI sub-processors**: If using external AI APIs (OpenAI, Anthropic), student data sent for grading/analysis is a transfer requiring full Article 44+ compliance. Consider self-hosted models or EU-based AI providers for student data processing.

### 2.4 HIGH RISK — Data Subject Rights Implementation

**Current state:** The compliance module (Section 25) handles DSARs with a lifecycle: submitted → classified → approved/rejected → completed. Execution via background job for erasure/anonymisation. Erasure rules are defined for finance, payroll, grades, attendance, report cards, contact form submissions, and audit logs.

**Gaps:**

**Right of Access (Article 15):**

- The DPC's Toolkit confirms that the clock on DSARs does not stop during school holidays. EduPod needs an SLA mechanism — when a DSAR is submitted, the system must track the 30-day deadline and escalate if approaching.
- A DSAR response must include ALL personal data across ALL modules. The current compliance module has a single `execute` worker job — this needs to traverse: students, parents, households, attendance, grades, report cards, behaviour (future), wellbeing (future), finance (invoices, payments, receipts), admissions (applications, notes), communications (announcements, notifications, inquiry messages), search indexes, audit logs, and Redis caches (session data, permission cache, preview card cache).
- The `subject_type` field on compliance requests needs to support: `student`, `parent`, `staff`, `applicant` (pre-enrolment data has separate retention rules per DPC guidance).

**Right to Erasure (Article 17):**

- Existing anonymisation rules are good but incomplete. Missing from the current erasure scope: parent inquiry messages, admission application data (including notes), notification delivery records, search index entries, Redis cached data, Stripe customer records, S3-stored media (logos, uploaded files), calendar subscription tokens, MFA recovery codes.
- Financial and tax records have statutory retention periods (typically 6 years under Irish tax law) that override the right to erasure. The system correctly retains anonymised finance records — but this must be communicated to the data subject in the DSAR response.
- Student records have educational retention obligations — the Education Act requires schools to maintain certain records. The erasure process must distinguish between "data we must retain" and "data we can erase."

**Right to Rectification (Article 16):**

- The compliance module lists rectification as a request type, but there's no mechanism to apply a rectification across immutable records. Specifically: published report cards have frozen `snapshot_payload_json`, payslips have frozen snapshots, receipts are immutable. If a student's name is rectified, these historical snapshots contain the old name. The system needs a policy: either re-generate affected snapshots (complex) or annotate them with a rectification note (simpler, defensible).

**Right to Data Portability (Article 20):**

- No implementation exists. The student export pack (`GET v1/students/:id/export-pack`) is a start, but portability requires machine-readable format (JSON/CSV) across all data categories, not just the student profile.

**Age-specific rights:**

- Students aged 17+ in Ireland can exercise their own rights per the DPC Toolkit. The system needs a mechanism for students to submit DSARs directly, separate from parent requests.
- Where a parent submits a DSAR for a 17+ student, the school (controller) must assess whether responding is in the child's best interest. EduPod should flag this scenario and require the school to confirm before releasing data.

### 2.5 MEDIUM RISK — Consent Management

**Current state:** No dedicated consent management system. The configuration module has notification settings (channel toggles), and parents can opt out of the smart daily digest. But there is no centralised consent record.

**What needs consent vs. what doesn't:**

- **Does NOT need consent**: Core educational processing (attendance, grades, enrolment) — these operate under legal obligation or public task
- **DOES need consent**: Health data collection (allergies, medical notes), photo/image use, WhatsApp communications (channel-specific consent), marketing communications, optional features like the homework diary (if student-facing)
- **Needs careful analysis**: AI-powered features, cross-school benchmarking, parent engagement tracking (for early warning)

**DPC-specific concern**: The Toolkit cautions against "bundling" consent at the start of the academic year — each consent must be specific, informed, and freely given. A single "I agree to all school data processing" checkbox is non-compliant.

**Recommendations:**

1. Build a `consent_records` table: `id`, `tenant_id`, `subject_type` (student/parent/staff), `subject_id`, `consent_type` (enum), `granted_at`, `withdrawn_at`, `granted_by` (parent ID if on behalf of child), `evidence` (how consent was obtained), `privacy_notice_version`
2. Expose consent status in the parent portal — parents must be able to see and withdraw specific consents
3. Consent withdrawal must cascade: if a parent withdraws consent for WhatsApp communications, the notification system must respect this immediately
4. Do NOT use consent as the lawful basis for core educational processing — this is a common mistake. If you rely on consent, the data subject can withdraw it at any time, and you must stop processing. Schools cannot stop recording attendance because a parent withdraws consent.

### 2.6 MEDIUM RISK — Data Retention and Minimisation

**Current state:** Audit logs have 36-month retention with monthly partitioning. Notifications have 12-month retention. IP addresses on contact forms are nullified after 90 days. No other retention policies are specified.

**Gap:** Most modules have no defined retention period. Under the GDPR's storage limitation principle (Article 5(1)(e)), personal data must not be kept longer than necessary. The DPC expects schools to have documented retention schedules.

**Recommended retention schedule (for the DPA and privacy policy):**

| Data Category                                    | Retention Period                                    | Basis                         |
| ------------------------------------------------ | --------------------------------------------------- | ----------------------------- |
| Active student records                           | Duration of enrolment + 7 years                     | Educational records + tax     |
| Graduated/withdrawn student records              | 7 years post-departure                              | Statutory + references        |
| Admissions — rejected applications               | 1 academic year after decision                      | Legitimate interest (appeals) |
| Financial records (invoices, payments, receipts) | Current year + 6 years                              | Irish tax law (TCA 1997)      |
| Payroll records                                  | Current year + 6 years                              | Revenue requirements          |
| Staff records (post-employment)                  | 7 years post-departure                              | Employment law + references   |
| Attendance records                               | Duration of enrolment + 2 years                     | Educational records           |
| Behaviour records                                | Duration of enrolment + 1 year                      | Legitimate interest           |
| Child protection / safeguarding                  | Indefinite (or per statutory guidance)              | Child protection law          |
| CCTV (if applicable)                             | 30 days maximum                                     | DPC guidance                  |
| Communications / notifications                   | 12 months (already implemented)                     | Operational                   |
| Audit logs                                       | 36 months (already implemented)                     | Accountability                |
| Contact form submissions                         | 12 months                                           | Legitimate interest           |
| Parent inquiry messages                          | 24 months                                           | Operational                   |
| Search index entries                             | Synced with source — deleted when source is deleted | Technical                     |
| Redis session/cache data                         | TTL-based (already implemented)                     | Technical                     |

**Recommendations:**

1. Implement a `retention_policy` configuration per data category in `tenant_settings`
2. Build a `data-retention:enforce` cron job that runs weekly, identifies data past its retention period, and queues it for anonymisation/deletion
3. The Smart Parent Digest should not retain historical digests indefinitely — archive or delete after 90 days
4. Admissions applications for rejected candidates should be purged after the appeals window closes

### 2.7 MEDIUM RISK — Data Protection by Design and Default

**Current state:** Several strong privacy-by-design patterns already exist: RLS for tenant isolation, AES-256 encryption for bank details, permission-gated access, audit logging. But "by design and default" also means:

**Data minimisation at collection:**

- The admissions form builder allows schools to add arbitrary fields. There should be guidance or warnings when a school adds fields that collect special category data at the pre-enrolment stage (the DPC's August 2025 guidance is specifically about this).
- Student records collect `gender` — is this necessary for the educational purpose? If optional, the default should be not collecting it.
- Parent records store `phone`, `whatsapp_number`, `email` — all necessary for communication, but the privacy notice must explain each.

**Privacy by default:**

- New tenants should have the most privacy-protective settings by default. For example: parent portal visibility should default to minimal (grades and attendance only, not behaviour or wellbeing), AI features should default to off, EduPod Intelligence benchmarking should default to off.
- The `tenant_settings` JSONB with Zod `.default()` is the right architecture for this — the defaults just need to be privacy-first.

**Pseudonymisation:**

- The EduPod Intelligence feature (cross-tenant benchmarking) should operate on pseudonymised data by default. Parent-level benchmarking ("your child vs. same-level students across all network schools") must not reveal other children's identities — but if the cohort is very small (e.g., 3 students taking Advanced Arabic across 2 schools), the data is re-identifiable. Implement a minimum cohort size threshold (k-anonymity, k ≥ 10).

### 2.8 MEDIUM RISK — Breach Notification

**Current state:** No breach detection or notification system exists in the platform.

Under Article 33, the controller must notify the DPC within 72 hours of becoming aware of a breach. Under Article 34, if the breach is likely to result in a high risk to individuals, those individuals must also be notified. As a processor, EduPod must notify the controller (school) "without undue delay" after becoming aware of a breach.

**What constitutes a breach in EduPod's context:**

- RLS bypass allowing cross-tenant data access
- Unauthorised access to student records (e.g., compromised staff account)
- Data exfiltration from the database
- Misdirected communications (parent receives another child's report card)
- Payslip sent to wrong staff member
- S3 bucket misconfiguration exposing uploaded files
- AI feature sending student data to an external API that is breached

**Recommendations:**

1. Build a `security_incidents` table for internal tracking: `id`, `detected_at`, `severity`, `description`, `affected_tenants`, `affected_data_subjects_count`, `data_categories_affected`, `containment_actions`, `notified_controllers_at`, `notified_dpc_at`, `root_cause`, `remediation`
2. Implement automated breach detection: failed RLS assertion logging, unusual data access patterns (staff accessing 100+ student records in a minute), failed authentication spikes
3. The platform admin dashboard needs a breach management workflow
4. DPA must include breach notification SLA (recommend: EduPod notifies controller within 24 hours, giving the controller 48 hours to notify the DPC within the 72-hour window)

### 2.9 LOW-MEDIUM RISK — Privacy Notices and Transparency

**Current state:** The Website CMS module supports per-school public pages. No privacy notice template or generator exists.

The DPC's Toolkit requires schools to have child-friendly privacy notices. The Fundamentals require that transparency information be provided in "clear and plain language that the child can easily understand."

**Recommendations:**

1. Provide a **privacy notice template** as part of tenant onboarding — pre-populated with EduPod's processing activities, sub-processors, and data categories. The school customises it for their context.
2. The parent portal should have a persistent "How we use your data" link
3. Privacy notices must be available in both English and Arabic (leveraging the existing i18n infrastructure)
4. If students will access the platform directly (homework diary, self-check-ins), a child-friendly version of the privacy notice is required
5. Each new feature that introduces new processing (e.g., AI grading, benchmarking) should trigger an update to the privacy notice — consider versioning privacy notices and tracking which version each user has seen

### 2.10 LOW RISK — Data Protection Impact Assessments

**Current state:** No DPIA tooling exists. The DPC's Toolkit for Schools includes a DPIA template specifically for schools.

DPIAs are mandatory for:

- Processing that involves systematic evaluation/profiling (AI features, early warning)
- Processing of special category data on a large scale (health, behaviour, wellbeing)
- Systematic monitoring of publicly accessible areas (CMS contact forms with IP tracking)
- Use of new technologies for processing children's data (AI grading, automated risk scoring)

**Recommendations:**

1. Conduct DPIAs for: (a) the overall EduPod platform, (b) AI grading and comment generation, (c) Predictive Early Warning System, (d) EduPod Intelligence benchmarking, (e) behaviour management module, (f) student wellbeing/pastoral care module
2. Provide a DPIA template in the platform that schools can use for their own assessments (the DPC template from the Toolkit is a good starting point)
3. DPIAs should be living documents — update when processing changes

---

## 3. Sub-Processor Management

EduPod's sub-processors (entities that process personal data on EduPod's behalf as processor) must be documented and contractually bound.

| Sub-processor   | Processing                | Personal Data Categories                 | Transfer           | DPA Status       |
| --------------- | ------------------------- | ---------------------------------------- | ------------------ | ---------------- |
| AWS (eu-west-1) | Hosting, storage, compute | All categories                           | No transfer (EU)   | AWS DPA standard |
| Resend          | Email delivery            | Email addresses, names, message content  | US → SCCs + DPF    | Needed           |
| Twilio          | WhatsApp delivery         | Phone numbers, names, message content    | US → SCCs + DPF    | Needed           |
| Stripe          | Payment processing        | Names, email, payment data               | US/EU → Stripe DPA | Needed           |
| Sentry          | Error monitoring          | IP addresses, user agents, error context | US → SCCs          | Needed           |
| CloudFlare      | CDN, SSL, DDoS            | IP addresses, request metadata           | Global → DPA       | Needed           |

**AI sub-processors (if applicable):** Any external AI API (OpenAI, Anthropic, etc.) used for grading, comment generation, or analytics is a sub-processor. Student names, grades, and written work sent to these APIs constitute personal data transfer. This is one of the most sensitive sub-processor relationships in the platform and requires: DPA with the AI provider, DPIA, data minimisation (strip identifiers before sending where possible), and explicit disclosure in the privacy notice.

**Controller notification requirement:** Under most DPA templates, the processor must notify controllers of changes to the sub-processor list and allow a reasonable objection period (typically 30 days). The platform should have a mechanism to notify all tenant admins when a sub-processor is added or changed.

---

## 4. Platform-Specific Technical Requirements

### 4.1 Encryption and Security Measures (Article 32)

**Already implemented:**

- AES-256 encryption for staff bank details ✓
- RLS for tenant isolation ✓
- JWT with short-lived access tokens (15min) + httpOnly refresh cookies ✓
- Redis-backed session management ✓
- Brute force protection ✓
- TOTP MFA with recovery codes ✓
- Audit logging ✓
- Optimistic concurrency control ✓

**Gaps:**

- **Encryption at rest**: RDS encryption status not specified — must be enabled (AES-256 via AWS KMS)
- **Encryption in transit**: TLS 1.2+ for all connections (API, database, Redis, S3) — likely already configured but must be documented
- **Key management**: AES-256 encryption key for bank details — how is this managed? Should use AWS KMS with key rotation, not a static environment variable
- **Backup encryption**: RDS snapshots must be encrypted. S3 server-side encryption for payslip PDFs and uploaded media.
- **Access logging**: CloudTrail for AWS infrastructure access, separate from application-level audit logs

### 4.2 Data Localisation

All personal data storage must remain in the EU (specifically `eu-west-1` for Irish regulatory comfort). This includes: RDS instances, S3 buckets, ElastiCache clusters, and any Meilisearch deployment. Backups and snapshots must also remain in-region.

The planned "offline backups" feature (local data saves for internet outage emergencies) creates a data localisation consideration — data downloaded to a local device is no longer under EduPod's control. The DPA should address this: the school (controller) is responsible for the security of locally stored data.

### 4.3 Logging and Audit Requirements

**Current state:** Comprehensive audit logging with monthly partitioning, 36-month retention, append-only. This is strong.

**Additional requirements for GDPR accountability:**

- Log all access to special category data (not just modifications)
- Log all DSAR-related actions with timestamps
- Log consent grant/withdrawal events
- Log all data exports and downloads
- Log all cross-tenant data access (platform admin impersonation)
- Ensure audit logs themselves are covered by the DSAR process (the DPC may request audit logs as evidence during an investigation)

---

## 5. Libya-Specific Considerations

Libya has no comprehensive data protection law equivalent to GDPR. However:

1. **If the Libyan school's data is stored in the EU** (which it should be, on the shared infrastructure), GDPR still applies to the processing because EduPod is an EU-established processor.
2. **Libyan users accessing the platform** are accessing EU-stored data from a third country. This is not technically a "transfer" under GDPR (the data doesn't move), but the DPC may view remote access from a non-adequate country as requiring safeguards.
3. **Practical approach**: Apply the same GDPR-level protections to all tenants regardless of location. This simplifies the architecture and provides the highest standard of protection. The DPA should state that all data is processed in accordance with GDPR regardless of the school's location.
4. **Arabic-language privacy notices and consent mechanisms** are already supported by the i18n infrastructure — ensure they are substantively equivalent, not just translated.

---

## 6. Post-v1 Features — GDPR Implications

### 6.1 Behaviour Management (Non-negotiable)

- Behaviour records about children are personal data. If they reference mental health, SEN, or safeguarding, they become special category data.
- The DPC's Toolkit emphasises that behaviour data must be proportionate. Recording every minor infraction creates a disproportionate permanent record.
- Retention must be shorter than academic records — behaviour records should not follow a student indefinitely.
- Parent visibility is configurable (good) — but the default should be transparent (parents see behaviour records unless the school deliberately restricts this).

### 6.2 Student Wellbeing / Pastoral Care (Planned)

- This is the highest-risk module in the entire platform from a GDPR perspective.
- Tier 3 child protection records are special category data processed under vital interests and/or substantial public interest.
- The DLP (data loss prevention) fortress with physically separated storage is the right approach.
- Must implement: access logging for every view, time-limited access tokens, no bulk export capability, separate backup/retention policy, DPIA before any development begins.
- The DPC's position: data protection must not obstruct child protection. But that doesn't mean unlimited access — it means the right people get access when needed, with full accountability.

### 6.3 Smart Parent Digest (Should-have)

- The digest aggregates data from multiple modules into a single push notification. This is a new processing purpose that must be covered by the privacy notice.
- The engagement tracking component (open rates, click-through, portal logins) feeds into the Predictive Early Warning System. Tracking whether a parent opens a WhatsApp message is processing personal data for a purpose (risk prediction) that is different from the original purpose (communication). This requires either: compatible purpose analysis under Article 6(4), or separate lawful basis.
- Opt-out mechanism is planned (good) — make it granular (per channel, per data type, not just on/off).

### 6.4 Digital Homework Diary (Vision)

- If students access this directly, EduPod becomes an information society service offered to children. The digital age of consent (16 in Ireland) becomes directly relevant.
- Student-entered data ("mark as done", personal notes) creates a new data controller question: is the school still the controller for data the student voluntarily enters?
- Self-reported homework completion data should not be used punitively without the student's awareness — transparency is key.

### 6.5 Leave → Substitution Pipeline (Should-have)

- Staff leave data (sick leave, personal leave) is special category data if it reveals health information.
- Leave balance tracking and absence frequency reporting must be handled with the same care as student health data.
- Substitute teacher notification includes class details — ensure no student-level data leaks to substitute teachers who may not need it.

### 6.6 Parent-Teacher Conference Booking (Nice-to-have)

- Low GDPR risk — the booking system processes minimal personal data (names, times, class associations).
- If video call integration is added, the video platform becomes a sub-processor.

### 6.7 Irish Payroll Provider Integration (Should-have)

- BrightPay (or equivalent) becomes a sub-processor with access to highly sensitive employee data (names, PPS numbers, bank details, salary, tax data).
- The DPA with the payroll provider must be at least as protective as EduPod's DPA with schools.
- Data flows must be mapped precisely: which fields are pushed, which are pulled, and what retention applies at each end.

---

## 7. Implementation Roadmap

### Phase 1 — Launch Blockers (Before any Irish school signs up)

| Item                               | Effort | Description                                                                                                                                                                                                                                |
| ---------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Data Processing Agreement**      | Medium | Article 28-compliant DPA template. Must cover: processing scope, sub-processor list, breach notification SLA, DSAR assistance obligations, data return/deletion on termination, audit rights. Integrate acceptance into tenant onboarding. |
| **Privacy Notice Template**        | Low    | Pre-populated template for schools to customise. Available in English and Arabic. Include in CMS module.                                                                                                                                   |
| **Sub-processor Register**         | Low    | Public-facing list of all sub-processors with purpose, data categories, and location.                                                                                                                                                      |
| **DPIA — Platform**                | Medium | Overall platform DPIA covering all current processing activities. Use DPC's template.                                                                                                                                                      |
| **Retention Policy Configuration** | Medium | Define retention periods per data category. Implement `data-retention:enforce` cron job.                                                                                                                                                   |
| **RDS Encryption at Rest**         | Low    | Enable if not already enabled. Document in security measures.                                                                                                                                                                              |
| **Consent Records Table**          | Medium | Build `consent_records` with parent portal visibility. Wire into health data collection, communications channel preferences.                                                                                                               |

### Phase 2 — Within 3 Months of Launch

| Item                           | Effort | Description                                                                                                                            |
| ------------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| **DSAR Enhancement**           | Medium | Extend compliance module to traverse all 38 modules. Add 30-day deadline tracking with escalation. Add data portability export (JSON). |
| **Age-Gated Rights**           | Low    | Flag students aged 17+ for direct rights exercise. Add student-facing DSAR submission.                                                 |
| **Breach Management**          | Medium | `security_incidents` table, platform admin workflow, automated detection rules.                                                        |
| **DPIA — AI Features**         | Medium | Separate DPIAs for AI grading, risk detection, and any external AI API usage.                                                          |
| **Admissions Form Guardrails** | Low    | Warning/block when special category fields are added to pre-enrolment forms.                                                           |

### Phase 3 — Before Building Post-v1 Modules

| Item                               | Effort | Description                                                                                 |
| ---------------------------------- | ------ | ------------------------------------------------------------------------------------------- |
| **DPIA — Behaviour Module**        | Medium | Required before development begins.                                                         |
| **DPIA — Wellbeing Module**        | High   | Most complex DPIA in the platform. Must cover Tier 3 child protection data.                 |
| **DPIA — Early Warning**           | Medium | Cross-module profiling of children requires thorough impact assessment.                     |
| **DPIA — EduPod Intelligence**     | Medium | Cross-tenant data aggregation. K-anonymity threshold implementation.                        |
| **Consent Management Enhancement** | Medium | Granular consent UI in parent portal. Consent withdrawal cascading to all affected modules. |

---

## 8. Risk Matrix Summary

| Risk Area                                    | Severity   | Likelihood                    | Current Mitigation                                  | Residual Risk      |
| -------------------------------------------- | ---------- | ----------------------------- | --------------------------------------------------- | ------------------ |
| No DPA with schools                          | Critical   | Certain (if launched without) | None                                                | **Launch blocker** |
| Special category data without explicit basis | High       | High                          | Allergy data exists; no consent records             | High               |
| AI profiling of children without DPIA        | High       | High                          | Approval workflow exists for grading                | High               |
| Cross-border transfers without SCCs          | High       | High                          | AWS eu-west-1 likely; sub-processors not documented | Medium-High        |
| Incomplete DSAR traversal                    | High       | Medium                        | Compliance module covers 6 entity types             | Medium             |
| No breach notification process               | High       | Medium                        | Sentry exists for errors; no breach workflow        | Medium-High        |
| No retention enforcement                     | Medium     | High                          | Audit logs and notifications have retention         | Medium             |
| No privacy notice                            | Medium     | Certain (if launched without) | CMS exists but no template                          | **Launch blocker** |
| No consent management                        | Medium     | High                          | Opt-out exists for digest                           | Medium             |
| AI data sent to US sub-processors            | Medium     | Medium                        | Architecture decision pending                       | Medium             |
| Missing age-gated rights                     | Low-Medium | Medium                        | DOB stored; no logic built                          | Low-Medium         |
| Admissions over-collection                   | Low-Medium | Medium                        | Forms are configurable                              | Low                |

---

## 9. Key Legal Documents Needed

1. **Data Processing Agreement (DPA)** — between EduPod (processor) and each school (controller)
2. **Privacy Policy** — EduPod's own policy as controller for platform-level data
3. **Privacy Notice Template** — for schools to adapt for their students/parents
4. **Sub-processor List** — public, maintained, with change notification mechanism
5. **Data Retention Policy** — documented schedule per data category
6. **DPIA Reports** — platform-level + per high-risk processing activity
7. **Record of Processing Activities (ROPA)** — EduPod's processor ROPA under Article 30(2)
8. **Breach Response Plan** — internal procedure document
9. **Cookie Policy** — for the public website/CMS (if cookies are used)
10. **Terms of Service** — incorporating DPA by reference

---

## 10. Final Assessment

EduPod's technical architecture is fundamentally sound for GDPR compliance. The RLS-based tenant isolation, encrypted sensitive fields, comprehensive audit logging, permission-gated access, and existing compliance module provide a strong foundation that many school MIS platforms lack.

The gaps are primarily in the **governance layer** — the legal documents, consent management, retention enforcement, DPIA documentation, and breach response processes that transform technical capabilities into demonstrable compliance. This is consistent with the deliberate strategy of building features first and applying GDPR holistically — the important thing is that this pass happens before the first Irish school goes live, not after.

The highest-risk architectural decision still ahead is how to handle AI sub-processors. If EduPod uses external AI APIs for grading and analytics, student data crosses jurisdictional boundaries and enters systems that the DPC will scrutinise intensely. The cleanest approach is to self-host AI models or use EU-based providers — but this trades off capability for compliance simplicity. This decision should be made with legal counsel.

The DPC's active engagement with the education sector — the 2024 Toolkit, the 2025 pre-enrolment guidance, the Fundamentals — means that a school SaaS platform is operating in one of the most actively supervised domains in Irish data protection. This is both a risk and an opportunity: schools are desperate for compliant solutions, and a platform that demonstrably meets DPC expectations becomes a competitive advantage.

**Recommended next step:** Engage an Irish data protection solicitor to review this analysis, draft the DPA, and conduct the initial platform-level DPIA. The technical implementation of the GDPR requirements can then proceed as a defined sub-plan within the existing build pipeline.
