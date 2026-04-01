# Backend Test Health Review

## A. Facts

- The canonical fact pack reports `529` backend suites passed, `7,190` backend tests passed, and `0` failing backend suites.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/package.json` defines separate scripts for `"test": "jest"`, `"test:integration": "jest --config jest.integration.config.js"`, and `"test:e2e": "jest --config ./test/jest-e2e.json"`.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/jest.config.js` runs only files matching `.*\.spec\.ts$` and ignores `\.rls\.spec\.ts$`, `\.performance\.spec\.ts$`, `\.e2e-spec\.ts$`, and `<rootDir>/test/`.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/jest.integration.config.js` reintroduces `.rls.spec.ts`, `.performance.spec.ts`, `.e2e-spec.ts`, and `/test/[^/]+.spec.ts`.
- A direct count under `apps/api` found:
- `529` unit specs matched the default Jest lane.
- `1` `.rls.spec.ts` file exists.
- `1` `.performance.spec.ts` file exists.
- `76` specs/e2e specs exist under `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/test`.
- A direct module-density count for important backend modules found:
- `auth`: `10` source files, `1,420` source LOC, `2` spec files, `2,456` spec LOC.
- `rbac`: `8` source files, `1,505` source LOC, `7` spec files, `1,926` spec LOC.
- `finance`: `35` source files, `7,257` source LOC, `33` spec files, `5,524` spec LOC.
- `attendance`: `12` source files, `4,022` source LOC, `6` spec files, `3,317` spec LOC.
- `approvals`: `5` source files, `839` source LOC, `4` spec files, `999` spec LOC.
- `scheduling`: `28` source files, `7,563` source LOC, `27` spec files, `6,284` spec LOC.
- `behaviour`: `64` source files, `25,355` source LOC, `56` spec files, `23,143` spec LOC.
- `pastoral`: `45` source files, `19,414` source LOC, `33` spec files, `18,511` spec LOC.
- `gradebook`: `44` source files, `15,190` source LOC, `42` spec files, `13,708` spec LOC.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/auth/auth.service.spec.ts` contains `95` tests and `180` `expect(...)` calls by direct text count.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/auth/auth.controller.spec.ts` contains `28` tests and `46` `expect(...)` calls by direct text count.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/finance/payments.service.spec.ts` contains `10` tests and `12` `expect(...)` calls by direct text count.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/approvals/approval-requests.service.spec.ts` covers `approve`, `reject`, `cancel`, and `checkAndCreateIfNeeded`.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/scheduling/substitution.service.spec.ts` covers `reportAbsence`, `findEligibleSubstitutes`, `assignSubstitute`, and `getTodayBoard`.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/finance/payments.service.spec.ts` tests `confirmAllocations` only for `payment not found` and `payment not posted`.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/finance/payments.service.ts` implements additional `confirmAllocations` branches for concurrent status changes, over-allocation, missing invoice, household mismatch, invoice-balance overflow, allocation creation, invoice rebalance, and conditional receipt creation inside an RLS transaction.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/test/p4b-scheduling.e2e-spec.ts` exercises scheduling endpoints across validation, permissions, CRUD, and run lifecycle flows.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/test/p6-finance.e2e-spec.ts` exercises finance payments/allocations, refunds, dashboard, Stripe webhook handling, and cross-tenant isolation.
- No critical backend module with failing tests was identified from the canonical evidence. The fact pack recorded `0` failing backend suites.
- No backend tests were re-run for this review.

## B. Strong Signals

- The backend suite is not just numerically large; sampled strong specs assert side effects and security rules, not only returned DTO shapes.
- Auth testing is especially strong. The sampled service spec covers JWT generation/verification, Redis session writes, brute-force handling, MFA, password reset, tenant switching, and audit logging. The controller spec also checks cookie behavior and request-to-service argument mapping.
- Scheduling is broadly tested at two layers: very high unit-spec breadth inside the module and a dedicated e2e file that covers permission boundaries, validation, and workflow endpoints.
- Approvals testing is reasonably trustworthy for state-machine work. The sampled spec covers valid transitions, invalid transitions, self-approval/rejection blocking, queue dispatch, and queue failure recovery.
- Mock-heavy service tests are the norm. Transaction/RLS helpers are often mocked as simple pass-throughs rather than exercising real interactive transaction behavior.
- Finance has meaningful higher-level coverage, but the sampled unit coverage is lighter and more selective than the auth/approvals examples.
- Some higher-level tests allow multiple acceptable outcomes or depend on real time, which weakens their usefulness as strict regression alarms.

