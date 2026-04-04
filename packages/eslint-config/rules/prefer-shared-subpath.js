// ─── Prefer @school/shared subpath imports over root barrel ──────────────────
//
// Warns when a file under apps/api/src/modules/ (or apps/worker/src/) imports
// from '@school/shared' (the root barrel) instead of a domain-specific subpath
// like '@school/shared/behaviour'.
//
// Advisory only — severity is 'warn'. Existing root-barrel imports are
// grandfathered; this rule discourages adding new ones.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Directories where the rule is enforced.
 * The rule triggers for any file whose path contains one of these segments.
 */
const ENFORCED_PATH_SEGMENTS = ['/modules/', '/processors/'];

/**
 * Known domain subpaths and the identifier keywords that belong to them.
 * The matching is case-insensitive substring: if an imported name contains
 * any keyword, the rule suggests the corresponding subpath.
 *
 * Only domain subpaths are listed — shared-kernel imports (auth, pagination,
 * tenant, api-response, etc.) are intentionally excluded because those belong
 * in the root barrel.
 */
const SUBPATH_KEYWORDS = [
  {
    subpath: 'behaviour',
    keywords: [
      'behaviour',
      'incident',
      'sanction',
      'exclusion',
      'appeal',
      'safeguarding',
      'behavioursettings',
      'behaviorsettings',
      'schoolcalendar',
      'dataclassification',
    ],
  },
  {
    subpath: 'pastoral',
    keywords: [
      'pastoral',
      'concern',
      'checkin',
      'intervention',
      'helpline',
      'casestatus',
      'casestate',
    ],
  },
  {
    subpath: 'sen',
    keywords: [
      'sencategory',
      'sensupport',
      'sengoal',
      'senreferral',
      'senprofile',
      'senreport',
      'supportplan',
      'snaassignment',
      'accommodation',
      'professionalinvolvement',
      'transitionnote',
      'resourceallocation',
    ],
  },
  {
    subpath: 'staff-wellbeing',
    keywords: ['staffwellbeing', 'wellbeing'],
  },
  {
    subpath: 'gdpr',
    keywords: ['gdpr', 'consent', 'retention', 'dataminimisation', 'aiaudit'],
  },
  {
    subpath: 'security',
    keywords: ['securityincident'],
  },
  {
    subpath: 'regulatory',
    keywords: ['regulatory'],
  },
  {
    subpath: 'early-warning',
    keywords: ['earlywarning'],
  },
  {
    subpath: 'engagement',
    keywords: ['engagement', 'conference', 'trippack'],
  },
  {
    subpath: 'scheduler',
    keywords: ['solvev2', 'solveroptions', 'schedulev2', 'constraintsv2', 'validateschedule'],
  },
  {
    subpath: 'ai',
    keywords: ['anonymise', 'deanonymise', 'aibehaviour'],
  },
];

/**
 * Given an imported identifier name, return the suggested subpath or null.
 */
function suggestSubpath(name) {
  const lower = name.toLowerCase();
  for (const entry of SUBPATH_KEYWORDS) {
    for (const kw of entry.keywords) {
      if (lower.includes(kw)) {
        return entry.subpath;
      }
    }
  }
  return null;
}

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Prefer @school/shared/{subpath} imports over the root barrel @school/shared when a domain subpath exists.',
    },
    messages: {
      preferSubpath:
        "Import '{{ name }}' is available from '@school/shared/{{ subpath }}'. " +
        'Prefer subpath imports to reduce barrel coupling.',
    },
    schema: [],
  },
  create(context) {
    const filename = context.getFilename().replace(/\\/g, '/');

    // Only enforce in module/processor directories
    const inScope = ENFORCED_PATH_SEGMENTS.some((seg) => filename.includes(seg));
    if (!inScope) return {};

    // Spec files are exempt — tests may legitimately re-export everything
    if (filename.endsWith('.spec.ts') || filename.endsWith('.test.ts')) return {};

    return {
      ImportDeclaration(node) {
        const source = node.source.value;
        if (source !== '@school/shared') return;

        // Check each imported specifier
        for (const specifier of node.specifiers) {
          if (specifier.type !== 'ImportSpecifier') continue;

          const importedName =
            specifier.imported.type === 'Identifier'
              ? specifier.imported.name
              : specifier.imported.value;

          const subpath = suggestSubpath(importedName);
          if (subpath) {
            context.report({
              node: specifier,
              messageId: 'preferSubpath',
              data: { name: importedName, subpath },
            });
          }
        }
      },
    };
  },
};
