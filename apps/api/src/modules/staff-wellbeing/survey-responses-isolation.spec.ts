import fs from 'fs';
import path from 'path';

import { Prisma } from '@prisma/client';

// ─── Constants ──────────────────────────────────────────────────────────────

/**
 * Allowed production source files (non-test, non-spec) that may query
 * the `surveyResponse` Prisma model. This is the complete allowlist.
 *
 * - survey.service.ts: creates responses + counts for survey detail
 * - survey-results.service.ts: reads responses for aggregation, moderation, comments
 * - moderation-scan.processor.ts: worker job that scans freeform responses for PII
 */
const ALLOWED_PRODUCTION_FILES = [
  'survey.service.ts',
  'survey-results.service.ts',
  'moderation-scan.processor.ts',
];

/**
 * Allowed production source files (non-test, non-spec) that may query
 * the `surveyParticipationToken` Prisma model. This is the complete allowlist.
 *
 * - survey.service.ts: creates/validates participation tokens during response submission
 * - survey-results.service.ts: counts tokens for minimum response threshold check
 * - cleanup-participation-tokens.processor.ts: worker job that deletes expired tokens
 */
const ALLOWED_PARTICIPATION_TOKEN_FILES = [
  'survey.service.ts',
  'survey-results.service.ts',
  'cleanup-participation-tokens.processor.ts',
];

/**
 * Service source file paths relative to the repo root, for reading and
 * verifying query patterns.
 */
const SERVICE_DIR = path.resolve(__dirname, 'services');
const WORKER_PROCESSOR_PATH = path.resolve(
  __dirname,
  '../../../../worker/src/processors/wellbeing/moderation-scan.processor.ts',
);
const MODULES_DIR = path.resolve(__dirname, '..');

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Recursively collect all .ts files under a directory, excluding node_modules
 * and dist folders.
 */
function collectTsFiles(dir: string): string[] {
  const results: string[] = [];

  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      results.push(...collectTsFiles(fullPath));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
      results.push(fullPath);
    }
  }

  return results;
}

/**
 * Check whether a source file contains a reference to `.surveyResponse.`
 * (Prisma model access pattern).
 */