## C. Inferences

- Best-tested important backend module: `scheduling`.
- Why: it has near one-to-one source/spec file coverage among the fact-pack high-risk domains and also has a dedicated e2e file with broad endpoint coverage.
- Worst-tested important backend module: `finance`.
- Why: among the fact-pack high-risk domains it had the lowest sampled spec-to-source LOC ratio, and the sampled `PaymentsService` unit spec leaves the most transaction-heavy logic largely untested.
- Critical module with failing tests: none observed in the canonical run.
- The backend tests are generally trustworthy for routine refactors inside well-covered modules such as `auth`, `approvals`, and likely much of `scheduling`.
- The backend tests are only partially trustworthy as a single green signal for refactoring transaction-heavy, RLS-sensitive, or cross-module finance behavior because the default `test` lane excludes a large integration/e2e slice and the sampled finance unit tests under-cover the hardest paths.

## D. Top Findings

### 1. Default backend green bar omits a large integration/e2e layer

- Title: Default backend green bar omits a large integration/e2e layer
- Severity: High
- Confidence: High
- Why it matters: A refactor can keep the default backend test lane green while still breaking request wiring, RLS behavior, or cross-module flows that live in the separate integration/e2e layer. That makes the main green signal less trustworthy than it appears.
- Evidence:
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/package.json:12-14` separates `test`, `test:integration`, and `test:e2e`.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/jest.config.js:5-11` excludes `.rls.spec.ts`, `.performance.spec.ts`, `.e2e-spec.ts`, and `/test/`.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/jest.integration.config.js:6-12` reintroduces those suites through a different config.
- Direct file counting found `529` default-lane unit specs plus `78` additional non-default specs (`1` RLS, `1` performance, `76` under `apps/api/test`).
- Fix direction: Promote a combined backend health command into CI and local pre-flight, or at minimum surface unit and integration/e2e results as distinct required checks so refactor decisions are based on the full executed surface.

### 2. Finance unit tests under-cover the transactional core

- Title: Finance unit tests under-cover the transactional core
- Severity: High
- Confidence: High
- Why it matters: Finance is a fact-pack high-risk domain. The sampled `PaymentsService` unit spec checks only the outer shell of `confirmAllocations`, so the correctness of concurrency-sensitive allocation logic depends too heavily on higher-level tests that are not part of the default backend lane.
- Evidence:
- Direct module-density count: `finance` has `35` source files / `7,257` source LOC vs `33` spec files / `5,524` spec LOC, the lowest sampled spec-to-source LOC ratio among the fact-pack high-risk domains reviewed here.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/finance/payments.service.spec.ts:223-245` only tests `confirmAllocations` for missing payment and invalid status.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/finance/payments.service.ts:263-364` implements re-read inside transaction, over-allocation guard, missing invoice guard, household mismatch guard, balance overflow guard, allocation creation, invoice rebalance, and receipt creation.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/test/p6-finance.e2e-spec.ts:731-955` covers some payment/allocation behavior, but that suite is outside the default `test` script.
- Fix direction: Add targeted unit tests for each transactional invariant in `confirmAllocations` and similar finance services, then keep finance e2e coverage as secondary system-level protection rather than the primary place those rules are verified.

### 3. Mocked transaction/RLS helpers reduce realism in some service specs

- Title: Mocked transaction/RLS helpers reduce realism in some service specs
- Severity: Medium
- Confidence: Medium
- Why it matters: Services whose correctness depends on interactive transactions and tx-scoped side effects can pass unit tests even if the real transaction boundary or collaborator wiring is wrong.
- Evidence:
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/finance/payments.service.spec.ts:8-12` mocks `createRlsClient` as a simple pass-through to the raw Prisma object.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/scheduling/substitution.service.spec.ts:23-28` does the same with a mocked transaction wrapper.
- The corresponding services rely on tx-scoped behavior for writes: `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/finance/payments.service.ts:283-364` and `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/scheduling/substitution.service.ts:57-74` and `258-279`.
- Fix direction: Keep the fast unit tests, but add a smaller set of integration tests around RLS/transaction-heavy services and assert tx-scoped collaborator usage where breakage would be expensive.

