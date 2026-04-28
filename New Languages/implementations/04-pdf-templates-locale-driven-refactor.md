# Implementation 04 — PDF Templates: Locale-Driven Refactor

> **Phase:** 2 — Refactor (was P2A)
> **Wave:** 4 (serial — Phase 4/5 language sessions need locale-driven templates)
> **Depends on:** 03 complete & deployed
> **Deploys:** API restart (worker also restarts because PDF rendering can run in either, depending on flow)
> **Model:** Opus 4.7 / **Max effort** (architectural; en/ar PDFs MUST NOT corrupt)

---

## Goal

Refactor 13 PDF template types from file pairs (`*-en.template.ts` + `*-ar.template.ts` = 26 files) into locale-driven templates (one template + a per-locale message catalogue per type = 13 templates + N catalogues).

After this ships:

- One template file per PDF type, e.g. `apps/api/src/modules/pdf-rendering/templates/receipt.template.ts`.
- One message catalogue per locale, e.g. `apps/api/src/modules/pdf-rendering/templates/messages/receipt.en.json` + `receipt.ar.json`.
- New Handlebars helpers: `t`, `formatDate`, `formatCurrency`, `formatNumber`, `getLocalizedSchoolName`.
- A regression test that renders every PDF type for both en and ar pre/post and asserts pixel-equality (≤1% diff).
- New per-locale template addition becomes a one-step JSON drop (Phase 4/5 implementations just create `*.{locale}.json` files).

The 13 PDF types (verified in `apps/api/src/modules/pdf-rendering/templates/`):
`des-inspection`, `household-statement`, `invoice`, `pastoral-summary`, `payslip`, `receipt`, `report-card`, `report-card-modern`, `safeguarding-compliance`, `sst-activity`, `transcript`, `trip-leader-pack`, `wellbeing-programme`.

## Critical safety constraints

- **The en + ar PDFs produced after this refactor MUST be byte-identical or visually identical (≤1% pixel diff) to the en + ar PDFs produced before.** This is the merge gate.
- **Keep the old templates around until pixel-equality is proven.** Delete in the same commit as the `routes` swap, but only after the regression test goes green.
- **Templates often use `school_name_ar`** today — ensure the new `getLocalizedSchoolName(tenant, locale)` helper still falls back gracefully when a tenant has no `school_name_<locale>` entry.

---

## Files to create / modify

### Helpers

- **Create:** `apps/api/src/modules/pdf-rendering/helpers/handlebars-i18n.ts` — registers `t`, `formatDate`, `formatCurrency`, `formatNumber`, `getLocalizedSchoolName`.
- **Create:** `apps/api/src/modules/pdf-rendering/helpers/handlebars-i18n.spec.ts` — unit tests.

### Per-template refactor (one bullet per PDF type)

- **Create:** `apps/api/src/modules/pdf-rendering/templates/{type}.template.ts` (single locale-agnostic Handlebars source).
- **Create:** `apps/api/src/modules/pdf-rendering/templates/messages/{type}.en.json`
- **Create:** `apps/api/src/modules/pdf-rendering/templates/messages/{type}.ar.json`
- **Create:** `apps/api/src/modules/pdf-rendering/templates/{type}.template.spec.ts` (test the unified template renders both locales correctly)
- **Delete:** `apps/api/src/modules/pdf-rendering/templates/{type}-en.template.ts`
- **Delete:** `apps/api/src/modules/pdf-rendering/templates/{type}-ar.template.ts`
- **Delete:** `apps/api/src/modules/pdf-rendering/templates/{type}-en.template.spec.ts`
- **Delete:** `apps/api/src/modules/pdf-rendering/templates/{type}-ar.template.spec.ts`

### Regression suite

- **Create:** `apps/api/src/modules/pdf-rendering/__tests__/pdf-pixel-regression.spec.ts` — pixel-diff guard.
- **Create:** `apps/api/src/modules/pdf-rendering/__tests__/baselines/` (committed PDF baselines, generated pre-refactor).

### Wiring

- **Modify:** `apps/api/src/modules/pdf-rendering/pdf-rendering.service.ts` (or the equivalent module entry that currently selects a template by locale) — replace the locale-suffix lookup with a unified template + locale parameter.
- **Modify:** any caller that explicitly passes locale alongside template — leave alone if it already does, otherwise plumb through.

