# Implementation 01 — Canonical Module Registry

> **Phase:** 1 — Foundation
> **Wave:** W1 (must land first; blocks all subsequent work)
> **Depends on:** nothing
> **Deploys:** API restart (the registry is consumed at boot); worker restart; web rebuild
> **Model:** Opus 4.7 / **Max effort** (foundation; every other spec hangs off this)

---

## Goal

Create the single source of truth for which modules are gateable, what they're called in the admin console, and what their default state is. Every other layer (seed, fixture, API guard, frontend hook, tests) will import from this file. After this ships, adding a new gateable module means adding a single registry entry and following its compile-time + runtime errors to all the consuming layers.

---

## Critical safety constraints

- **No behavior change yet.** This spec only defines types and constants. No controllers gain new gating, no migrations run. The system continues to operate exactly as it does today.
- **The registry is the only source of truth.** Do not duplicate the list anywhere. Subsequent specs will delete the existing `MODULE_KEYS` constant in `apps/api/test/tenant-fixture.builder.ts` and replace it with an import from this file.
- **Type-only imports must work cross-package.** `packages/shared` is consumed by `apps/api`, `apps/worker`, and `apps/web`. The new file uses no NestJS / Next / Prisma imports — just types + constants.

---

## Files to create / modify

### Create

- **`packages/shared/src/modules/registry.ts`** — the canonical list. See full content below.
- **`packages/shared/src/modules/registry.spec.ts`** — unit test asserting the registry is well-formed (20 entries, no duplicate keys, every key matches the union, every entry has a non-empty display_name + description).
- **`packages/shared/src/modules/index.ts`** — barrel export: `export * from './registry';`

### Modify

- **`packages/shared/src/index.ts`** — add `export * from './modules';` to the existing barrel.

---

## Full content of `registry.ts`

```ts
/**
 * Canonical module registry for per-tenant module gating.
 *
 * Single source of truth. Add new gateable modules here first; the rest
 * of the system (seed, fixture, API guard, frontend hook, tests) will
 * fail compile/test until they're updated to match.
 *
 * Modules NOT in this registry are CORE — always-on, never gateable,
 * never appear in the admin console. The full core list is documented in
 * Module Gating/STRATEGY.md §5.2 (this file is the gateable list only).
 *
 * See Module Gating/STRATEGY.md for the full rationale per module.
 */

export type ModuleKey =
  | 'admissions'
  | 'gradebook'
  | 'homework'
  | 'sen'
  | 'finance'
  | 'payroll'
  | 'budgeting'
  | 'behaviour'
  | 'pastoral'
  | 'staff_wellbeing'
  | 'early_warning'
  | 'communications_outbound'
  | 'parent_inquiries'
  | 'engagement'
  | 'website'
  | 'auto_scheduling'
  | 'leave'
  | 'school_closures'
  | 'ai_functions'
  | 'compliance_advanced';

export type ModuleCategory =
  | 'academic'
  | 'finance_ops'
  | 'people_care'
  | 'communications'
  | 'operations'
  | 'compliance';

export interface ModuleDefinition {
  key: ModuleKey;
  display_name: string; // Shown in admin console card title
  description: string; // Shown in admin console card body
  default_enabled: boolean; // Used by seed + new-tenant provisioning + migration backfill
  category: ModuleCategory;
  /**
   * Informational-only. We DO NOT auto-disable dependents. The admin console
   * may surface a UI hint ("disabling X will leave Y broken — also disable?")
   * but the admin has the final say.
   */
  depends_on?: ModuleKey[];
}

export const MODULE_REGISTRY: ReadonlyArray<ModuleDefinition> = [
  // Academic
  {
    key: 'admissions',
    display_name: 'Admissions & Applications',
    description: 'Student application intake, processing, and capacity management.',
    default_enabled: true,
    category: 'academic',
    depends_on: ['finance'],
  },
  {
    key: 'gradebook',
    display_name: 'Gradebook & Report Cards',
    description: 'Grade entry, assessment management, report card generation, transcripts.',
    default_enabled: true,
    category: 'academic',
  },
  {
    key: 'homework',
    display_name: 'Homework & Assignments',
    description: 'Set, submit, and track homework; analytics and completion monitoring.',
    default_enabled: true,
    category: 'academic',
  },
  {
    key: 'sen',
    display_name: 'Special Educational Needs',
    description: 'SEN profiles, support plans, professional involvement, resource allocation.',
    default_enabled: false,
    category: 'academic',
  },

  // Finance / operations
  {
    key: 'finance',
    display_name: 'Finance Management',
    description: 'Invoices, payments, discounts, refunds, fee structures, household statements.',
    default_enabled: true,
    category: 'finance_ops',
  },
  {
    key: 'payroll',
    display_name: 'Payroll Management',
    description: 'Salary runs, payslips, compensation, deductions, allowances, payroll reports.',
    default_enabled: true,
    category: 'finance_ops',
  },
  {
    key: 'budgeting',
    display_name: 'Budgeting & Financial Modeling',
    description: 'Financial models, scenarios, line-item variance analysis, board-pack exports.',
    default_enabled: true,
    category: 'finance_ops',
    depends_on: ['finance'],
  },

  // People care
  {
    key: 'behaviour',
    display_name: 'Behaviour & Conduct',
    description: 'Log incidents, manage sanctions/exclusions, track awards, appeals.',
    default_enabled: true,
    category: 'people_care',
  },
  {
    key: 'pastoral',
    display_name: 'Pastoral Care & Cases',
    description: 'Track concerns, safeguarding cases, interventions, family contacts.',
    default_enabled: true,
    category: 'people_care',
  },
  {
    key: 'staff_wellbeing',
    display_name: 'Staff Wellbeing',
    description: 'Staff workload, surveys, aggregate analytics, support resources.',
    default_enabled: true,
    category: 'people_care',
  },
  {
    key: 'early_warning',
    display_name: 'Early Warning System',
    description: 'Predictive risk scoring across academic, behavioural, and pastoral domains.',
    default_enabled: true,
    category: 'people_care',
    depends_on: ['behaviour', 'pastoral', 'gradebook'],
  },

  // Communications
  {
    key: 'communications_outbound',
    display_name: 'Communications (Outbound)',
    description:
      'SMS, email, WhatsApp dispatch and announcement broadcasts. Inbox conversations remain core.',
    default_enabled: true,
    category: 'communications',
  },
  {
    key: 'parent_inquiries',
    display_name: 'Parent Inquiries',
    description: 'Parent-initiated inquiries about student support and concerns.',
    default_enabled: true,
    category: 'communications',
  },
  {
    key: 'engagement',
    display_name: 'Events & Conferences',
    description: 'School events, parent conferences, engagement forms, consent tracking.',
    default_enabled: true,
    category: 'communications',
  },
  {
    key: 'website',
    display_name: 'Public Website',
    description: 'Public-facing school website pages and contact form management.',
    default_enabled: true,
    category: 'communications',
  },

  // Operations
  {
    key: 'auto_scheduling',
    display_name: 'Automated Timetable Scheduling',
    description: 'Auto-scheduler, exam solver, substitution handling, scheduling analytics.',
    default_enabled: true,
    category: 'operations',
  },
  {
    key: 'leave',
    display_name: 'Staff Leave Management',
    description: 'Leave request workflows, leave types, cover coordination with scheduling.',
    default_enabled: true,
    category: 'operations',
    depends_on: ['payroll', 'auto_scheduling'],
  },
  {
    key: 'school_closures',
    display_name: 'School Closures Management',
    description: 'Manage holiday periods, emergency closures, and non-instructional days.',
    default_enabled: true,
    category: 'operations',
  },
  {
    key: 'ai_functions',
    display_name: 'AI-Powered Features',
    description:
      'AI across reports, behaviour/pastoral analysis, gradebook AI, scheduling AI substitution. Per-surface fine-tuning remains in the AI Settings page.',
    default_enabled: true,
    category: 'operations',
  },

  // Compliance
  {
    key: 'compliance_advanced',
    display_name: 'Advanced Compliance & Regulatory Reporting',
    description:
      'DES, TUSLA, PPOD, CBA submissions, advanced retention policies, regulatory calendar. Core GDPR / DSAR / consent remain always-on.',
    default_enabled: false,
    category: 'compliance',
  },
];

export const MODULE_KEYS: ReadonlySet<ModuleKey> = new Set(MODULE_REGISTRY.map((m) => m.key));

export const MODULE_KEYS_ARRAY: ReadonlyArray<ModuleKey> = MODULE_REGISTRY.map((m) => m.key);

/**
 * Lookup a module definition by key. Returns undefined for unknown keys
 * (which means the key is either core or invalid — both should be treated
 * as "not gateable").
 */
export function getModuleDefinition(key: string): ModuleDefinition | undefined {
  return MODULE_REGISTRY.find((m) => m.key === key);
}

/**
 * Type guard: is this string a valid gateable module key?
 */
export function isModuleKey(value: string): value is ModuleKey {
  return MODULE_KEYS.has(value as ModuleKey);
}
```