### 4. Some higher-level tests are conditional or time-sensitive, which weakens determinism

- Title: Some higher-level tests are conditional or time-sensitive, which weakens determinism
- Severity: Medium
- Confidence: High
- Why it matters: Tests that accept multiple outcomes or depend on wall-clock timing are weaker regression alarms and can become flaky or non-diagnostic when behavior changes.
- Evidence:
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/test/p4b-scheduling.e2e-spec.ts:746-770` accepts either `201` or `400` for scheduling-run creation depending on prerequisite state.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/test/p6-finance.e2e-spec.ts:845-874` and `929-944` only assert allocation flows if invoice state happens to match a particular condition.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/auth/auth.service.spec.ts:927-937` uses real time plus `setTimeout` to make token expiry assertions.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/scheduling/substitution.service.spec.ts:313-345` derives "today" and "tomorrow" from `new Date()` at runtime.
- Fix direction: Seed deterministic prerequisites, remove conditional branches inside assertions, and use fixed timestamps or fake timers where possible.

### 5. Auth and approvals show what refactor-safe testing looks like in this repo

- Title: Auth and approvals show what refactor-safe testing looks like in this repo
- Severity: Low
- Confidence: High
- Why it matters: These files are good internal templates. They verify side effects, error codes, permission outcomes, and state transitions, which makes them much more valuable during refactors than shape-only tests.
- Evidence:
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/auth/auth.service.spec.ts:468-1052` checks session creation, audit logging, brute-force rules, tenant membership, MFA, and refresh edge cases.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/auth/auth.controller.spec.ts:97-347` checks cookie behavior, IP extraction, tenant override behavior, and missing refresh cookie errors.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/approvals/approval-requests.service.spec.ts:96-492` checks valid/invalid transitions, callback queue dispatch, and callback enqueue failure recovery.
- Fix direction: Use these patterns as the baseline for weaker transactional domains, especially finance.

## E. Files Reviewed

- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Audit-GPT/fact-pack_2026-04-01_02-39-13.md`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/CLAUDE.md`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/package.json`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/package.json`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/jest.config.js`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/jest.integration.config.js`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/auth/auth.service.spec.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/auth/auth.controller.spec.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/finance/payments.service.spec.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/finance/payments.service.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/approvals/approval-requests.service.spec.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/approvals/approval-requests.service.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/scheduling/substitution.service.spec.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/scheduling/substitution.service.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/test/auth.e2e-spec.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/test/p4b-scheduling.e2e-spec.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/test/p6-finance.e2e-spec.ts`

## F. Additional Commands Run

