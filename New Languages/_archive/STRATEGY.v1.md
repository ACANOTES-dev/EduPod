# Multi-Language Support Expansion Strategy

**Last Updated:** 2026-04-25  
**Status:** Planning Phase  
**Target Languages:** French (FR), Spanish (ES), German (DE), Irish (GA), Romanian (RO), Italian (IT)  
**Current Setup:** English (EN) + Arabic (AR)

---

## Executive Summary

Adding 6 new LTR languages requires **8 sequential sessions** (~2-3 weeks of focused work). The effort breaks into:

- **Phase 1 (Sessions 1-2):** Infrastructure hardening and testing foundation
- **Phase 2 (Sessions 3-5):** Translation file creation and integration
- **Phase 3 (Sessions 6-8):** QA, edge case handling, and production verification

**Total scope:** ~19,000 translation keys × 6 languages = 114,000 strings to translate and verify.

---

## Current State Audit

### i18n Architecture

| Component                     | Current State                     | Details                                                           |
| ----------------------------- | --------------------------------- | ----------------------------------------------------------------- |
| **Library**                   | `next-intl`                       | Already in use for EN/AR                                          |
| **Locales Config**            | `apps/web/i18n/config.ts`         | Hardcoded array: `['en', 'ar']`                                   |
| **Translation Files**         | `apps/web/messages/{locale}.json` | ~19,000 keys per language, dynamically imported                   |
| **Routing**                   | `[locale]` dynamic segment        | Root-level locale routing — standardized pattern                  |
| **Default Locale**            | `'en'`                            | Fallback when locale not found                                    |
| **Number/Date Formatting**    | `fmtLocale()` utility             | Enforces Western numerals + Gregorian calendar for all locales    |
| **User Menu Locale Switcher** | Hardcoded binary toggle           | Lines 55, 157 in `user-menu.tsx` — currently toggles EN ↔ AR only |
| **Translation Size**          | ~37,990 lines total               | 18,982 AR + 19,008 EN                                             |
| **Codebase Size**             | 485 pages/layouts                 | 5 route groups: (auth), (platform), (print), (public), (school)   |

### What Exists

✅ **Infrastructure:**

- Locale extraction from pathname (`extractLocale()`)
- Locale switching navigation (`buildLocaleSwitchedPath()`)
- Dynamic message import based on locale
- Type safety via `Locale` type
- `useTranslations()` / `getTranslations()` hooks used throughout codebase

✅ **RTL Support:**

- CSS uses logical properties (`ms-`, `me-`, `ps-`, `pe-`, `start`, `end`)
- `dir` attribute set on document root based on locale
- Components accept RTL layout (existing Arabic version confirms this works)

✅ **Testing Infrastructure:**

- Playwright available for testing
- Test patterns established in codebase
- E2E test setup ready for language verification

### What Needs to Change

❌ **Must update:**

1. `apps/web/i18n/config.ts` — Add new locales to array
2. `apps/web/src/components/user-menu.tsx` — Replace hardcoded binary toggle with dynamic language menu
3. Translation file creation — Add `apps/web/messages/{locale}.json` for each new language
4. Type definitions — Extend `Locale` type to include new locales
5. Playwright tests — Add language switching verification tests

❌ **Should add:**

1. Language metadata (display names, native names, directionality)
2. Translation completeness checker (verify all keys exist across all languages)
3. Language availability toggle (for gradual rollout if needed)
4. Playwright test suite for language-specific rendering

---

## Multi-Session Breakdown

### Phase 1: Infrastructure & Testing Foundation (Sessions 1-2)

**Goal:** Prepare the codebase to accept new languages without breaking anything.  
**Dependencies:** None  
**Can parallelize:** No — Session 1 must complete before Session 2

#### Session 1: Infrastructure Setup

**Output:** Type-safe locale system with dynamic user menu  
**Estimated Duration:** 90-120 minutes  
**Blocking:** Yes — must complete before translations can be added

**Tasks:**