---

## Acceptance

- [ ] `packages/shared/src/modules/registry.ts` exists with the full content above.
- [ ] `packages/shared/src/modules/registry.spec.ts` exists and asserts:
  - [ ] Exactly 20 entries in `MODULE_REGISTRY`.
  - [ ] No duplicate keys.
  - [ ] Every entry has non-empty `display_name` and `description`.
  - [ ] Every key in the registry array matches the `ModuleKey` union (compile-time check via `const _check: ModuleKey = entry.key;` in a loop).
  - [ ] Every `depends_on` reference points to a key that exists in the registry.
  - [ ] `MODULE_KEYS.size === 20`.
- [ ] `packages/shared/src/modules/index.ts` exports the registry module.
- [ ] `packages/shared/src/index.ts` re-exports from `./modules`.
- [ ] `import { MODULE_REGISTRY, type ModuleKey } from '@school/shared';` works from `apps/api`, `apps/worker`, and `apps/web` (verified by trying it in each).
- [ ] `pnpm --filter @school/shared run test` passes.
- [ ] `turbo type-check` passes across the monorepo.

---

## Notes

- The 20 entries here are the locked list per STRATEGY §3 and §5.1. Do not add or remove entries in this implementation — that's the job of dedicated future specs.
- `default_enabled: false` for `sen` and `compliance_advanced` matches the existing behavior (sen is opt-in today; compliance_advanced is brand new and should default off so existing tenants don't suddenly see DES/TUSLA UI).
- `depends_on` is informational only this spec. The admin console UI will surface it in implementation 22; no automatic enforcement happens.
- The existing `analytics` key in the seed is NOT in this registry — it's deprecated. Implementation 02 removes it from the seed.
- The existing `communications` key in the seed is replaced by `communications_outbound` here; the rename + behavioural split happens in implementation 09.
