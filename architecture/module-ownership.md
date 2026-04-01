# Module Ownership Registry

> **Purpose**: Maps every database table to its owning NestJS module. When changing a schema, check here first — the owner module is the one with write access. All other modules listed are read-only consumers querying via Prisma directly (bypassing the NestJS service layer).
> **Last verified**: 2026-04-01

---

## Reading This Document

- **Owner**: The NestJS module whose service layer writes to this table. Schema changes must be coordinated with the owner first.
- **Write Access**: Module(s) with INSERT/UPDATE/DELETE on this table.
- **Read-Only Consumers**: Modules that query this table directly via `PrismaService` (not through the owner's exported service). These will silently break on schema changes — they do NOT appear in the NestJS module import graph.

> **Rule**: Before changing any table in the "Shared Tables" section, grep for the table name across ALL modules, not just the owner.

---

## Platform-Level Tables (no RLS, no `tenant_id`)

| Table                      | Owner Module            | Write Access                 | Read-Only Consumers                             |
| -------------------------- | ----------------------- | ---------------------------- | ----------------------------------------------- |
| `users`                    | AuthModule              | Auth, Tenants (provisioning) | All modules (via JWT claims, not Prisma direct) |
| `mfa_recovery_codes`       | AuthModule              | Auth                         | —                                               |
| `password_reset_tokens`    | AuthModule              | Auth                         | —                                               |
| `security_incidents`       | SecurityIncidentsModule | SecurityIncidents            | —                                               |
| `security_incident_events` | SecurityIncidentsModule | SecurityIncidents            | —                                               |

---

## Tenancy & Configuration Tables

| Table                          | Owner Module                            | Write Access                                                                               | Read-Only Consumers                                                                   |
| ------------------------------ | --------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `tenants`                      | TenantsModule                           | Tenants                                                                                    | All (via middleware/guards)                                                           |
| `tenant_domains`               | TenantsModule                           | Tenants                                                                                    | DomainMiddleware                                                                      |
| `tenant_modules`               | TenantsModule                           | Tenants                                                                                    | `@ModuleEnabled()` guard (global)                                                     |
| `tenant_branding`              | TenantsModule                           | Tenants, BrandingService                                                                   | Communications, Reports, Payroll (PDF headers)                                        |
| `tenant_settings`              | ConfigurationModule (`SettingsService`) | Configuration                                                                              | Attendance, Behaviour, Finance, Payroll, SEN, Scheduling — all read settings directly |
| `tenant_module_settings`       | ConfigurationModule                     | Configuration                                                                              | Per-module feature flags                                                              |
| `tenant_notification_settings` | ConfigurationModule                     | Configuration                                                                              | CommunicationsModule                                                                  |
| `tenant_sequences`             | TenantsModule (`SequenceService`)       | Admissions, Behaviour, Finance, Households, Payroll, Registration, Students, StaffProfiles | —                                                                                     |
| `tenant_stripe_configs`        | FinanceModule                           | Finance                                                                                    | —                                                                                     |

---

## RBAC Tables

| Table                 | Owner Module      | Write Access                                                             | Read-Only Consumers                                             |
| --------------------- | ----------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------- |
| `tenant_memberships`  | RbacModule        | Auth (invite flow), Rbac                                                 | All (via `@CurrentTenant()` and permission guards)              |
| `roles`               | RbacModule        | Rbac                                                                     | PermissionCacheService (global)                                 |
| `permissions`         | RbacModule        | Rbac (seed only)                                                         | PermissionCacheService (global)                                 |
| `role_permissions`    | RbacModule        | Rbac                                                                     | PermissionCacheService (global)                                 |
| `membership_roles`    | RbacModule        | Rbac                                                                     | EarlyWarning (routing resolution)                               |
| `invitations`         | RbacModule        | Rbac                                                                     | —                                                               |
| `approval_workflows`  | ApprovalsModule   | Approvals                                                                | Admissions, Finance, Payroll, Behaviour (check workflow exists) |
| `approval_requests`   | ApprovalsModule   | Approvals, + enqueuing modules (Admissions, Finance, Payroll, Behaviour) | —                                                               |
| `user_ui_preferences` | PreferencesModule | Preferences                                                              | —                                                               |

---

## Shared Tables (cross-module reads — highest schema-change risk)

### Students & Parents

| Table                          | Owner Module     | Write Access                      | Read-Only Consumers                                                                                                                                                    |
| ------------------------------ | ---------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `households`                   | HouseholdsModule | Households                        | Finance (fee assignments), Reports                                                                                                                                     |
| `household_emergency_contacts` | HouseholdsModule | Households                        | —                                                                                                                                                                      |
| `household_parents`            | HouseholdsModule | Households                        | Finance, Communications                                                                                                                                                |
| `parents`                      | ParentsModule    | Parents                           | Behaviour (parent notifications), Pastoral, CP, SEN, Communications                                                                                                    |
| `students`                     | StudentsModule   | Students, Registration (on enrol) | Attendance, Gradebook, ReportCards, Finance, Admissions, Reports, Dashboard, Behaviour, Pastoral, CP, EarlyWarning, SEN, Homework, Communications (digest), Regulatory |
| `student_parents`              | StudentsModule   | Students                          | Attendance (parent notifications), Behaviour, Pastoral, SEN, Homework, Communications (digest)                                                                         |

### Staff

| Table            | Owner Module        | Write Access  | Read-Only Consumers                                                                                                              |
| ---------------- | ------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `staff_profiles` | StaffProfilesModule | StaffProfiles | Payroll, Scheduling, Attendance, Classes, Reports, Dashboard, Behaviour, Pastoral, SEN, StaffWellbeing, EarlyWarning, Regulatory |

### Academic Structure

| Table              | Owner Module    | Write Access | Read-Only Consumers                                                                            |
| ------------------ | --------------- | ------------ | ---------------------------------------------------------------------------------------------- |
| `academic_years`   | AcademicsModule | Academics    | Gradebook, ReportCards, Scheduling, Attendance, Behaviour, SEN, Pastoral, Homework, Regulatory |
| `academic_periods` | AcademicsModule | Academics    | Gradebook, ReportCards, Scheduling, Attendance, Promotion, Behaviour, SEN, Pastoral, Homework  |
| `year_groups`      | AcademicsModule | Academics    | Students, Classes, Scheduling, SEN, Regulatory                                                 |
| `subjects`         | AcademicsModule | Academics    | Classes, Scheduling, Gradebook, Regulatory                                                     |

### Classes & Enrolments

| Table              | Owner Module  | Write Access | Read-Only Consumers                                                                                                         |
| ------------------ | ------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `classes`          | ClassesModule | Classes      | Gradebook, Attendance, Scheduling, ReportCards, Behaviour, SEN, Homework, EarlyWarning, Communications (digest), Regulatory |
| `class_staff`      | ClassesModule | Classes      | Gradebook, Attendance, Behaviour (scope), SEN (scope), Pastoral, EarlyWarning, Regulatory                                   |
| `class_enrolments` | ClassesModule | Classes      | Gradebook, Attendance, ReportCards, Behaviour (scope), SEN, Homework, Communications (digest), EarlyWarning, Regulatory     |

---

## Attendance Tables

| Table                        | Owner Module         | Write Access   | Read-Only Consumers                                                                      |
| ---------------------------- | -------------------- | -------------- | ---------------------------------------------------------------------------------------- |
| `rooms`                      | RoomsModule          | Rooms          | Scheduling, Behaviour (context)                                                          |
| `school_closures`            | SchoolClosuresModule | SchoolClosures | Attendance, Scheduling, Pastoral                                                         |
| `schedules`                  | SchedulesModule      | Schedules      | Attendance, Behaviour (context)                                                          |
| `attendance_sessions`        | AttendanceModule     | Attendance     | Reports, Dashboard                                                                       |
| `attendance_records`         | AttendanceModule     | Attendance     | Reports, Dashboard, Regulatory (Tusla)                                                   |
| `daily_attendance_summaries` | AttendanceModule     | Attendance     | Reports, Dashboard, EarlyWarning (signal collector), Communications (digest), Regulatory |
| `attendance_pattern_alerts`  | AttendanceModule     | Attendance     | EarlyWarning, Regulatory                                                                 |

---

## Scheduling Tables

| Table                                              | Owner Module            | Write Access      | Read-Only Consumers               |
| -------------------------------------------------- | ----------------------- | ----------------- | --------------------------------- |
| `schedule_period_templates`                        | SchedulingModule        | Scheduling        | StaffWellbeing (workload compute) |
| `class_scheduling_requirements`                    | SchedulingModule        | Scheduling        | —                                 |
| `staff_availability`                               | StaffAvailabilityModule | StaffAvailability | Scheduling                        |
| `staff_scheduling_preferences`                     | StaffPreferencesModule  | StaffPreferences  | Scheduling                        |
| `scheduling_runs`                                  | SchedulingRunsModule    | SchedulingRuns    | —                                 |
| `curriculum_requirements`                          | SchedulingModule        | Scheduling        | —                                 |
| `teacher_competencies`                             | SchedulingModule        | Scheduling        | —                                 |
| `break_groups`, `break_group_year_groups`          | SchedulingModule        | Scheduling        | —                                 |
| `room_closures`                                    | RoomsModule             | Rooms             | Scheduling                        |
| `teacher_scheduling_configs`                       | SchedulingModule        | Scheduling        | —                                 |
| `teacher_absences`                                 | SchedulingModule        | Scheduling        | StaffWellbeing (absence trends)   |
| `substitution_records`                             | SchedulingModule        | Scheduling        | StaffWellbeing (cover fairness)   |
| `calendar_subscription_tokens`                     | SchedulingModule        | Scheduling        | —                                 |
| `exam_sessions`, `exam_slots`, `exam_invigilation` | SchedulingModule        | Scheduling        | —                                 |
| `scheduling_scenarios`                             | SchedulingRunsModule    | SchedulingRuns    | —                                 |
| `rotation_configs`                                 | SchedulingModule        | Scheduling        | —                                 |

---

## Gradebook Tables

| Table                                                                      | Owner Module    | Write Access                    | Read-Only Consumers                                                |
| -------------------------------------------------------------------------- | --------------- | ------------------------------- | ------------------------------------------------------------------ |
| `grading_scales`                                                           | GradebookModule | Gradebook                       | ReportCards                                                        |
| `assessment_categories`                                                    | GradebookModule | Gradebook                       | —                                                                  |
| `class_subject_grade_configs`                                              | GradebookModule | Gradebook                       | ReportCards                                                        |
| `assessments`                                                              | GradebookModule | Gradebook                       | Communications (digest), EarlyWarning (grades signal)              |
| `grades`                                                                   | GradebookModule | Gradebook                       | ReportCards, Communications (digest), EarlyWarning (grades signal) |
| `period_grade_snapshots`                                                   | GradebookModule | Gradebook (cron)                | Reports, GDPR (DSAR traversal)                                     |
| `year_group_grade_weights`                                                 | GradebookModule | Gradebook                       | —                                                                  |
| `rubric_templates`, `rubric_grades`                                        | GradebookModule | Gradebook                       | —                                                                  |
| `curriculum_standards`, `assessment_standard_mappings`                     | GradebookModule | Gradebook                       | —                                                                  |
| `competency_scales`, `student_competency_snapshots`                        | GradebookModule | Gradebook                       | GDPR (DSAR traversal)                                              |
| `gpa_snapshots`                                                            | GradebookModule | Gradebook                       | Reports                                                            |
| `grade_curve_audit`                                                        | GradebookModule | Gradebook                       | —                                                                  |
| `assessment_templates`, `ai_grading_instructions`, `ai_grading_references` | GradebookModule | Gradebook                       | —                                                                  |
| `student_academic_risk_alerts`                                             | GradebookModule | Gradebook (risk detection cron) | EarlyWarning, Reports, GDPR (DSAR traversal)                       |
| `progress_reports`, `progress_report_entries`                              | GradebookModule | Gradebook                       | —                                                                  |
| `nl_query_history`                                                         | GradebookModule | Gradebook                       | —                                                                  |

### Report Cards (sub-domain of GradebookModule)

| Table                                                              | Owner Module    | Write Access | Read-Only Consumers                |
| ------------------------------------------------------------------ | --------------- | ------------ | ---------------------------------- |
| `report_cards`                                                     | GradebookModule | Gradebook    | Communications (delivery), Reports |
| `report_card_templates`                                            | GradebookModule | Gradebook    | —                                  |
| `report_card_approval_configs`, `report_card_approvals`            | GradebookModule | Gradebook    | —                                  |
| `report_card_deliveries`, `report_card_batch_jobs`                 | GradebookModule | Gradebook    | —                                  |
| `report_card_custom_field_defs`, `report_card_custom_field_values` | GradebookModule | Gradebook    | —                                  |
| `grade_threshold_configs`                                          | GradebookModule | Gradebook    | —                                  |
| `report_card_acknowledgments`, `report_card_verification_tokens`   | GradebookModule | Gradebook    | —                                  |

---

## Admissions Tables

| Table                                                 | Owner Module     | Write Access                               | Read-Only Consumers |
| ----------------------------------------------------- | ---------------- | ------------------------------------------ | ------------------- |
| `admission_form_definitions`, `admission_form_fields` | AdmissionsModule | Admissions                                 | —                   |
| `applications`, `application_notes`                   | AdmissionsModule | Admissions, RegistrationModule (on accept) | Reports             |

---

## Finance Tables

| Table                                       | Owner Module  | Write Access                                               | Read-Only Consumers                                        |
| ------------------------------------------- | ------------- | ---------------------------------------------------------- | ---------------------------------------------------------- |
| `fee_structures`                            | FinanceModule | Finance                                                    | Households (fee assignment display)                        |
| `discounts`                                 | FinanceModule | Finance                                                    | —                                                          |
| `household_fee_assignments`                 | FinanceModule | Finance                                                    | Reports, Dashboard                                         |
| `invoices`                                  | FinanceModule | Finance, RegistrationModule (creates registration invoice) | Reports, Dashboard, Communications (digest), Parent portal |
| `invoice_lines`                             | FinanceModule | Finance                                                    | Reports                                                    |
| `installments`                              | FinanceModule | Finance                                                    | Reports                                                    |
| `payments`                                  | FinanceModule | Finance                                                    | Reports, Dashboard, Communications (digest)                |
| `payment_allocations`                       | FinanceModule | Finance                                                    | Reports                                                    |
| `receipts`                                  | FinanceModule | Finance                                                    | —                                                          |
| `refunds`                                   | FinanceModule | Finance                                                    | —                                                          |
| `invoice_reminders`                         | FinanceModule | Finance                                                    | —                                                          |
| `recurring_invoice_configs`                 | FinanceModule | Finance                                                    | —                                                          |
| `credit_notes`, `credit_note_applications`  | FinanceModule | Finance                                                    | —                                                          |
| `late_fee_configs`, `late_fee_applications` | FinanceModule | Finance                                                    | —                                                          |
| `payment_plan_requests`                     | FinanceModule | Finance                                                    | —                                                          |
| `scholarships`                              | FinanceModule | Finance                                                    | —                                                          |

---

## Payroll Tables

| Table                                             | Owner Module  | Write Access | Read-Only Consumers                       |
| ------------------------------------------------- | ------------- | ------------ | ----------------------------------------- |
| `staff_compensation`                              | PayrollModule | Payroll      | StaffWellbeing (compensation context, V2) |
| `payroll_runs`                                    | PayrollModule | Payroll      | Reports                                   |
| `payroll_entries`                                 | PayrollModule | Payroll      | —                                         |
| `payslips`                                        | PayrollModule | Payroll      | —                                         |
| `staff_attendance_records`                        | PayrollModule | Payroll      | —                                         |
| `class_delivery_records`                          | PayrollModule | Payroll      | —                                         |
| `payroll_adjustments`                             | PayrollModule | Payroll      | —                                         |
| `payroll_export_templates`, `payroll_export_logs` | PayrollModule | Payroll      | —                                         |
| `payroll_approval_configs`                        | PayrollModule | Payroll      | —                                         |
| `payroll_allowance_types`, `staff_allowances`     | PayrollModule | Payroll      | —                                         |
| `payroll_one_off_items`                           | PayrollModule | Payroll      | —                                         |
| `staff_recurring_deductions`                      | PayrollModule | Payroll      | —                                         |

---

## Communications Tables

| Table                                         | Owner Module          | Write Access                                                                                                        | Read-Only Consumers                                     |
| --------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `announcements`                               | CommunicationsModule  | Communications                                                                                                      | —                                                       |
| `notification_templates`                      | CommunicationsModule  | Communications                                                                                                      | —                                                       |
| `notifications`                               | CommunicationsModule  | Communications, Behaviour (enqueues notification jobs), GDPR (direct Prisma writes for privacy/legal notifications) | Behaviour (reads for notification status), EarlyWarning |
| `parent_inquiries`, `parent_inquiry_messages` | ParentInquiriesModule | ParentInquiries                                                                                                     | —                                                       |
| `website_pages`                               | WebsiteModule         | Website                                                                                                             | —                                                       |
| `contact_form_submissions`                    | WebsiteModule         | Website                                                                                                             | —                                                       |

---

## Audit, Compliance & Import Tables

| Table                               | Owner Module     | Write Access                                                                              | Read-Only Consumers                                  |
| ----------------------------------- | ---------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `audit_logs`                        | AuditLogModule   | `AuditLogInterceptor` (global), AuthService, PermissionGuard, Behaviour (sensitive reads) | SecurityIncidentsModule (anomaly detection), Reports |
| `compliance_requests`               | ComplianceModule | Compliance                                                                                | —                                                    |
| `import_jobs`, `import_job_records` | ImportsModule    | Imports                                                                                   | —                                                    |
| `search_index_status`               | SearchModule     | SearchIndexService                                                                        | —                                                    |

---

## Behaviour Tables

| Table                                                                                           | Owner Module    | Write Access | Read-Only Consumers                                                                          |
| ----------------------------------------------------------------------------------------------- | --------------- | ------------ | -------------------------------------------------------------------------------------------- |
| `behaviour_categories`                                                                          | BehaviourModule | Behaviour    | —                                                                                            |
| `behaviour_incidents`                                                                           | BehaviourModule | Behaviour    | Reports, Dashboard, Communications (digest), EarlyWarning (signal), Regulatory (suspensions) |
| `behaviour_incident_participants`                                                               | BehaviourModule | Behaviour    | —                                                                                            |
| `behaviour_description_templates`                                                               | BehaviourModule | Behaviour    | —                                                                                            |
| `behaviour_entity_history`                                                                      | BehaviourModule | Behaviour    | —                                                                                            |
| `behaviour_tasks`                                                                               | BehaviourModule | Behaviour    | —                                                                                            |
| `behaviour_parent_acknowledgements`                                                             | BehaviourModule | Behaviour    | —                                                                                            |
| `behaviour_sanctions`                                                                           | BehaviourModule | Behaviour    | Reports, Regulatory (suspension notices), Pastoral                                           |
| `behaviour_appeals`                                                                             | BehaviourModule | Behaviour    | —                                                                                            |
| `behaviour_amendment_notices`                                                                   | BehaviourModule | Behaviour    | —                                                                                            |
| `behaviour_exclusion_cases`                                                                     | BehaviourModule | Behaviour    | Regulatory                                                                                   |
| `behaviour_attachments`                                                                         | BehaviourModule | Behaviour    | —                                                                                            |
| `behaviour_interventions`, `behaviour_intervention_incidents`, `behaviour_intervention_reviews` | BehaviourModule | Behaviour    | —                                                                                            |
| `behaviour_recognition_awards`                                                                  | BehaviourModule | Behaviour    | Reports, Dashboard, Communications (digest)                                                  |
| `behaviour_award_types`                                                                         | BehaviourModule | Behaviour    | —                                                                                            |
| `behaviour_house_teams`, `behaviour_house_memberships`                                          | BehaviourModule | Behaviour    | —                                                                                            |
| `behaviour_policy_rules`, `behaviour_policy_rule_actions`, `behaviour_policy_rule_versions`     | BehaviourModule | Behaviour    | —                                                                                            |
| `behaviour_policy_evaluations`, `behaviour_policy_action_executions`                            | BehaviourModule | Behaviour    | —                                                                                            |
| `behaviour_alerts`, `behaviour_alert_recipients`                                                | BehaviourModule | Behaviour    | —                                                                                            |
| `behaviour_documents`, `behaviour_document_templates`                                           | BehaviourModule | Behaviour    | —                                                                                            |
| `behaviour_guardian_restrictions`                                                               | BehaviourModule | Behaviour    | —                                                                                            |
| `behaviour_publication_approvals`                                                               | BehaviourModule | Behaviour    | —                                                                                            |
| `behaviour_legal_holds`                                                                         | BehaviourModule | Behaviour    | —                                                                                            |
| `safeguarding_concerns`                                                                         | BehaviourModule | Behaviour    | Pastoral (pastoral-behaviour sync)                                                           |
| `safeguarding_actions`                                                                          | BehaviourModule | Behaviour    | —                                                                                            |
| `safeguarding_concern_incidents`                                                                | BehaviourModule | Behaviour    | —                                                                                            |
| `safeguarding_break_glass_grants`                                                               | BehaviourModule | Behaviour    | —                                                                                            |

---

## Pastoral & Child Protection Tables

| Table                                                                            | Owner Module          | Write Access                                        | Read-Only Consumers                                               |
| -------------------------------------------------------------------------------- | --------------------- | --------------------------------------------------- | ----------------------------------------------------------------- |
| `pastoral_concerns`                                                              | PastoralModule        | Pastoral                                            | ChildProtection (via forwardRef), EarlyWarning (wellbeing signal) |
| `pastoral_concern_involved_students`                                             | PastoralModule        | Pastoral                                            | —                                                                 |
| `pastoral_concern_versions`                                                      | PastoralModule        | Pastoral                                            | —                                                                 |
| `pastoral_cases`                                                                 | PastoralModule        | Pastoral                                            | EarlyWarning (wellbeing signal)                                   |
| `pastoral_case_students`                                                         | PastoralModule        | Pastoral                                            | —                                                                 |
| `pastoral_interventions`                                                         | PastoralModule        | Pastoral                                            | EarlyWarning (wellbeing signal), writes back on red-tier          |
| `pastoral_intervention_actions`, `pastoral_intervention_progress`                | PastoralModule        | Pastoral                                            | —                                                                 |
| `pastoral_referrals`, `pastoral_referral_recommendations`                        | PastoralModule        | Pastoral                                            | SEN (professional involvement link)                               |
| `pastoral_neps_visits`, `pastoral_neps_visit_students`                           | PastoralModule        | Pastoral                                            | —                                                                 |
| `sst_members`, `sst_meetings`, `sst_meeting_agenda_items`, `sst_meeting_actions` | PastoralModule        | Pastoral                                            | —                                                                 |
| `pastoral_parent_contacts`                                                       | PastoralModule        | Pastoral                                            | —                                                                 |
| `pastoral_events`                                                                | PastoralModule        | Pastoral                                            | —                                                                 |
| `pastoral_dsar_reviews`                                                          | PastoralModule        | Pastoral                                            | GdprModule (DSAR traversal)                                       |
| `critical_incidents`, `critical_incident_affected`                               | PastoralModule        | PastoralModule (`CriticalIncidentsModule` sub-path) | —                                                                 |
| `student_checkins`                                                               | PastoralModule        | PastoralModule (`PastoralCheckinsModule` sub-path)  | —                                                                 |
| `cp_records`, `cp_access_grants`                                                 | ChildProtectionModule | ChildProtection                                     | GdprModule (DSAR traversal)                                       |

---

## SEN Tables

| Table                                                                  | Owner Module | Write Access | Read-Only Consumers                      |
| ---------------------------------------------------------------------- | ------------ | ------------ | ---------------------------------------- |
| `sen_profiles`                                                         | SenModule    | SEN          | Reports                                  |
| `sen_support_plans`                                                    | SenModule    | SEN          | Reports                                  |
| `sen_goals`, `sen_goal_strategies`, `sen_goal_progress`                | SenModule    | SEN          | —                                        |
| `sen_resource_allocations`, `sen_student_hours`, `sen_sna_assignments` | SenModule    | SEN          | Reports (NCSE returns)                   |
| `sen_professional_involvements`                                        | SenModule    | SEN          | —                                        |
| `sen_accommodations`                                                   | SenModule    | SEN          | Gradebook (exam accommodations), Reports |
| `sen_transition_notes`                                                 | SenModule    | SEN          | —                                        |

---

## Staff Wellbeing Tables

| Table                               | Owner Module         | Write Access   | Read-Only Consumers                               |
| ----------------------------------- | -------------------- | -------------- | ------------------------------------------------- |
| `staff_surveys`, `survey_questions` | StaffWellbeingModule | StaffWellbeing | —                                                 |
| `survey_responses`                  | StaffWellbeingModule | StaffWellbeing | — **WARNING: no `tenant_id`, no RLS — see DZ-27** |
| `survey_participation_tokens`       | StaffWellbeingModule | StaffWellbeing | —                                                 |

---

## GDPR Tables

| Table                                                               | Owner Module | Write Access                                                     | Read-Only Consumers                                                                                                          |
| ------------------------------------------------------------------- | ------------ | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `gdpr_anonymisation_tokens`                                         | GdprModule   | GdprModule (`GdprTokenService`)                                  | All AI services (tokenisation/detokenisation)                                                                                |
| `gdpr_export_policies`                                              | GdprModule   | GdprModule                                                       | —                                                                                                                            |
| `gdpr_token_usage_log`                                              | GdprModule   | GdprModule, ComplianceModule (DSAR portability)                  | —                                                                                                                            |
| `data_processing_agreements`, `dpa_versions`                        | GdprModule   | GdprModule                                                       | `DpaAcceptedGuard` (global — reads current version + acceptance)                                                             |
| `privacy_notice_versions`, `privacy_notice_acknowledgements`        | GdprModule   | GdprModule                                                       | CommunicationsModule (fan-out on publish)                                                                                    |
| `consent_records`                                                   | GdprModule   | GdprModule, RegistrationModule, AdmissionsModule, StudentsModule | CommunicationsModule (WhatsApp dispatch gate), Gradebook (risk detection eligibility), Behaviour (AI gate), ComplianceModule |
| `ai_processing_logs`                                                | GdprModule   | All AI services (via `AiAuditService`)                           | —                                                                                                                            |
| `sub_processor_register_versions`, `sub_processor_register_entries` | GdprModule   | GdprModule                                                       | Public sub-processor page (read-only endpoint)                                                                               |
| `retention_policies`, `retention_holds`                             | GdprModule   | GdprModule                                                       | ComplianceModule, BehaviourModule (legal holds check)                                                                        |

---

## Regulatory Tables

| Table                                                              | Owner Module     | Write Access | Read-Only Consumers |
| ------------------------------------------------------------------ | ---------------- | ------------ | ------------------- |
| `regulatory_calendar_events`                                       | RegulatoryModule | Regulatory   | —                   |
| `regulatory_submissions`                                           | RegulatoryModule | Regulatory   | —                   |
| `tusla_absence_code_mappings`                                      | RegulatoryModule | Regulatory   | —                   |
| `reduced_school_days`                                              | RegulatoryModule | Regulatory   | —                   |
| `des_subject_code_mappings`                                        | RegulatoryModule | Regulatory   | —                   |
| `ppod_student_mappings`, `ppod_sync_logs`, `ppod_cba_sync_records` | RegulatoryModule | Regulatory   | —                   |
| `inter_school_transfers`                                           | RegulatoryModule | Regulatory   | —                   |

---

## Early Warning Tables

| Table                            | Owner Module       | Write Access | Read-Only Consumers |
| -------------------------------- | ------------------ | ------------ | ------------------- |
| `student_risk_profiles`          | EarlyWarningModule | EarlyWarning | Reports, Dashboard  |
| `student_risk_signals`           | EarlyWarningModule | EarlyWarning | —                   |
| `early_warning_tier_transitions` | EarlyWarningModule | EarlyWarning | —                   |
| `early_warning_configs`          | EarlyWarningModule | EarlyWarning | —                   |

---

## Homework Tables

| Table                               | Owner Module   | Write Access | Read-Only Consumers     |
| ----------------------------------- | -------------- | ------------ | ----------------------- |
| `homework_assignments`              | HomeworkModule | Homework     | Communications (digest) |
| `homework_attachments`              | HomeworkModule | Homework     | —                       |
| `homework_completions`              | HomeworkModule | Homework     | —                       |
| `homework_recurrence_rules`         | HomeworkModule | Homework     | —                       |
| `diary_notes`, `diary_parent_notes` | HomeworkModule | Homework     | —                       |

---

## Engagement & Reporting Tables

| Table                                                                          | Owner Module     | Write Access | Read-Only Consumers |
| ------------------------------------------------------------------------------ | ---------------- | ------------ | ------------------- |
| `engagement_form_templates`, `engagement_form_submissions`                     | EngagementModule | Engagement   | —                   |
| `engagement_consent_records`                                                   | EngagementModule | Engagement   | —                   |
| `engagement_events`, `engagement_event_staff`, `engagement_event_participants` | EngagementModule | Engagement   | —                   |
| `conference_time_slots`, `conference_bookings`                                 | EngagementModule | Engagement   | —                   |
| `engagement_incident_reports`                                                  | EngagementModule | Engagement   | —                   |
| `saved_reports`, `board_reports`                                               | ReportsModule    | Reports      | Dashboard           |
| `compliance_report_templates`, `scheduled_reports`, `report_alerts`            | ReportsModule    | Reports      | —                   |

---

## Cross-Module Read Map (Quick Reference)

Tables read by the most modules — highest blast radius on schema change:

| Table                                 | Owner                | Key Readers (non-exhaustive)                                                                                                          |
| ------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `students`                            | StudentsModule       | Attendance, Gradebook, Finance, Admissions, Reports, Behaviour, Pastoral, CP, EarlyWarning, SEN, Homework, Communications, Regulatory |
| `staff_profiles`                      | StaffProfilesModule  | Payroll, Scheduling, Attendance, Classes, Reports, Dashboard, Behaviour, Pastoral, SEN, StaffWellbeing, EarlyWarning, Regulatory      |
| `classes` + `class_enrolments`        | ClassesModule        | Gradebook, Attendance, Scheduling, ReportCards, Behaviour, SEN, Homework, EarlyWarning, Communications, Regulatory                    |
| `academic_periods` + `academic_years` | AcademicsModule      | Gradebook, ReportCards, Scheduling, Attendance, Behaviour, SEN, Pastoral, Homework                                                    |
| `tenant_settings`                     | ConfigurationModule  | Attendance, Behaviour, Finance, Payroll, SEN, Scheduling                                                                              |
| `daily_attendance_summaries`          | AttendanceModule     | Reports, Dashboard, EarlyWarning, Communications (digest), Regulatory                                                                 |
| `invoices` + `payments`               | FinanceModule        | Reports, Dashboard, Communications (digest), Parent portal                                                                            |
| `consent_records`                     | GdprModule           | CommunicationsModule (WhatsApp gate), Gradebook (risk detection), Behaviour (AI gate), Compliance                                     |
| `notifications`                       | CommunicationsModule | Behaviour (status reads), EarlyWarning (routing), GDPR (direct writes)                                                                |
| `audit_logs`                          | AuditLogModule       | SecurityIncidents (anomaly detection), Reports                                                                                        |
