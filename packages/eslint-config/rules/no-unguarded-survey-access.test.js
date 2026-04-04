const { RuleTester } = require('eslint');

const rule = require('./no-unguarded-survey-access');

const ruleTester = new RuleTester({
  parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
});

ruleTester.run('no-unguarded-survey-access', rule, {
  valid: [
    // ─── Allowed files accessing surveyResponse ────────────────────────────
    {
      code: 'tx.surveyResponse.findMany({ where: { survey_id } })',
      filename: '/path/to/survey.service.ts',
    },
    {
      code: 'tx.surveyResponse.create({ data })',
      filename: '/path/to/survey-results.service.ts',
    },
    {
      code: 'this.prisma.surveyResponse.findUnique({ where: { id } })',
      filename: '/path/to/moderation-scan.processor.ts',
    },
    // ─── Allowed files accessing surveyParticipationToken ──────────────────
    {
      code: 'tx.surveyParticipationToken.findUnique({ where: { survey_id_token_hash } })',
      filename: '/path/to/survey.service.ts',
    },
    {
      code: 'db.surveyParticipationToken.count({ where: { survey_id } })',
      filename: '/path/to/survey-results.service.ts',
    },
    {
      code: 'tx.surveyParticipationToken.deleteMany({ where: { survey_id } })',
      filename: '/path/to/cleanup-participation-tokens.processor.ts',
    },
    // ─── Spec/test files are exempt ────────────────────────────────────────
    {
      code: 'this.prisma.surveyResponse.findMany()',
      filename: '/path/to/survey.spec.ts',
    },
    {
      code: 'prisma.surveyParticipationToken.count()',
      filename: '/path/to/some.test.ts',
    },
    // ─── Unrelated model access is fine ────────────────────────────────────
    {
      code: 'this.prisma.student.findMany()',
      filename: '/path/to/students.service.ts',
    },
  ],
  invalid: [
    // ─── Unauthorized file accessing surveyResponse ────────────────────────
    {
      code: 'this.prisma.surveyResponse.findMany()',
      filename: '/path/to/students.service.ts',
      errors: [{ messageId: 'unauthorizedAccess' }],
    },
    // ─── Unauthorized file accessing surveyParticipationToken ──────────────
    {
      code: 'tx.surveyParticipationToken.count()',
      filename: '/path/to/analytics.service.ts',
      errors: [{ messageId: 'unauthorizedAccess' }],
    },
    // ─── Even wellbeing files not in allowlist are blocked ─────────────────
    {
      code: 'this.prisma.surveyResponse.findMany()',
      filename: '/path/to/wellbeing-dashboard.service.ts',
      errors: [{ messageId: 'unauthorizedAccess' }],
    },
  ],
});
