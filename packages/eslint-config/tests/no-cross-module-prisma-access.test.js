const { RuleTester } = require('eslint');
const rule = require('../rules/no-cross-module-prisma-access');

const ruleTester = new RuleTester({
  parser: require.resolve('@typescript-eslint/parser'),
});

ruleTester.run('no-cross-module-prisma-access', rule, {
  valid: [
    // ─── Same-module access (allowed) ───────────────────────────────────────────
    {
      code: `this.prisma.student.findMany({ where: { tenant_id } });`,
      filename: 'apps/api/src/modules/students/students.service.ts',
    },
    // Same-module deep subpath (allowed)
    {
      code: `this.prisma.behaviourIncident.create({ data });`,
      filename: 'apps/api/src/modules/behaviour/analytics/behaviour-analytics.service.ts',
    },
    // Prisma utility methods (allowed — not a model)
    {
      code: `this.prisma.$transaction(async (tx) => { });`,
      filename: 'apps/api/src/modules/finance/finance.service.ts',
    },
    {
      code: `this.prisma.$connect();`,
      filename: 'apps/api/src/modules/finance/finance.service.ts',
    },
    // Spec file (exempt)
    {
      code: `this.prisma.student.findMany({ where: { tenant_id } });`,
      filename: 'apps/api/src/modules/finance/finance.service.spec.ts',
    },
    // Test file (exempt)
    {
      code: `this.prisma.behaviourIncident.findFirst();`,
      filename: 'apps/api/src/modules/gradebook/gradebook.service.test.ts',
    },
    // File outside modules/ (rule does not apply)
    {
      code: `this.prisma.student.findMany();`,
      filename: 'apps/api/src/common/middleware/rls.middleware.ts',
    },
    // Model not in registry (skip — unregistered)
    {
      code: `this.prisma.unknownModel.findMany();`,
      filename: 'apps/api/src/modules/finance/finance.service.ts',
    },
    // Own models — gradebook accessing its owned models
    {
      code: `this.prisma.assessment.findMany({ where: { tenant_id } });`,
      filename: 'apps/api/src/modules/gradebook/gradebook.service.ts',
    },
    {
      code: `this.prisma.grade.create({ data });`,
      filename: 'apps/api/src/modules/gradebook/grades.service.ts',
    },
    // Safeguarding module accessing its own models (after 3C extraction)
    {
      code: `this.prisma.safeguardingConcern.findMany();`,
      filename: 'apps/api/src/modules/safeguarding/safeguarding.service.ts',
    },
    // Not a this.prisma pattern (plain variable — not detected by this rule)
    {
      code: `const result = prisma.student.findMany();`,
      filename: 'apps/api/src/modules/finance/finance.service.ts',
    },
  ],
  invalid: [
    // ─── Cross-module access (flagged) ──────────────────────────────────────────
    // Finance accessing students model
    {
      code: `this.prisma.student.findMany({ where: { tenant_id } });`,
      filename: 'apps/api/src/modules/finance/finance.service.ts',
      errors: [
        {
          messageId: 'crossModulePrismaAccess',
          data: {
            model: 'student',
            ownerModule: 'students',
            currentModule: 'finance',
          },
        },
      ],
    },
    // Gradebook accessing staff profiles
    {
      code: `this.prisma.staffProfile.findFirst({ where: { id: staffId } });`,
      filename: 'apps/api/src/modules/gradebook/gradebook.service.ts',
      errors: [
        {
          messageId: 'crossModulePrismaAccess',
          data: {
            model: 'staffProfile',
            ownerModule: 'staff-profiles',
            currentModule: 'gradebook',
          },
        },
      ],
    },
    // Attendance accessing academic periods
    {
      code: `this.prisma.academicPeriod.findMany({ where: { tenant_id } });`,
      filename: 'apps/api/src/modules/attendance/attendance.service.ts',
      errors: [
        {
          messageId: 'crossModulePrismaAccess',
          data: {
            model: 'academicPeriod',
            ownerModule: 'academics',
            currentModule: 'attendance',
          },
        },
      ],
    },
    // Reports accessing invoices (finance)
    {
      code: `this.prisma.invoice.count({ where: { tenant_id } });`,
      filename: 'apps/api/src/modules/reports/reports-data.service.ts',
      errors: [
        {
          messageId: 'crossModulePrismaAccess',
          data: {
            model: 'invoice',
            ownerModule: 'finance',
            currentModule: 'reports',
          },
        },
      ],
    },
    // Behaviour accessing students (cross-module)
    {
      code: `this.prisma.student.findUnique({ where: { id: studentId } });`,
      filename: 'apps/api/src/modules/behaviour/behaviour.service.ts',
      errors: [
        {
          messageId: 'crossModulePrismaAccess',
          data: {
            model: 'student',
            ownerModule: 'students',
            currentModule: 'behaviour',
          },
        },
      ],
    },
    // Deep subpath — payroll analytics accessing class delivery but also foreign models
    {
      code: `this.prisma.attendanceSession.findMany({ where: { tenant_id } });`,
      filename: 'apps/api/src/modules/payroll/analytics/payroll-analytics.service.ts',
      errors: [
        {
          messageId: 'crossModulePrismaAccess',
          data: {
            model: 'attendanceSession',
            ownerModule: 'attendance',
            currentModule: 'payroll',
          },
        },
      ],
    },
  ],
});

console.log('no-cross-module-prisma-access: all tests passed');