### Docs

- **Modify:** `docs/architecture/danger-zones.md` — add an entry on PDF template structural divergence risk.
- **Modify:** `docs/architecture/feature-map.md` — flag for user (do NOT auto-update).
- **Modify:** `New Languages/IMPLEMENTATION_LOG.md`

---

## Detailed task breakdown

### Task 1 — Capture pre-refactor baselines

**Goal:** lock in what every en + ar PDF currently looks like, so the regression test in Task 4 has something to compare against. **Do this BEFORE writing any of the refactor code.**

- [ ] **Step 1.1 — Build a baseline-capture script:**

```ts
// scripts/capture-pdf-baselines.ts
//
// Render every PDF type in en + ar from the CURRENT codebase and write the
// outputs to apps/api/src/modules/pdf-rendering/__tests__/baselines/.
// Run this BEFORE refactoring; commit the baselines as part of Task 1.

import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { renderPdf } from '../apps/api/src/modules/pdf-rendering/pdf-renderer';
import { fixtureFor } from '../apps/api/src/modules/pdf-rendering/__tests__/fixtures';

const TYPES = [
  'des-inspection',
  'household-statement',
  'invoice',
  'pastoral-summary',
  'payslip',
  'receipt',
  'report-card',
  'report-card-modern',
  'safeguarding-compliance',
  'sst-activity',
  'transcript',
  'trip-leader-pack',
  'wellbeing-programme',
];

(async () => {
  for (const type of TYPES) {
    for (const locale of ['en', 'ar']) {
      const fixture = fixtureFor(type, locale);
      const pdf = await renderPdf({ type, locale, data: fixture });
      const out = resolve(
        __dirname,
        '..',
        'apps/api/src/modules/pdf-rendering/__tests__/baselines',
        `${type}.${locale}.pdf`,
      );
      writeFileSync(out, pdf);
      console.log(`baseline: ${type}.${locale} (${pdf.length} bytes)`);
    }
  }
})();
```

> **Note:** `fixtureFor()` and `renderPdf()` already exist in some form in the test suite — wire them; don't reinvent.

- [ ] **Step 1.2 — Run + commit baselines:**

```bash
mkdir -p apps/api/src/modules/pdf-rendering/__tests__/baselines
pnpm tsx scripts/capture-pdf-baselines.ts
git add apps/api/src/modules/pdf-rendering/__tests__/baselines/
git add scripts/capture-pdf-baselines.ts
git commit -m "test(pdf): capture pre-refactor en+ar PDF baselines for regression guard"
```

### Task 2 — Build the Handlebars helpers

**Files:**

- Create: `apps/api/src/modules/pdf-rendering/helpers/handlebars-i18n.ts`
- Create: `apps/api/src/modules/pdf-rendering/helpers/handlebars-i18n.spec.ts`

- [ ] **Step 2.1 — Write the test first:**

```ts
// apps/api/src/modules/pdf-rendering/helpers/handlebars-i18n.spec.ts
import * as Handlebars from 'handlebars';
import { registerI18nHelpers } from './handlebars-i18n';

describe('handlebars i18n helpers', () => {
  beforeEach(() => {
    registerI18nHelpers(Handlebars, {
      messages: {
        en: { 'receipt.heading': 'Receipt' },
        ar: { 'receipt.heading': 'إيصال' },
      },
    });
  });

  it('t() resolves a key in the requested locale', () => {
    const tpl = Handlebars.compile(`{{t 'receipt.heading' locale}}`);
    expect(tpl({ locale: 'en' })).toBe('Receipt');
    expect(tpl({ locale: 'ar' })).toBe('إيصال');
  });

  it('t() throws on missing key (no silent fallback)', () => {
    const tpl = Handlebars.compile(`{{t 'unknown.key' locale}}`);
    expect(() => tpl({ locale: 'en' })).toThrow(/MISSING_PDF_MESSAGE/);
  });

  it('formatDate uses Western numerals + Gregorian even for ar locale', () => {
    const tpl = Handlebars.compile(`{{formatDate date locale}}`);
    const out = tpl({ date: new Date('2026-04-25T12:00:00Z'), locale: 'ar' });
    // Expect Western numerals in ar formatting (per existing fmtLocale policy):
    expect(out).toMatch(/2026/);
    expect(out).not.toMatch(/[٠-٩]/); // no Arabic-Indic digits
  });

  it('formatCurrency uses Intl.NumberFormat with the tenant currency', () => {
    const tpl = Handlebars.compile(`{{formatCurrency amount locale currency}}`);
    expect(tpl({ amount: 1234.5, locale: 'en', currency: 'EUR' })).toMatch(/€/);
  });

  it('formatNumber respects locale grouping', () => {
    const tpl = Handlebars.compile(`{{formatNumber n locale}}`);
    expect(tpl({ n: 1234567, locale: 'en' })).toBe('1,234,567');
  });

  it('getLocalizedSchoolName falls back to canonical name when no localised', () => {
    const tpl = Handlebars.compile(`{{getLocalizedSchoolName tenant locale}}`);
    expect(
      tpl({ tenant: { name: 'Nurul Huda', school_name_ar: 'مدرسة نور الهدى' }, locale: 'ar' }),
    ).toBe('مدرسة نور الهدى');
    expect(tpl({ tenant: { name: 'Nurul Huda' }, locale: 'fr' })).toBe('Nurul Huda');
  });
});
```

