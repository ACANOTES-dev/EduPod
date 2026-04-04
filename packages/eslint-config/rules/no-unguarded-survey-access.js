/**
 * @fileoverview Enforces that surveyResponse and surveyParticipationToken
 * Prisma models are only accessed from an explicit allowlist of files.
 *
 * These models have no tenant_id column — anonymity is enforced by
 * architectural design. Any new access site must be reviewed for:
 * - Tenant isolation (must join through staff_surveys.tenant_id)
 * - Anonymity preservation (must not link response to respondent)
 * - PII handling (freeform responses may contain PII)
 *
 * See docs/architecture/danger-zones.md DZ-27 for the full threat model.
 */
'use strict';

const path = require('path');

// ─── Allowlists ───────────────────────────────────────────────────────────────
// These lists should change extremely rarely. Any addition requires security
// review confirming: tenant isolation via staff_surveys join, no user↔response
// linkage, and no broad queries (findMany without survey_id scope).

const SURVEY_RESPONSE_ALLOWLIST = [
  'survey.service.ts',
  'survey-results.service.ts',
  'moderation-scan.processor.ts',
];

const SURVEY_TOKEN_ALLOWLIST = [
  'survey.service.ts',
  'survey-results.service.ts',
  'cleanup-participation-tokens.processor.ts',
];

const GUARDED_MODELS = {
  surveyResponse: SURVEY_RESPONSE_ALLOWLIST,
  surveyParticipationToken: SURVEY_TOKEN_ALLOWLIST,
};

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Restrict surveyResponse and surveyParticipationToken access to an explicit allowlist',
      category: 'Security',
    },
    messages: {
      unauthorizedAccess:
        "Access to '{{model}}' is restricted to an allowlist of approved files. " +
        'This model has no tenant_id — anonymity is enforced by design. ' +
        'See docs/architecture/danger-zones.md DZ-27. ' +
        'Allowed files: {{allowlist}}',
    },
    schema: [],
  },
  create(context) {
    const filename = context.getFilename();
    const basename = path.basename(filename);

    // Skip test/spec files — the isolation spec itself references the models
    if (basename.endsWith('.spec.ts') || basename.endsWith('.test.ts')) {
      return {};
    }

    return {
      MemberExpression(node) {
        if (node.property && node.property.type === 'Identifier') {
          const modelName = node.property.name;

          if (
            Object.prototype.hasOwnProperty.call(GUARDED_MODELS, modelName) &&
            !GUARDED_MODELS[modelName].includes(basename)
          ) {
            const allowlist = GUARDED_MODELS[modelName];
            context.report({
              node: node.property,
              messageId: 'unauthorizedAccess',
              data: {
                model: modelName,
                allowlist: allowlist.join(', '),
              },
            });
          }
        }
      },
    };
  },
};
