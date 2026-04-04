const { RuleTester } = require('eslint');
const rule = require('../rules/prefer-shared-subpath');

const ruleTester = new RuleTester({
  parser: require.resolve('@typescript-eslint/parser'),
});

ruleTester.run('prefer-shared-subpath', rule, {
  valid: [
    // Shared-kernel import (auth) — belongs in root barrel, no warning
    {
      code: `import { AuthTokenPayload } from '@school/shared';`,
      filename: 'apps/api/src/modules/auth/auth.controller.ts',
    },
    // Already using subpath — no warning
    {
      code: `import { IncidentStatus } from '@school/shared/behaviour';`,
      filename: 'apps/api/src/modules/behaviour/behaviour.service.ts',
    },
    // Root barrel import of pagination (shared-kernel) — no warning
    {
      code: `import { paginationQuerySchema } from '@school/shared';`,
      filename: 'apps/api/src/modules/students/students.controller.ts',
    },
    // File outside enforced directories — rule does not apply
    {
      code: `import { IncidentStatus } from '@school/shared';`,
      filename: 'apps/api/src/common/utils/helpers.ts',
    },
    // Spec file — exempt
    {
      code: `import { IncidentStatus } from '@school/shared';`,
      filename: 'apps/api/src/modules/behaviour/behaviour.service.spec.ts',
    },
    // Import from a different package entirely
    {
      code: `import { Injectable } from '@nestjs/common';`,
      filename: 'apps/api/src/modules/behaviour/behaviour.service.ts',
    },
    // Namespace import (not ImportSpecifier) — no individual name to check
    {
      code: `import * as shared from '@school/shared';`,
      filename: 'apps/api/src/modules/behaviour/behaviour.service.ts',
    },
    // Worker processor file with shared-kernel import — no warning
    {
      code: `import { ApprovalStatus } from '@school/shared';`,
      filename: 'apps/worker/src/processors/finance/invoice.processor.ts',
    },
    // SYSTEM_USER_SENTINEL should NOT match 'sen' — 'sentinel' is not SEN
    {
      code: `import { SYSTEM_USER_SENTINEL } from '@school/shared';`,
      filename: 'apps/api/src/modules/payroll/payroll.service.ts',
    },
    // AuditLogSensitivity should NOT match 'sen' — 'sensitivity' is not SEN
    {
      code: `import { AuditLogSensitivity } from '@school/shared';`,
      filename: 'apps/api/src/modules/audit/audit.service.ts',
    },
  ],
  invalid: [
    // behaviour keyword in module directory
    {
      code: `import { BehaviourSettings } from '@school/shared';`,
      filename: 'apps/api/src/modules/behaviour/behaviour.service.ts',
      errors: [
        {
          messageId: 'preferSubpath',
          data: { name: 'BehaviourSettings', subpath: 'behaviour' },
        },
      ],
    },
    // incident keyword
    {
      code: `import { IncidentStatus } from '@school/shared';`,
      filename: 'apps/api/src/modules/behaviour/behaviour.controller.ts',
      errors: [
        {
          messageId: 'preferSubpath',
          data: { name: 'IncidentStatus', subpath: 'behaviour' },
        },
      ],
    },
    // pastoral keyword (ConcernLevel matches 'concern')
    {
      code: `import { ConcernLevel } from '@school/shared';`,
      filename: 'apps/api/src/modules/pastoral/pastoral.service.ts',
      errors: [
        {
          messageId: 'preferSubpath',
          data: { name: 'ConcernLevel', subpath: 'pastoral' },
        },
      ],
    },
    // pastoral keyword (PastoralTier matches 'pastoral')
    {
      code: `import { PastoralTier } from '@school/shared';`,
      filename: 'apps/api/src/modules/pastoral/pastoral.service.ts',
      errors: [
        {
          messageId: 'preferSubpath',
          data: { name: 'PastoralTier', subpath: 'pastoral' },
        },
      ],
    },
    // gdpr keyword
    {
      code: `import { GdprRetentionPolicy } from '@school/shared';`,
      filename: 'apps/api/src/modules/compliance/compliance.service.ts',
      errors: [
        {
          messageId: 'preferSubpath',
          data: { name: 'GdprRetentionPolicy', subpath: 'gdpr' },
        },
      ],
    },
    // engagement keyword
    {
      code: `import { EngagementFormTemplate } from '@school/shared';`,
      filename: 'apps/api/src/modules/engagement/engagement.service.ts',
      errors: [
        {
          messageId: 'preferSubpath',
          data: { name: 'EngagementFormTemplate', subpath: 'engagement' },
        },
      ],
    },
    // Mixed import — only the domain-specific identifier warns
    {
      code: `import { paginationQuerySchema, SanctionType } from '@school/shared';`,
      filename: 'apps/api/src/modules/behaviour/behaviour.controller.ts',
      errors: [
        {
          messageId: 'preferSubpath',
          data: { name: 'SanctionType', subpath: 'behaviour' },
        },
      ],
    },
    // Worker processor with domain identifier
    {
      code: `import { IncidentReport } from '@school/shared';`,
      filename: 'apps/worker/src/processors/behaviour/incident.processor.ts',
      errors: [
        {
          messageId: 'preferSubpath',
          data: { name: 'IncidentReport', subpath: 'behaviour' },
        },
      ],
    },
    // ai subpath keyword
    {
      code: `import { anonymiseForAI } from '@school/shared';`,
      filename: 'apps/api/src/modules/ai/ai.service.ts',
      errors: [
        {
          messageId: 'preferSubpath',
          data: { name: 'anonymiseForAI', subpath: 'ai' },
        },
      ],
    },
    // regulatory keyword
    {
      code: `import { RegulatoryFramework } from '@school/shared';`,
      filename: 'apps/api/src/modules/compliance/regulatory.service.ts',
      errors: [
        {
          messageId: 'preferSubpath',
          data: { name: 'RegulatoryFramework', subpath: 'regulatory' },
        },
      ],
    },
    // sen keyword (SenCategory matches 'sencategory')
    {
      code: `import { SenCategory } from '@school/shared';`,
      filename: 'apps/api/src/modules/sen/sen.service.ts',
      errors: [
        {
          messageId: 'preferSubpath',
          data: { name: 'SenCategory', subpath: 'sen' },
        },
      ],
    },
    // sen keyword (SupportPlanStatus matches 'supportplan')
    {
      code: `import { SupportPlanStatus } from '@school/shared';`,
      filename: 'apps/api/src/modules/sen/sen.service.ts',
      errors: [
        {
          messageId: 'preferSubpath',
          data: { name: 'SupportPlanStatus', subpath: 'sen' },
        },
      ],
    },
  ],
});

console.log('prefer-shared-subpath: all tests passed');