1. Update `apps/web/i18n/config.ts` to include all 8 locales (EN, AR, FR, ES, DE, GA, RO, IT)
2. Create language metadata file with display names, native names, directionality
3. Refactor `user-menu.tsx` to use dynamic language menu (not hardcoded binary)
4. Update type definitions across codebase to include new locales
5. Commit infrastructure changes
6. Test locale switching in dev environment (manual browser test)

**Detailed Steps:**

- Read current `config.ts` and identify all hardcoded references to `['en', 'ar']`
- Create `apps/web/i18n/languages.ts` with language metadata:
  ```typescript
  export const LANGUAGES = {
    en: { code: 'en', name: 'English', nativeName: 'English', dir: 'ltr' },
    ar: { code: 'ar', name: 'العربية', nativeName: 'العربية', dir: 'rtl' },
    fr: { code: 'fr', name: 'Français', nativeName: 'Français', dir: 'ltr' },
    es: { code: 'es', name: 'Español', nativeName: 'Español', dir: 'ltr' },
    de: { code: 'de', name: 'Deutsch', nativeName: 'Deutsch', dir: 'ltr' },
    ga: { code: 'ga', name: 'Irish', nativeName: 'Gaeilge', dir: 'ltr' },
    ro: { code: 'ro', name: 'Română', nativeName: 'Română', dir: 'ltr' },
    it: { code: 'it', name: 'Italiano', nativeName: 'Italiano', dir: 'ltr' },
  };
  ```
- Update `config.ts` to generate locales array from metadata
- Create dynamic language menu in `user-menu.tsx` that renders all available languages
- Add locale validation middleware (reject invalid locales at request boundary)
- Test each language option in dev
- Commit: `feat(i18n): support 8 languages with dynamic menu`

**Testing:**

- Click each language in user menu dropdown — verify pathname changes
- Verify page reloads in correct locale
- Check `[locale]` segment in URL for each language

---

#### Session 2: Testing Infrastructure & Smoke Tests

**Output:** Playwright test suite for language switching and basic rendering  
**Estimated Duration:** 120-150 minutes  
**Blocking:** Yes — must establish baseline before translation work

**Tasks:**

1. Create Playwright test file for language switching (`language-switcher.spec.ts`)
2. Write smoke tests for each language (loads home, menu interactive, locale in URL)
3. Create test utility for language navigation (`navigateToLanguage()`)
4. Add test for missing translation keys (pre-emptive validation)
5. Run full test suite to verify no regressions from Session 1
6. Commit tests
7. Document test patterns for future language-specific tests

**Detailed Steps:**

- Create `apps/web/e2e/language-switcher.spec.ts` with fixtures for all languages
- Test matrix: For each language, verify:
  - URL contains correct locale segment
  - Page renders without 404
  - User menu shows language options (dropdown populated)
  - Switching to different language works
  - Page content changes (simple text assertion)
