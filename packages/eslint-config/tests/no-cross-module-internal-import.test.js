const { RuleTester } = require('eslint');
const rule = require('../rules/no-cross-module-internal-import');

const ruleTester = new RuleTester({
  parser: require.resolve('@typescript-eslint/parser'),
});

ruleTester.run('no-cross-module-internal-import', rule, {
  valid: [
    // Same-module import (allowed)
    {
      code: `import { InvoicesService } from './invoices.service';`,
      filename: 'apps/api/src/modules/finance/finance.controller.ts',
    },
    // Same-module deep import (allowed)
    {
      code: `import { CreateInvoiceDto } from './dto/create-invoice.dto';`,
      filename: 'apps/api/src/modules/finance/finance.controller.ts',
    },
    // Cross-module .module.ts import (allowed — NestJS DI registration)
    {
      code: `import { StudentsModule } from '../students/students.module';`,
      filename: 'apps/api/src/modules/finance/finance.module.ts',
    },
    // Import from common/ directory (allowed — not inside modules/)
    {
      code: `import { AuthGuard } from '../../common/guards/auth.guard';`,
      filename: 'apps/api/src/modules/finance/finance.controller.ts',
    },
    // Import from external package (allowed — not a relative import)
    {
      code: `import { Injectable } from '@nestjs/common';`,
      filename: 'apps/api/src/modules/finance/finance.service.ts',
    },
    // Type-only cross-module import (allowed — no runtime coupling)
    {
      code: `import type { StudentRow } from '../students/students.service';`,
      filename: 'apps/api/src/modules/finance/finance.service.ts',
    },
    // File outside modules/ directory (rule does not apply)
    {
      code: `import { FinanceService } from '../modules/finance/finance.service';`,
      filename: 'apps/api/src/common/interceptors/audit.interceptor.ts',
    },
    // Test file (exempt — tests reach across modules for fixtures)
    {
      code: `import { FinanceService } from '../finance/finance.service';`,
      filename: 'apps/api/src/modules/students/students.service.spec.ts',
    },
    // Import from shared package (allowed)
    {
      code: `import { createStudentSchema } from '@school/shared';`,
      filename: 'apps/api/src/modules/finance/finance.service.ts',
    },
  ],
  invalid: [
    // Cross-module service import (blocked)
    {
      code: `import { BehaviourService } from '../behaviour/behaviour.service';`,
      filename: 'apps/api/src/modules/finance/finance.service.ts',
      errors: [{ messageId: 'crossModuleImport', data: { targetModule: 'behaviour' } }],
    },
    // Cross-module controller import (blocked)
    {
      code: `import { StudentsController } from '../students/students.controller';`,
      filename: 'apps/api/src/modules/finance/finance.controller.ts',
      errors: [{ messageId: 'crossModuleImport', data: { targetModule: 'students' } }],
    },
    // Cross-module DTO import (blocked — should use @school/shared)
    {
      code: `import { CreateStudentDto } from '../students/dto/create-student.dto';`,
      filename: 'apps/api/src/modules/finance/finance.service.ts',
      errors: [{ messageId: 'crossModuleImport', data: { targetModule: 'students' } }],
    },
    // Cross-module constant import (blocked)
    {
      code: `import { VALID_TRANSITIONS } from '../approvals/approval.constants';`,
      filename: 'apps/api/src/modules/finance/finance.service.ts',
      errors: [{ messageId: 'crossModuleImport', data: { targetModule: 'approvals' } }],
    },
  ],
});

console.log('no-cross-module-internal-import: all tests passed');