- [ ] **Step 2.2 — Implement:**

```ts
// apps/api/src/modules/pdf-rendering/helpers/handlebars-i18n.ts
import type * as Handlebars from 'handlebars';

type MessageCatalogue = Record<string, Record<string, string>>;

let catalogues: MessageCatalogue = {};

export function registerI18nHelpers(
  hbs: typeof Handlebars,
  options: { messages: MessageCatalogue },
): void {
  catalogues = options.messages;

  hbs.registerHelper('t', (key: string, locale: string) => {
    const msg = catalogues[locale]?.[key];
    if (msg === undefined) {
      // Hard error — same policy as next-intl. The PDF render fails loudly.
      throw new Error(`MISSING_PDF_MESSAGE: "${key}" missing for locale "${locale}"`);
    }
    return msg;
  });

  hbs.registerHelper('formatDate', (date: Date | string | number, locale: string) => {
    const fmt = new Intl.DateTimeFormat(fmtLocale(locale), {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
    return fmt.format(typeof date === 'string' || typeof date === 'number' ? new Date(date) : date);
  });

  hbs.registerHelper('formatCurrency', (value: number, locale: string, currency: string) => {
    const fmt = new Intl.NumberFormat(fmtLocale(locale), { style: 'currency', currency });
    return fmt.format(value);
  });

  hbs.registerHelper('formatNumber', (value: number, locale: string) => {
    const fmt = new Intl.NumberFormat(fmtLocale(locale));
    return fmt.format(value);
  });

  hbs.registerHelper(
    'getLocalizedSchoolName',
    (tenant: Record<string, unknown>, locale: string) => {
      const localised = tenant[`school_name_${locale}`];
      if (typeof localised === 'string' && localised.length > 0) return localised;
      return String(tenant.name ?? '');
    },
  );
}

/**
 * Western numerals + Gregorian calendar for every locale, including Arabic
 * (per existing apps/web/src/lib/i18n-format.ts policy and CLAUDE.md rule).
 */
function fmtLocale(locale: string): string {
  if (locale === 'ar') return 'ar-u-nu-latn-ca-gregory';
  return locale;
}
```

- [ ] **Step 2.3 — Run:** `pnpm --filter @school/api test -- handlebars-i18n`. Expect green.

- [ ] **Step 2.4 — Commit:**

```bash
git add apps/api/src/modules/pdf-rendering/helpers/handlebars-i18n.ts apps/api/src/modules/pdf-rendering/helpers/handlebars-i18n.spec.ts
git commit -m "feat(pdf): add Handlebars i18n helpers (t, formatDate, formatCurrency, formatNumber, getLocalizedSchoolName)"
```

### Task 3 — Refactor each of the 13 PDF templates

**Pattern (apply once per type):**

For `<type>` in the 13:

- [ ] **Step 3.1.<type> — Open both `<type>-en.template.ts` and `<type>-ar.template.ts`.** Diff them. Identify every string literal that differs by locale.

- [ ] **Step 3.2.<type> — Extract the strings to JSON.** Create `messages/<type>.en.json` and `messages/<type>.ar.json`:

