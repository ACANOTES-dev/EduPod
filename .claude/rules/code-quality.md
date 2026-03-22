---
description: TypeScript strict mode, import ordering, and lint compliance rules to prevent CI failures
globs: ["**/*.ts", "**/*.tsx"]
---

# Code Quality — CI Must Pass

Every file you write or edit MUST pass `turbo lint` and `turbo type-check` without errors. Warnings should be eliminated where possible.

## TypeScript Strict Mode

- All variables must have known types. Never leave a variable as `unknown` without narrowing or asserting.
- Never access properties on possibly-undefined objects without narrowing (`if`, `?.`, or `!` in tests).
- Ensure function return types are inferrable — avoid circular references in object initializers that cause implicit `any`.
- When creating mock objects in tests, give them explicit types so that properties are not `possibly undefined`.
- Match enum/union values exactly — e.g., use `'retain_legal_basis'` not `'retain'` if the union requires it.
- Match required vs optional fields — if a field is `number`, do not pass `null`.

## Import Ordering (import/order)

The ESLint `import/order` rule enforces grouped, alphabetised imports. Follow this structure:

```typescript
// 1. Node builtins
import { resolve } from 'path';

// 2. External packages (alphabetical)
import { Injectable } from '@nestjs/common';
import { z } from 'zod';

// 3. Internal aliases — @school/*, @/* (alphabetical)
import { someSchema } from '@school/shared';

// 4. Relative parent imports — ../ (alphabetical)
import { AuthGuard } from '../../common/guards/auth.guard';

// 5. Relative sibling imports — ./ (alphabetical)
import { MyService } from './my.service';
```

Rules:
- One blank line between each group. No blank lines within a group.
- Imports within a group are alphabetical by module path.
- `@school/*` and `@/*` are separate groups from `../` and `./`.
- `../` and `./` are separate groups — blank line between them.

### Side-effect imports (dotenv, Sentry instrumentation)

When an import must execute before others (e.g., `dotenv` loading env vars), add `/* eslint-disable import/order */` with a reason comment at the top of the file.

### jest.mock hoisting

When `jest.mock(...)` must appear between imports (to mock a module before it's imported), add `/* eslint-disable import/order -- jest.mock must precede mocked imports */` at the top, or `// eslint-disable-next-line import/order` on the post-mock import.

## Unused Imports

Never leave unused imports. If you remove usage of an imported symbol, remove the import too.

## Before Finishing Work

After writing or editing code, mentally verify:
1. No `any` types, no `@ts-ignore`, no `as unknown as X`
2. All imports are ordered and grouped correctly
3. No unused imports or variables
4. All possibly-undefined accesses are narrowed
5. Enum/union literal values match their type definitions exactly