- Create utility `e2e/helpers/navigate-to-language.ts`:
  ```typescript
  export async function navigateToLanguage(page, locale: string) {
    await page.goto(`/en`); // Start from known state
    await page.click('[aria-label="User menu"]');
    await page.click(`button:has-text("${LANGUAGES[locale].name}")`);
    await page.waitForURL(`/${locale}/**`);
  }
  ```
- Add negative test: attempt to navigate to invalid locale (e.g., `/xx/`) — verify fallback to EN
- Commit: `test(e2e): add language switching test suite`

**Verification:**

- Run `npm run test:e2e` — all new tests pass
- Run full regression: `turbo test` — no failures
- Manual check: Browse each language in app

---

### Phase 2: Translation File Creation (Sessions 3-5)

**Goal:** Populate translation files for all 6 new languages.  
**Dependencies:** Phase 1 must be complete  
**Can parallelize:** YES — Sessions 3, 4, 5 can run in parallel (each handles 2 languages)

#### Session 3A: French & Spanish Translation Files

**Output:** `apps/web/messages/fr.json` and `apps/web/messages/es.json`  
**Estimated Duration:** 180-240 minutes  
**Notes:** Two languages per session due to shared translation workflow

**Approach:**

1. Use Google Translate / DeepL to auto-translate EN keys
2. Manual review + cultural adaptation (especially for role names, UI terminology)
3. Validation: all keys present, no HTML escaping issues, proper Unicode

**Detailed Steps:**

- Extract EN JSON structure
- Auto-translate via API or manual tool (DeepL preferred for quality)
- Create `fr.json` and `es.json` in `apps/web/messages/`
- Review key-by-key:
  - Role names (schoolOwner, teacher, parent, etc.) — verify context-appropriate translation
  - Modal/button labels — check brevity (should match EN line length roughly)
  - Error messages — ensure professionalism
  - Date/number formatting strings — preserve placeholders like `{name}`, `{count}`
- Validate JSON structure (no syntax errors)
- Validate all EN keys exist in FR/ES
- Commit: `feat(i18n): add French and Spanish translations`

**Quality Checklist:**

- [ ] All top-level keys from EN exist in FR and ES
- [ ] No untranslated strings (marked with "TODO" or left as EN)
- [ ] Placeholder syntax preserved: `{key}`, `{key.subkey}`
- [ ] No HTML encoding issues
- [ ] JSON is valid (use `jq` to validate)
- [ ] Line length reasonable (no 200-char sentences)

---

#### Session 3B: German & Irish Translation Files (Parallel)

**Output:** `apps/web/messages/de.json` and `apps/web/messages/ga.json`  
**Estimated Duration:** 180-240 minutes  
**Can run simultaneously with Session 3A**

**Approach:** Same as Session 3A, with language-specific notes:

- **German:** Compound nouns may be longer than EN; watch for UI overflow
- **Irish:** Less common language; may need manual review for terminology; verify against educational terminology standards

**Detailed Steps:** [Same as Session 3A]

---

#### Session 3C: Romanian & Italian Translation Files (Parallel)

**Output:** `apps/web/messages/ro.json` and `apps/web/messages/it.json`  
**Estimated Duration:** 180-240 minutes  
**Can run simultaneously with Session 3A and 3B**

**Approach:** Same as Session 3A

**Detailed Steps:** [Same as Session 3A]

---

#### Session 4: Translation Completeness Audit & Fixes

**Output:** Verified translation files with 100% key coverage  
**Estimated Duration:** 120-180 minutes  
**Blocking:** Yes — must verify before testing

**Prerequisites:**

- Sessions 3A, 3B, 3C must be complete

**Tasks:**

1. Create validation script: `scripts/validate-translations.ts`
2. Run script against all translation files
3. Fix any missing keys or misformatted entries
4. Update any mistranslations found in review
5. Create translation changelog documenting any manual overrides
6. Commit fixes

**Detailed Steps:**

- Create `scripts/validate-translations.ts`:
  ```typescript
  // Check all locales have same keys as EN
  // Check for placeholder mismatches
  // Check JSON validity
  // Report missing keys by language
  ```
- Run: `npx ts-node scripts/validate-translations.ts`
- For each missing key found:
  - Determine if EN key was recently added (check git log)
  - If EN key is stable, add to all language files
  - If EN key is new, create a tracking item (Session 5)
- For each placeholder mismatch:
  - Verify translation can accept the placeholder
  - If not, flag for review
- Commit: `fix(i18n): ensure translation completeness across all languages`

**Verification:**

- Script runs with 0 errors
- All 8 locales have identical key structure
- No warnings for mismatched placeholders

---

#### Session 5: Translation QA & Rendering Tests

**Output:** Playwright tests for language-specific rendering + verified visual consistency  
**Estimated Duration:** 150-200 minutes  
**Blocking:** Yes — must verify translations render correctly

**Prerequisites:**

- Sessions 3A, 3B, 3C complete
- Session 4 fixes applied

**Tasks:**

1. Run app with each new language (manual browse)
2. Check for text overflow, truncation, readability
3. Create Playwright tests for key pages in each language
4. Verify form labels, buttons, dialogs render correctly
5. Check RTL safety (even though LTR, ensure no physical direction classes crept in)
6. Document any UI adjustments needed for specific languages
7. Commit tests

**Detailed Steps:**

- Start dev server: `npm run dev`
- For each language (FR, ES, DE, GA, RO, IT):
  - Navigate to: Home, Login, Profile, Settings, major module pages
  - Check for:
    - Text overflow in buttons/labels
    - Proper word breaking (no hyphenation issues)
    - Numbers/dates format correctly via `fmtLocale()`
    - Form inputs accept input properly
- Create `e2e/language-rendering.spec.ts`:
  ```typescript
  test.describe('Language Rendering', () => {
    ['fr', 'es', 'de', 'ga', 'ro', 'it'].forEach((locale) => {
      test(`${locale}: home page renders`, async ({ page }) => {
        await navigateToLanguage(page, locale);
        await expect(page.locator('main')).toBeVisible();
        // Verify key text appears in that language
      });
    });
  });
  ```
- Commit: `test(e2e): add language-specific rendering tests`

**Quality Checklist:**

- [ ] All new languages load home page without errors
- [ ] No text overflow on common buttons/labels
- [ ] Forms accept input in new languages
- [ ] User menu displays all 8 languages
- [ ] Language switch animation works smoothly
- [ ] No console errors when switching languages

---

### Phase 3: QA, Edge Cases, and Production Verification (Sessions 6-8)

**Goal:** Ensure all edge cases are handled and translations work in production.  
**Dependencies:** Phase 2 complete  
**Can parallelize:** Limited (Session 6 independent, Sessions 7-8 sequential)

#### Session 6: Missing Key Fallback & Error Handling

**Output:** Graceful handling of missing translation keys  
**Estimated Duration:** 90-120 minutes  
**Can run after Session 4**

**Tasks:**

1. Test missing key behavior (currently next-intl returns key name)
2. Create translation missing handler middleware
3. Add logging for missing keys (helps identify gaps during QA)
4. Create fallback strategy documentation
5. Test missing key behavior in each language
6. Commit

**Detailed Steps:**

- Current behavior: If key doesn't exist, `t('missing.key')` returns `'missing.key'` (the key itself)
- Create middleware in `apps/web/i18n/request.ts` to log missing keys:
  ```typescript
  const messages = {
    onError: (error) => {
      console.warn(`[i18n] Missing key: ${error.code}`, error);
      // In dev: log to console, in prod: send to Sentry
    },
  };
  ```
- Test: Temporarily rename a translation key in FR, verify:
  - Key fallback works (shows key name or EN key)
  - No runtime error
  - Logged to console
- Commit: `feat(i18n): add missing key logging and fallback handling`

**Verification:**

- Missing key is handled gracefully (no broken page)
- Error logged to console with context
- Fallback text appears (not blank)

---

#### Session 7: Edge Cases & Special Characters

**Output:** Verified handling of numbers, dates, currencies, special Unicode, RTL-in-LTR context  
**Estimated Duration:** 120-180 minutes  
**Blocking:** Yes — must handle before production

**Tasks:**

1. Test number formatting in each language (123.45 should display locale-appropriately)
2. Test date formatting (ISO 8601 input, locale-appropriate output)
3. Test currency display (all should use same currency, but formatting may differ)
4. Test special characters (accents, diacritics in FR/ES/RO/GA/IT)
5. Test Arabic text within LTR pages (e.g., student names in Latin locales)
6. Test very long strings (translation key values that are 100+ chars)
7. Create Playwright tests for each edge case
8. Document findings and fixes
9. Commit

**Detailed Steps:**

- Create test file `e2e/language-edge-cases.spec.ts`:
  - Test number formatting: `new Intl.NumberFormat(fmtLocale(locale)).format(1234567.89)`
  - Test date formatting: `new Date().toLocaleDateString(fmtLocale(locale))`
  - Test currency: Payroll/finance pages with monetary amounts
  - Test mixed directionality: Page with EN text + Arabic names/values
  - Test string length: Verify buttons with 100+ char translations don't overflow
- For each language, run tests and document results
- If overflow found for any language, consider:
  - Font-size reduction (acceptable?)
  - Truncation with ellipsis (acceptable?)
  - Button layout changes (flex/grid adjustments)
- Commit: `test(e2e): add edge case tests for all languages`

**Quality Checklist:**

- [ ] Numbers format per language conventions
- [ ] Dates format per language conventions
- [ ] Currency displays correctly across all languages
- [ ] Special characters (accents, diacritics) render correctly
- [ ] No text overflow for long translations
- [ ] Mixed EN/AR content doesn't break layout
- [ ] All Playwright tests pass

---

#### Session 8: Production Deployment & Monitoring

**Output:** Live language support in production with monitoring  
**Estimated Duration:** 150-200 minutes  
**Blocking:** Yes — final validation before declaring complete

**Prerequisites:**

- All previous sessions complete
- All tests passing
- No outstanding issues

**Tasks:**

1. Create language availability feature flag (if needed for gradual rollout)
2. Deploy translations to production (all 8 languages)
3. Smoke test each language in prod (live URL)
4. Monitor for translation-related errors (Sentry integration)
5. Create runbook for fixing broken translations without redeployment
6. Update documentation (README, deployment guide)
7. Get user feedback from test tenants
8. Commit final changes and close multi-language epic

**Detailed Steps:**

- Create feature flag in backend for language availability (optional, for phased rollout)
- Deploy: `npm run build && npm run deploy`
- Test in production:
  - For each language, visit: `https://edupod.app/{locale}/login`
  - Verify page loads, no 404, all text in correct language
  - Test locale switching from prod app
  - Check Sentry for errors (should see none)
- Create runbook: `docs/operations/fix-translation-runtime.md`
  - How to add/fix translation key without redeployment (if possible)
  - How to rollback to EN if critical issue
  - Emergency contact list
- Update: `docs/deployment-architecture.md` with new language info
- Ask user for feedback:
  - Are translations natural/professional?
  - Any terminology mismatches?
  - Any performance impacts?
- Commit: `docs: add multi-language deployment guide`
- Close epic

**Verification:**

- [ ] All 8 languages load in production
- [ ] No Sentry errors related to i18n
- [ ] User feedback collected and addressed
- [ ] Documentation updated
- [ ] Runbook published
- [ ] Team trained on language maintenance

---

## Session Dependency Matrix

```
Session 1 (Infrastructure Setup)
    ↓ [blocking]
Session 2 (Testing Infrastructure)
    ↓ [blocking]
Session 3A (FR/ES) ──┐
Session 3B (DE/GA) ──┤ [can parallel]
Session 3C (RO/IT) ──┤
    ↓ [blocking]
Session 4 (Translation Audit)
    ↓ [blocking]
Session 5 (Rendering Tests)
    ↓ [blocking]
Session 6 (Error Handling) ──┐
                             ├ [can parallel]
Session 7 (Edge Cases) ──────┘
    ↓ [blocking]
Session 8 (Production Deploy)
```

**Timeline:**

- **Sequential minimum:** Sessions 1, 2, 4, 5, 6/7 (concurrent), 8 = **6 weeks** (1 session/week)
- **Optimized (parallel Phase 2):** Sessions 1, 2, 3A/3B/3C (concurrent), 4, 5, 6/7 (concurrent), 8 = **3 weeks** (aggressive)
- **Recommended:** **4-5 weeks** (1-2 weeks Phase 1, 1-2 weeks Phase 2 with parallelization, 1 week Phase 3)

---

## File Manifest

### New Files to Create

```
apps/web/i18n/
├── languages.ts                    # Language metadata (new)
└── config.ts                       # [UPDATE] Add new locales

apps/web/messages/
├── en.json                         # [EXISTING]
├── ar.json                         # [EXISTING]
├── fr.json                         # [NEW]
├── es.json                         # [NEW]
├── de.json                         # [NEW]
├── ga.json                         # [NEW]
├── ro.json                         # [NEW]
└── it.json                         # [NEW]

apps/web/src/components/
└── user-menu.tsx                   # [UPDATE] Replace binary toggle

apps/web/e2e/
├── language-switcher.spec.ts       # [NEW]
├── language-rendering.spec.ts      # [NEW]
├── language-edge-cases.spec.ts     # [NEW]
└── helpers/
    └── navigate-to-language.ts     # [NEW]

scripts/
└── validate-translations.ts        # [NEW]

docs/
├── operations/fix-translation-runtime.md  # [NEW]
└── deployment-architecture.md      # [UPDATE]
```

### Files to Modify

- `apps/web/i18n/config.ts` — Add locales
- `apps/web/src/components/user-menu.tsx` — Dynamic language menu
- `.eslintrc.json` — Ensure rules apply to new files
- `tsconfig.json` — Verify type checking works for new locales
- `next.config.js` — Verify i18n middleware config (if present)

---

## Risk & Mitigation

| Risk                                                        | Likelihood | Impact   | Mitigation                                                           |
| ----------------------------------------------------------- | ---------- | -------- | -------------------------------------------------------------------- |
| Translation quality issues (auto-translate errors)          | Medium     | Medium   | Session 4 audit + Session 5 manual review + user feedback            |
| Missing keys discovered late in project                     | Medium     | Medium   | Session 4 validation script catches before testing                   |
| Text overflow for long translations                         | Medium     | Low      | Session 5 rendering tests catch; UI adjustments in Session 6-7       |
| RTL-safety regression (physical direction classes sneak in) | Low        | High     | Linting rule `no-physical-direction-classes` enforces this           |
| Performance impact (8 message files vs 2)                   | Low        | Medium   | Message files are JSON, not code; no measurable perf impact expected |
| Production translation bug blocks release                   | Low        | Critical | Session 6-7 edge case tests + Session 8 smoke tests + runbook        |
| User confusion with language switcher UI                    | Low        | Low      | Session 2 tests verify menu works; Session 5 tests verify visibility |

---

## Success Criteria

✅ **Completion Definition:**

1. All 8 languages available in user menu
2. `apps/web/messages/{locale}.json` exists for all 6 new languages with 100% key coverage
3. All Playwright tests pass for all 8 languages
4. Production deployment successful with no i18n-related errors
5. User feedback confirms translations are professional and context-appropriate
6. Documentation updated with new language maintenance procedures

✅ **Quality Gates:**

- Translation completeness: 100% keys present across all languages
- Test coverage: Minimum 3 language-specific test suites (switcher, rendering, edge cases)
- Performance: No measurable difference in page load time (CI benchmarks)
- User feedback: At least 1 user test session per language (if available)

---

## Appendix: Language Metadata

| Code | Name     | Native Name | Direction | Complexity | Notes                                    |
| ---- | -------- | ----------- | --------- | ---------- | ---------------------------------------- |
| en   | English  | English     | LTR       | Low        | Existing, baseline                       |
| ar   | العربية  | العربية     | RTL       | High       | Existing, tested                         |
| fr   | Français | Français    | LTR       | Medium     | Simpler than EN, accent marks            |
| es   | Español  | Español     | LTR       | Medium     | Similar length to EN                     |
| de   | Deutsch  | Deutsch     | LTR       | High       | Compound nouns may be longer             |
| ga   | Irish    | Gaeilge     | LTR       | High       | Less common; may need specialized review |
| ro   | Română   | Română      | LTR       | Medium     | Similar length to EN                     |
| it   | Italiano | Italiano    | LTR       | Medium     | Similar length to EN                     |

---

## Next Steps

1. ✅ Review this strategy document with user
2. ✅ Get approval to proceed
3. ✅ Confirm language selection (all 6 or subset?)
4. ✅ Identify translation resources (human translator or AI?)
5. ⬜ **Session 1:** Begin infrastructure setup