```json
// messages/receipt.en.json
{
  "heading": "Receipt",
  "school_label": "School",
  "receipt_number": "Receipt #{number}",
  "date_issued": "Issued: {date}",
  "amount_paid": "Amount Paid",
  "thank_you": "Thank you for your payment."
}
```

- [ ] **Step 3.3.<type> — Build the unified template:**

```ts
// apps/api/src/modules/pdf-rendering/templates/receipt.template.ts
import { readFileSync } from 'fs';
import { resolve } from 'path';

import * as Handlebars from 'handlebars';

import { registerI18nHelpers } from '../helpers/handlebars-i18n';

const TEMPLATE_HBS = `
<!DOCTYPE html>
<html dir="{{#if rtl}}rtl{{else}}ltr{{/if}}" lang="{{locale}}">
<head><meta charset="utf-8"><title>{{t 'heading' locale}}</title></head>
<body class="receipt">
  <h1>{{t 'heading' locale}}</h1>
  <p class="meta">
    {{t 'school_label' locale}}: {{getLocalizedSchoolName tenant locale}}<br>
    {{t 'receipt_number' locale}}<br>
    {{t 'date_issued' locale}}
  </p>
  <p class="amount">
    <strong>{{t 'amount_paid' locale}}:</strong>
    {{formatCurrency amount locale currency}}
  </p>
  <p class="footer">{{t 'thank_you' locale}}</p>
</body>
</html>
`;

export function compileReceiptTemplate(): Handlebars.TemplateDelegate {
  registerI18nHelpers(Handlebars, {
    messages: {
      en: JSON.parse(readFileSync(resolve(__dirname, 'messages/receipt.en.json'), 'utf8')),
      ar: JSON.parse(readFileSync(resolve(__dirname, 'messages/receipt.ar.json'), 'utf8')),
    },
  });
  return Handlebars.compile(TEMPLATE_HBS);
}
```

> **Make-or-break detail:** if the existing en or ar template uses raw HTML/CSS that includes locale-specific tags (e.g. `dir="rtl"` hardcoded only in the AR variant), capture that via `{{#if rtl}}` blocks driven by the locale. Don't lose the RTL pagination, font, or spacing tweaks.

- [ ] **Step 3.4.<type> — Move locale-specific font/CSS** into the unified template guarded by the `rtl` boolean:

```hbs
<style>
  body { font-family:{{#if rtl}}'Noto Sans Arabic', {{/if}}'Inter', sans-serif; }
    .meta { text-align:{{#if rtl}}right{{else}}left{{/if}}; }
</style>
```

> Better yet — use logical CSS properties (`text-align: start`) instead of the `if rtl` branching where possible. Match the existing template's choices though; consistency with the pre-refactor output is what the regression test enforces.

- [ ] **Step 3.5.<type> — Spec test the unified template:**

```ts
// apps/api/src/modules/pdf-rendering/templates/receipt.template.spec.ts
import { compileReceiptTemplate } from './receipt.template';

describe('receipt template', () => {
  const tpl = compileReceiptTemplate();

  const data = {
    tenant: { name: 'Demo School', school_name_ar: 'مدرسة' },
    locale: 'en',
    rtl: false,
    amount: 100,
    currency: 'EUR',
    number: '12345',
    date: '2026-04-25',
  };

  it('renders English correctly', () => {
    const html = tpl({ ...data, locale: 'en', rtl: false });
    expect(html).toContain('Receipt');
    expect(html).toContain('Demo School');
    expect(html).toContain('Thank you');
  });

  it('renders Arabic correctly', () => {
    const html = tpl({ ...data, locale: 'ar', rtl: true });
    expect(html).toContain('إيصال');
    expect(html).toContain('مدرسة');
    expect(html).toContain('dir="rtl"');
  });
});
```

- [ ] **Step 3.6.<type> — Update the rendering wiring** (`pdf-rendering.service.ts` or equivalent). Today it likely does `const template = type === 'receipt' && locale === 'en' ? receiptEnTemplate : receiptArTemplate`. Change to:

```ts
const compileFor = TEMPLATE_REGISTRY[type]; // returns the unified compiler
const tpl = compileFor();
const html = tpl({ ...data, locale, rtl: locale === 'ar' });
return puppeteer.renderPdf(html);
```

- [ ] **Step 3.7.<type> — Run unit + integration tests for this type:**

```bash
pnpm --filter @school/api test -- receipt.template
```