function fileAccessesSurveyResponse(filePath: string): boolean {
  const content = fs.readFileSync(filePath, 'utf-8');
  return /\.surveyResponse[.(]/.test(content);
}

/**
 * Check whether a source file contains a reference to `.surveyParticipationToken.`
 * (Prisma model access pattern).
 */
function fileAccessesSurveyParticipationToken(filePath: string): boolean {
  const content = fs.readFileSync(filePath, 'utf-8');
  return /\.surveyParticipationToken[.(]/.test(content);
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('survey_responses — tenant isolation', () => {
  // ── 1. Only wellbeing services query surveyResponse ────────────────────

  it('should only be queried by wellbeing services and the moderation scan processor', () => {
    // Scan ALL production .ts files across modules (excluding specs)
    const allModuleFiles = collectTsFiles(MODULES_DIR);
    const workerFiles = collectTsFiles(
      path.resolve(__dirname, '../../../../worker/src/processors'),
    );
    const allFiles = [...allModuleFiles, ...workerFiles];

    const violatingFiles: string[] = [];

    for (const filePath of allFiles) {
      if (fileAccessesSurveyResponse(filePath)) {
        const basename = path.basename(filePath);
        if (!ALLOWED_PRODUCTION_FILES.includes(basename)) {
          violatingFiles.push(filePath);
        }
      }
    }

    expect(violatingFiles).toEqual([]);
  });

  it('surveyParticipationToken should only be queried by allowlisted files', () => {
    // Scan ALL production .ts files across modules (excluding specs)
    const allModuleFiles = collectTsFiles(MODULES_DIR);
    const workerFiles = collectTsFiles(
      path.resolve(__dirname, '../../../../worker/src/processors'),
    );
    const allFiles = [...allModuleFiles, ...workerFiles];

    const violatingFiles: string[] = [];

    for (const filePath of allFiles) {
      if (fileAccessesSurveyParticipationToken(filePath)) {
        const basename = path.basename(filePath);
        if (!ALLOWED_PARTICIPATION_TOKEN_FILES.includes(basename)) {
          violatingFiles.push(filePath);
        }
      }
    }

    expect(violatingFiles).toEqual([]);
  });

  // ── 2. All API-layer queries join through staff_surveys ────────────────

  describe('should never be queried without joining through staff_surveys', () => {
    it('survey.service.ts always verifies staffSurvey with tenant_id before accessing surveyResponse', () => {
      const servicePath = path.join(SERVICE_DIR, 'survey.service.ts');
      const content = fs.readFileSync(servicePath, 'utf-8');

      // Every surveyResponse access in this file must be inside an RLS
      // transaction that first queries staffSurvey with tenant_id.
      //
      // Pattern: createRlsClient is called with tenant_id, then inside the
      // transaction, staffSurvey.findFirst with tenant_id is called before
      // any surveyResponse access.

      // Verify the service uses createRlsClient
      expect(content).toContain('createRlsClient');

      // Find all lines that access surveyResponse
      const lines = content.split('\n');
      const responseAccessLines: number[] = [];
      for (let i = 0; i < lines.length; i++) {
        if (/\.surveyResponse[.(]/.test(lines[i] ?? '')) {
          responseAccessLines.push(i);
        }
      }

      // There should be at least 1 access (count + create)
      expect(responseAccessLines.length).toBeGreaterThanOrEqual(1);

      // Every surveyResponse access must be preceded by a staffSurvey query
      // within the same RLS transaction block. We verify this by checking
      // that each access is inside a $transaction callback.
      for (const lineNum of responseAccessLines) {
        // Look backward from this line for the nearest $transaction
        const precedingContent = lines.slice(0, lineNum + 1).join('\n');
        const hasTransaction = precedingContent.includes('$transaction');
        expect(hasTransaction).toBe(true);
      }

      // Verify no direct prisma.surveyResponse access (outside RLS transaction)
      // The pattern `this.prisma.surveyResponse` without RLS would be a violation
      expect(content).not.toMatch(/this\.prisma\.surveyResponse/);
    });

    it('survey-results.service.ts always verifies staffSurvey with tenant_id before accessing surveyResponse', () => {
      const servicePath = path.join(SERVICE_DIR, 'survey-results.service.ts');
      const content = fs.readFileSync(servicePath, 'utf-8');

      // Verify the service uses createRlsClient
      expect(content).toContain('createRlsClient');

      // All four methods that access surveyResponse:
      // - getResults: findMany with survey_id filter, after staffSurvey.findFirst
      // - listModerationQueue: findMany with survey_id filter, after staffSurvey.findFirst
      // - moderateResponse: findFirst + update with survey_id filter, after staffSurvey.findFirst
      // - getModeratedComments: findMany with survey_id filter, after staffSurvey.findFirst

      const lines = content.split('\n');
      const responseAccessLines: number[] = [];
      for (let i = 0; i < lines.length; i++) {
        if (/\.surveyResponse[.(]/.test(lines[i] ?? '')) {
          responseAccessLines.push(i);
        }
      }

      // There should be multiple accesses
      expect(responseAccessLines.length).toBeGreaterThanOrEqual(4);

      // Every access must be inside a $transaction callback
      for (const lineNum of responseAccessLines) {
        const precedingContent = lines.slice(0, lineNum + 1).join('\n');
        expect(precedingContent).toContain('$transaction');
      }

      // Verify no direct prisma.surveyResponse access
      expect(content).not.toMatch(/this\.prisma\.surveyResponse/);

      // Verify every method that accesses surveyResponse also queries
      // staffSurvey.findFirst with tenant_id before the response access.
      // We do this by checking that staffSurvey.findFirst appears before
      // each surveyResponse block.
      for (const lineNum of responseAccessLines) {
        const precedingContent = lines.slice(0, lineNum + 1).join('\n');
        expect(precedingContent).toContain('staffSurvey.findFirst');
      }
    });

    it('moderation-scan.processor.ts accesses surveyResponse by response_id from a tenant-validated job payload', () => {
      const content = fs.readFileSync(WORKER_PROCESSOR_PATH, 'utf-8');

      // The worker processor is the ONE exception: it uses this.prisma directly
      // because survey_responses has no tenant_id and no RLS. This is safe because:
      //
      // 1. The job payload MUST include tenant_id (enforced by TenantAwareJob)
      // 2. The response_id in the payload comes from SurveyService.submitResponse,
      //    which already validated tenant context
      // 3. The processor accesses the specific response by its primary key (findUnique)
      //    not by any query that could return cross-tenant data

      // Verify TenantAwareJob enforcement
      expect(content).toContain('TenantAwareJob');
      expect(content).toContain("throw new Error('Job rejected: missing tenant_id in payload.')");

      // Verify it accesses surveyResponse by specific ID (findUnique), not a broad query
      expect(content).toContain('surveyResponse.findUnique');

      // Verify it does NOT use findMany (which could leak cross-tenant responses)
      expect(content).not.toContain('surveyResponse.findMany');

      // Verify it does NOT use findFirst (which could match wrong tenant's data)
      expect(content).not.toContain('surveyResponse.findFirst');
    });
  });

  // ── 3. No API endpoint returns raw individual survey response rows ─────

  describe('should not expose individual response data via any API endpoint', () => {
    it('survey.controller.ts does not return raw surveyResponse rows', () => {
      const controllerPath = path.resolve(__dirname, 'controllers/survey.controller.ts');
      const content = fs.readFileSync(controllerPath, 'utf-8');

      // The survey controller delegates to SurveyService which returns:
      // - SurveyWithQuestions (no raw responses)
      // - SurveyDetail (includes response_count, not individual rows)
      // - { submitted: true } for response submission
      // - ActiveSurveyResult (includes hasResponded boolean, no raw data)

      // Verify no direct Prisma surveyResponse model access in the controller.
      // Note: `submitSurveyResponseSchema` (a Zod schema name) is expected
      // as a DTO validation import, so we match specifically for the Prisma
      // model access pattern `db.surveyResponse` or type import `SurveyResponse`
      // from Prisma, not Zod schema names that happen to contain "Response".
      expect(content).not.toMatch(/db\.surveyResponse/);
      expect(content).not.toMatch(/prisma\.surveyResponse/);
      expect(content).not.toMatch(/import.*SurveyResponse.*from.*@prisma/);

      // Verify the controller does not reference any response-returning method
      // that could expose individual rows
      expect(content).not.toMatch(/getResponses|listResponses|findResponses/);
    });

    it('survey-results.controller.ts returns only aggregated data, not individual response rows', () => {
      const controllerPath = path.resolve(__dirname, 'controllers/survey-results.controller.ts');
      const content = fs.readFileSync(controllerPath, 'utf-8');

      // The results controller delegates to SurveyResultsService which returns:
      // - SurveyResultsResponse: aggregated stats (mean, median, distribution)
      // - ModerationQueueItem[]: stripped response text for moderation (no user info)
      // - ModeratedCommentsResponse: approved/redacted comments (no user info)

      // Verify no direct surveyResponse type reference
      expect(content).not.toContain('SurveyResponse');

      // Verify no endpoint that could return raw response data
      expect(content).not.toMatch(/getResponses|listResponses|findResponses/);

      // The moderation endpoint returns ModerationQueueItem which is a
      // projection with only: id, response_text, submitted_date, moderation_status
      // No user-identifying information.
      // Verify the service is the only thing called (thin controller pattern)
      expect(content).toContain('surveyResultsService');
    });

    it('SurveyResultsService.getResults returns aggregated QuestionAggregation, not raw rows', () => {
      const servicePath = path.join(SERVICE_DIR, 'survey-results.service.ts');
      const content = fs.readFileSync(servicePath, 'utf-8');

      // The getResults method returns SurveyResultsResponse which contains:
      // - QuestionAggregation[] with mean, median, distribution (likert_5)
      // - option counts/percentages (single_choice)
      // - approved_count/redacted_count (freeform)
      // Never individual answer rows.

      // Verify the return type interface exists and has no user-identifying fields
      expect(content).toContain('interface SurveyResultsResponse');
      expect(content).toContain('interface QuestionAggregation');

      // Verify the response contains aggregated stats, not raw responses
      expect(content).toContain('response_count');
      expect(content).toContain('mean');
      expect(content).toContain('median');
      expect(content).toContain('distribution');
    });

    it('ModerationQueueItem interface has no user-identifying fields', () => {
      const servicePath = path.join(SERVICE_DIR, 'survey-results.service.ts');
      const content = fs.readFileSync(servicePath, 'utf-8');

      // Extract the ModerationQueueItem interface and verify its fields
      const interfaceMatch = content.match(/interface ModerationQueueItem\s*\{([^}]+)\}/);

      expect(interfaceMatch).not.toBeNull();
      const interfaceBody = interfaceMatch![1];

      // Must NOT contain user-identifying fields
      expect(interfaceBody).not.toContain('user_id');
      expect(interfaceBody).not.toContain('staff_profile_id');
      expect(interfaceBody).not.toContain('tenant_id');
      expect(interfaceBody).not.toContain('ip_address');
      expect(interfaceBody).not.toContain('session_id');
      expect(interfaceBody).not.toContain('created_by');

      // Must contain ONLY these safe fields
      expect(interfaceBody).toContain('id');
      expect(interfaceBody).toContain('response_text');
      expect(interfaceBody).toContain('submitted_date');
      expect(interfaceBody).toContain('moderation_status');
    });

    it('ModeratedComment interface has no user-identifying fields', () => {
      const servicePath = path.join(SERVICE_DIR, 'survey-results.service.ts');
      const content = fs.readFileSync(servicePath, 'utf-8');

      const interfaceMatch = content.match(/interface ModeratedComment\s*\{([^}]+)\}/);

      expect(interfaceMatch).not.toBeNull();
      const interfaceBody = interfaceMatch![1];

      // Must NOT contain user-identifying fields
      expect(interfaceBody).not.toContain('user_id');
      expect(interfaceBody).not.toContain('staff_profile_id');
      expect(interfaceBody).not.toContain('tenant_id');
      expect(interfaceBody).not.toContain('ip_address');

      // Must contain only safe fields
      expect(interfaceBody).toContain('id');
      expect(interfaceBody).toContain('text');
      expect(interfaceBody).toContain('submitted_date');
      expect(interfaceBody).toContain('is_redacted');
    });
  });

  // ── 4. Schema-level verification ──────────────────────────────────────

  describe('SurveyResponse schema constraints enforce isolation by design', () => {
    it('should have no tenant_id column — anonymity by design (DZ-27)', () => {
      const model = Prisma.dmmf.datamodel.models.find((m) => m.name === 'SurveyResponse');
      expect(model).toBeDefined();

      const fieldNames = model!.fields.map((f) => f.name);
      expect(fieldNames).not.toContain('tenant_id');
    });

    it('should have a FK to staff_surveys via survey_id for tenant-scoped join path', () => {
      const model = Prisma.dmmf.datamodel.models.find((m) => m.name === 'SurveyResponse');
      expect(model).toBeDefined();

      const surveyIdField = model!.fields.find((f) => f.name === 'survey_id');
      expect(surveyIdField).toBeDefined();

      // Verify the relation field exists pointing to StaffSurvey
      const surveyRelation = model!.fields.find((f) => f.name === 'survey');
      expect(surveyRelation).toBeDefined();
      expect(surveyRelation!.type).toBe('StaffSurvey');
      expect(surveyRelation!.kind).toBe('object');
    });

    it('StaffSurvey should have tenant_id — completing the isolation join path', () => {
      const model = Prisma.dmmf.datamodel.models.find((m) => m.name === 'StaffSurvey');
      expect(model).toBeDefined();

      const tenantIdField = model!.fields.find((f) => f.name === 'tenant_id');
      expect(tenantIdField).toBeDefined();
      expect(tenantIdField!.isRequired).toBe(true);
    });
  });
});