```sh
sed -n '1,260p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Audit-GPT/fact-pack_2026-04-01_02-39-13.md'
sed -n '261,520p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Audit-GPT/fact-pack_2026-04-01_02-39-13.md'
rg -n "best|worst|failing|coverage|attendance|approvals|auth|finance|scheduling|permissions|rbac|spec" '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Audit-GPT/fact-pack_2026-04-01_02-39-13.md'
sed -n '1,260p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/CLAUDE.md'
rg --files 'apps/api' | rg '(^|/)(jest(\.[^.]+)?\.config\.(js|ts)|jest\.config\.(js|ts)|test/jest.*\.(js|ts))$'
sed -n '1,220p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/jest.config.js'
sed -n '1,220p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/jest.integration.config.js'
node - <<'NODE'
const fs = require('fs');
const path = require('path');
const root = '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules';
const important = ['auth','rbac','finance','attendance','approvals','scheduling','behaviour','pastoral','gradebook'];
for (const mod of important) {
  const dir = path.join(root, mod);
  let specFiles = 0;
  let srcFiles = 0;
  let specLines = 0;
  let srcLines = 0;
  function walk(p) {
    for (const entry of fs.readdirSync(p, { withFileTypes: true })) {
      const full = path.join(p, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry.name)) {
        const lines = fs.readFileSync(full, 'utf8').split('\n').length;
        if (/\.(spec|test)\.(ts|tsx)$/.test(entry.name)) {
          specFiles++;
          specLines += lines;
        } else {
          srcFiles++;
          srcLines += lines;
        }
      }
    }
  }
  walk(dir);
  const ratio = srcLines === 0 ? 0 : (specLines / srcLines);
  console.log([mod, srcFiles, srcLines, specFiles, specLines, ratio.toFixed(2)].join('\t'));
}
NODE
node - <<'NODE'
const fs = require('fs');
const path = require('path');
const root = '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules';
const mods = ['auth','rbac','finance','attendance','approvals','scheduling','behaviour','pastoral','gradebook'];
function walk(p, arr) {
  for (const entry of fs.readdirSync(p, { withFileTypes: true })) {
    const full = path.join(p, entry.name);
    if (entry.isDirectory()) walk(full, arr);
    else if (/\.spec\.ts$/.test(entry.name)) arr.push(full);
  }
}
for (const mod of mods) {
  const files = [];
  walk(path.join(root, mod), files);
  const rows = files.map((file) => {
    const text = fs.readFileSync(file, 'utf8');
    const itCount = (text.match(/\b(it|test)\s*\(/g) || []).length;
    const expectCount = (text.match(/\bexpect\s*\(/g) || []).length;
    const lines = text.split('\n').length;
    return { file, lines, itCount, expectCount };
  }).sort((a, b) => b.lines - a.lines);
  console.log(`MODULE\t${mod}`);
  for (const row of rows.slice(0, 6)) {
    console.log([row.lines, row.itCount, row.expectCount, row.file].join('\t'));
  }
}
NODE
rg -n "describe\(|it\(|test\(" apps/api/src/modules/{auth,rbac,finance,attendance,approvals,scheduling,behaviour,pastoral,gradebook} --glob '*.spec.ts' --stats
sed -n '1,220p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/package.json'
sed -n '1,220p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/package.json'
node - <<'NODE'
const fs = require('fs');
const path = require('path');
const root = '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api';
const buckets = { unit: 0, rls: 0, performance: 0, e2e: 0, testDir: 0 };
const files = [];
function walk(p) {
  for (const entry of fs.readdirSync(p, { withFileTypes: true })) {
    const full = path.join(p, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.spec\.ts$|\.e2e-spec\.ts$/.test(entry.name)) files.push(full);
  }
}
walk(path.join(root, 'src'));
walk(path.join(root, 'test'));
for (const file of files) {
  if (file.includes('/test/')) buckets.testDir++;
  else if (file.endsWith('.rls.spec.ts')) buckets.rls++;
  else if (file.endsWith('.performance.spec.ts')) buckets.performance++;
  else if (file.endsWith('.e2e-spec.ts')) buckets.e2e++;
  else if (file.endsWith('.spec.ts')) buckets.unit++;
}
console.log(JSON.stringify(buckets, null, 2));
NODE
find '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/test' -type f \( -name '*.spec.ts' -o -name '*.e2e-spec.ts' \) | sort
node - <<'NODE'
const fs = require('fs');
const path = require('path');
const dir = '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/finance';
for (const name of fs.readdirSync(dir).filter((n)=>n.endsWith('.service.ts')).sort()) {
  const full = path.join(dir, name);
  const text = fs.readFileSync(full,'utf8');
  const lines = text.split('\n').length;
  const methods = (text.match(/^\s*(?:public\s+|private\s+|async\s+)*(\w+)\s*\(/gm) || []).length;
  const spec = full.replace(/\.service\.ts$/, '.service.spec.ts');
  let specLines = 0;
  if (fs.existsSync(spec)) specLines = fs.readFileSync(spec,'utf8').split('\n').length;
  console.log([name, lines, methods, specLines].join('\t'));
}
NODE
node - <<'NODE'
const fs = require('fs');
const path = require('path');
const files = [
'/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/attendance/attendance.service.ts',
'/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/auth/auth.service.ts',
'/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/approvals/approval-requests.service.ts',
'/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/scheduling/substitution.service.ts'];
for (const file of files) {
  const text = fs.readFileSync(file,'utf8');
  const lines = text.split('\n').length;
  const methods = [...text.matchAll(/^\s*(?:public\s+|private\s+|async\s+)*(\w+)\s*\(/gm)].map(m=>m[1]);
  console.log(file + '\t' + lines + '\t' + methods.length + '\t' + methods.join(','));
}
NODE
rg -n "^describe|^  describe|^\s+it\(" '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/auth/auth.service.spec.ts'
sed -n '1,260p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/auth/auth.service.spec.ts'
rg -n "^describe|^  describe|^\s+it\(" '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/finance/payments.service.spec.ts'
sed -n '1,320p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/finance/payments.service.spec.ts'
rg -n "^export class|^  async |^  private |^  public " '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/finance/payments.service.ts'
sed -n '1,260p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/finance/payments.service.ts'
sed -n '261,460p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/finance/payments.service.ts'
sed -n '1,260p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/auth/auth.controller.spec.ts'
sed -n '261,520p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/auth/auth.controller.spec.ts'
sed -n '521,760p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/auth/auth.controller.spec.ts'
sed -n '1,280p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/approvals/approval-requests.service.spec.ts'
sed -n '281,560p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/approvals/approval-requests.service.spec.ts'
rg -n "^export class|^  async |^  private |^const CALLBACK_ACTIONS" '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/approvals/approval-requests.service.ts'
sed -n '1,260p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/approvals/approval-requests.service.ts'
sed -n '261,460p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/approvals/approval-requests.service.ts'
sed -n '1,240p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/scheduling/substitution.service.spec.ts'
sed -n '241,420p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/scheduling/substitution.service.spec.ts'
sed -n '1,220p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/scheduling/substitution.service.ts'
sed -n '221,420p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/scheduling/substitution.service.ts'
find '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/test' -type f \( -name '*.spec.ts' -o -name '*.e2e-spec.ts' \) | rg '/(auth|approval|attendance|finance|scheduling|gradebook|pastoral)'
node - <<'NODE'
const fs = require('fs');
const path = require('path');
const testRoot = '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/test';
const keys = ['auth','approval','attendance','finance','scheduling','gradebook','pastoral'];
const counts = Object.fromEntries(keys.map(k => [k, 0]));
function walk(p){
  for (const entry of fs.readdirSync(p,{withFileTypes:true})){
    const full = path.join(p,entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(spec|e2e-spec)\.ts$/.test(entry.name)) {
      for (const key of keys) if (full.includes(key)) counts[key]++;
    }
  }
}
walk(testRoot);
console.log(JSON.stringify(counts, null, 2));
NODE
rg -n "^describe|^  describe|^\s+it\(" '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/test/p6-finance.e2e-spec.ts'
sed -n '1,240p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/test/p6-finance.e2e-spec.ts'
rg -n "^describe|^  describe|^\s+it\(" '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/test/auth.e2e-spec.ts'
rg -n "^describe|^  describe|^\s+it\(" '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/test/p4b-scheduling.e2e-spec.ts'
nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/jest.config.js' | sed -n '1,40p'
nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/jest.integration.config.js' | sed -n '1,40p'
nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/package.json' | sed -n '1,40p'
nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/finance/payments.service.ts' | sed -n '140,365p'
nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/finance/payments.service.spec.ts' | sed -n '1,270p'
nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/auth/auth.service.spec.ts' | sed -n '463,1085p'
nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/auth/auth.controller.spec.ts' | sed -n '88,390p'
nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/approvals/approval-requests.service.spec.ts' | sed -n '85,520p'
nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/scheduling/substitution.service.spec.ts' | sed -n '84,355p'
nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/test/p4b-scheduling.e2e-spec.ts' | sed -n '40,905p'
nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/test/p6-finance.e2e-spec.ts' | sed -n '730,1515p'
if [ -f '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Audit-GPT/subagent-02-backend-tests_2026-04-01_02-39-13.md' ]; then echo EXISTS; else echo MISSING; fi
```

## G. Score

- Score: `7/10`
- Justification: The backend test estate is materially useful and substantially better than average for a monolith of this size. Auth, approvals, and scheduling show real regression-catching power, and there is meaningful integration/e2e inventory for critical domains. The reason this is not higher is that the default backend green bar excludes a large integration/e2e slice, finance transaction-heavy unit tests are noticeably thinner than the strongest modules, and some higher-level tests are conditional or time-sensitive. That places the repo in the "generally solid, notable weaknesses, manageable risk" band rather than "safe to extend and refactor with few material risks."

## H. Confidence in this review

- Confidence in this review: Medium
- What limited certainty: I relied on the canonical fact pack for pass/fail status and intentionally did not re-run the backend suite. The review sampled representative strong and weak specs rather than exhaustively reading every backend test file, so there may be stronger or weaker outliers outside the sampled set. The scoring is therefore evidence-based but still sample-based.