Expect green.

- [ ] **Step 3.8.<type> — Delete the old file pair:**

```bash
git rm apps/api/src/modules/pdf-rendering/templates/receipt-en.template.ts \
       apps/api/src/modules/pdf-rendering/templates/receipt-ar.template.ts \
       apps/api/src/modules/pdf-rendering/templates/receipt-en.template.spec.ts \
       apps/api/src/modules/pdf-rendering/templates/receipt-ar.template.spec.ts
```

- [ ] **Step 3.9.<type> — Commit (one commit per template type — easier review + rollback):**

```bash
git add apps/api/src/modules/pdf-rendering/templates/receipt.template.ts \
        apps/api/src/modules/pdf-rendering/templates/receipt.template.spec.ts \
        apps/api/src/modules/pdf-rendering/templates/messages/receipt.en.json \
        apps/api/src/modules/pdf-rendering/templates/messages/receipt.ar.json
git commit -m "refactor(pdf): unify receipt template (locale-driven)"
```

> **Repeat steps 3.1–3.9 for the remaining 12 types.**

### Task 4 — Pixel-diff regression test

**Files:**

- Create: `apps/api/src/modules/pdf-rendering/__tests__/pdf-pixel-regression.spec.ts`

- [ ] **Step 4.1 — Add a dependency** if pixel-diff isn't already wired. `pdf-img-converter` + `pixelmatch` work well; or use `pdfjs-dist` to rasterise + `pixelmatch`.

```bash
pnpm --filter @school/api add -D pdfjs-dist pixelmatch pngjs
```

- [ ] **Step 4.2 — Write the test:**

```ts
// apps/api/src/modules/pdf-rendering/__tests__/pdf-pixel-regression.spec.ts
import { readFileSync } from 'fs';
import { resolve } from 'path';

import * as pdfjs from 'pdfjs-dist/legacy/build/pdf';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

import { renderPdf } from '../pdf-renderer';
import { fixtureFor } from './fixtures';

const TYPES = [
  'des-inspection',
  'household-statement',
  'invoice',
  'pastoral-summary',
  'payslip',
  'receipt',
  'report-card',
  'report-card-modern',
  'safeguarding-compliance',
  'sst-activity',
  'transcript',
  'trip-leader-pack',
  'wellbeing-programme',
];

const PIXEL_DIFF_THRESHOLD_PCT = 1; // 1%

async function pdfToPng(pdf: Buffer): Promise<{ data: Buffer; width: number; height: number }> {
  const doc = await pdfjs.getDocument({ data: pdf }).promise;
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: 1.5 });
  const canvas =
    (global as any).document?.createElement('canvas') ??
    new (require('canvas').Canvas)(viewport.width, viewport.height);
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;
  const buf = canvas.toBuffer('image/png');
  return { data: buf, width: canvas.width, height: canvas.height };
}

describe('PDF pixel regression — 13 types × 2 locales', () => {
  const baselineDir = resolve(__dirname, 'baselines');

  for (const type of TYPES) {
    for (const locale of ['en', 'ar']) {
      it(`${type} (${locale}) renders within ${PIXEL_DIFF_THRESHOLD_PCT}% of baseline`, async () => {
        const fixture = fixtureFor(type, locale);
        const fresh = await renderPdf({ type, locale, data: fixture });
        const baseline = readFileSync(resolve(baselineDir, `${type}.${locale}.pdf`));

        const a = await pdfToPng(fresh);
        const b = await pdfToPng(baseline);

        expect(a.width).toBe(b.width);
        expect(a.height).toBe(b.height);

        const aPng = PNG.sync.read(a.data);
        const bPng = PNG.sync.read(b.data);
        const diff = new PNG({ width: aPng.width, height: aPng.height });
        const mismatched = pixelmatch(aPng.data, bPng.data, diff.data, aPng.width, aPng.height, {
          threshold: 0.1,
        });

        const totalPx = aPng.width * aPng.height;
        const diffPct = (mismatched / totalPx) * 100;
        expect(diffPct).toBeLessThanOrEqual(PIXEL_DIFF_THRESHOLD_PCT);
      });
    }
  }
});
```

- [ ] **Step 4.3 — Run:**

```bash
pnpm --filter @school/api test -- pdf-pixel-regression
```

Expect all 26 cases (13 types × en + ar) within 1%. **If any fail, debug and fix the unified template until they all pass.** Common causes:

- A locale-specific font is missing from the unified template
- An RTL layout tweak got dropped
- A string substitution moved a span by 1px (often ignorable; widen the threshold only as a last resort)

- [ ] **Step 4.4 — Commit:**

```bash
git add apps/api/src/modules/pdf-rendering/__tests__/pdf-pixel-regression.spec.ts apps/api/package.json apps/api/pnpm-lock.yaml
git commit -m "test(pdf): pixel-diff regression for 13 templates × en+ar at 1% threshold"
```

### Task 5 — Wire the regression test into CI

**Files:**

- Modify: `.github/workflows/ci.yml`

- [ ] **Step 5.1 — Add the test job** to ensure the regression runs on every push:

```yaml
- name: PDF pixel regression
  run: pnpm --filter @school/api test -- pdf-pixel-regression --runInBand
```

- [ ] **Step 5.2 — Commit:**

```bash
git add .github/workflows/ci.yml
git commit -m "ci(pdf): run pixel regression on every push"
```

### Task 6 — Local regression sweep, push, deploy, verify

- [ ] **Step 6.1 — Local:**

```bash
turbo lint
turbo type-check
turbo test
```

- [ ] **Step 6.2 — Pre-push branch state:**

```bash
git fetch origin main
git log --oneline origin/main..HEAD
```

- [ ] **Step 6.3 — Push + watch:**

```bash
git push origin main
gh run watch
```

- [ ] **Step 6.4 — Production smoke** — generate a sample receipt and a sample report card on NHQS via the relevant admin/finance UI and visually compare to a recent pre-deploy export. They should be visually identical.

- [ ] **Step 6.5 — Append completion entry to `IMPLEMENTATION_LOG.md`** with sample PDFs attached as evidence (commit them to a `New Languages/_evidence/` folder if needed) — commit SHAs, CI run URL, deploy timestamp, manual verification.

---

## Acceptance criteria

- [ ] All 13 PDF types refactored to a single unified template each
- [ ] All 13 types have `messages/{type}.en.json` and `messages/{type}.ar.json`
- [ ] All 26 old `*-en.template.ts` / `*-ar.template.ts` files deleted
- [ ] Handlebars helpers (`t`, `formatDate`, `formatCurrency`, `formatNumber`, `getLocalizedSchoolName`) registered + unit-tested
- [ ] Pixel-diff regression test passes for all 26 (type × locale) combinations at ≤1% threshold
- [ ] Pixel-diff test added to CI as a hard gate
- [ ] `turbo lint`, `turbo type-check`, `turbo test` green
- [ ] Production deploy successful
- [ ] Manual verification: NHQS receipt + report card render visually identical to pre-deploy
- [ ] `IMPLEMENTATION_LOG.md` updated

---

## Verification commands

```bash
turbo test -- pdf-pixel-regression
turbo lint && turbo type-check && turbo test

# Generate live PDFs on prod (via the API/UI) and compare to a pre-deploy reference.
```

---

## Rollback

```bash
# All commits in this implementation revert cleanly because there's no schema
# change. Tenant data is untouched.
git revert <last-sha>..<first-sha>
git push origin main
# CI redeploys the file-pair templates.
```

> **Caveat:** if a pixel-diff regression slips through CI (e.g., due to a flaky test threshold), fix forward by tightening the unified template — do not just bump the threshold to make the test pass.

---

## Notes for the executor

- The pixel-diff baselines committed in Task 1 are intentionally checked into git. They're binary, but small (PDFs ~50–500KB each).
- If `pdfjs-dist` is heavy in CI, consider rendering pages to PNG via Puppeteer instead — but use the same renderer for fresh + baseline so the comparison is apples-to-apples.
- If a template's pre-refactor output uses inline `toLocaleString('ar-u-nu-latn-ca-gregory')`, the new `formatDate` helper preserves that policy (Western numerals + Gregorian) per `i18n-format.ts`. Don't accidentally change to Arabic-Indic numerals.
- Do NOT add new translation keys to en/ar JSON files in this implementation. The strings ported here are exactly the same strings already shipping in the file-pair templates.
- After deploy, flag `feature-map.md` to the user (per `feature-map-maintenance.md`). Do NOT auto-update.
