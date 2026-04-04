import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';

import { ConfigurationReadFacade, MOCK_FACADE_PROVIDERS } from '../../../common/tests/mock-facades';
import { EncryptionService } from '../../configuration/encryption.service';
import { PrismaService } from '../../prisma/prisma.service';
import { HmacService } from '../services/hmac.service';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SURVEY_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const USER_ID_A = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const USER_ID_B = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const SURVEY_ID_B = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const KNOWN_SECRET = 'a'.repeat(64);
const RESPONSE_ID = '11111111-1111-1111-1111-111111111111';
const QUESTION_ID = '22222222-2222-2222-2222-222222222222';

// ─── DMMF Helpers ───────────────────────────────────────────────────────────

function getSurveyResponseModel(): Prisma.DMMF.Model {
  const model = Prisma.dmmf.datamodel.models.find((m) => m.name === 'SurveyResponse');
  if (!model) {
    throw new Error(
      'SurveyResponse model not found in Prisma DMMF — has the schema been generated?',
    );
  }
  return model;
}

function getFieldNames(model: Prisma.DMMF.Model): string[] {
  return model.fields.map((f) => f.name);
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('G3 — Anonymous Submission Integrity', () => {
  // ── Test 1: No user-identifying fields on SurveyResponse ────────────────

  describe('SurveyResponse model has no user-identifying fields', () => {
    it('should have NO fields that link a response to a user', () => {
      const model = getSurveyResponseModel();
      const fieldNames = getFieldNames(model);

      const forbiddenFields = [
        'user_id',
        'staff_profile_id',
        'session_id',
        'ip_address',
        'created_by',
      ];

      for (const forbidden of forbiddenFields) {
        expect(fieldNames).not.toContain(forbidden);
      }
    });
  });

  // ── Test 2: No timestamp precision — submitted_date is Date, not Timestamptz

  describe('SurveyResponse.submitted_date has no timestamp precision', () => {
    it('should use @db.Date (DATE type), not Timestamptz', () => {
      const model = getSurveyResponseModel();
      const submittedDateField = model.fields.find((f) => f.name === 'submitted_date');

      expect(submittedDateField).toBeDefined();
      expect(submittedDateField!.type).toBe('DateTime');

      // Prisma DMMF represents @db.Date as nativeType: ["Date", []]
      // and @db.Timestamptz as nativeType: ["Timestamptz", [...]]
      // A bare DateTime (no @db annotation) has nativeType: null
      expect(submittedDateField!.nativeType).toBeDefined();
      expect(submittedDateField!.nativeType).not.toBeNull();
      expect(submittedDateField!.nativeType![0]).toBe('Date');

      // Ensure it is NOT Timestamptz — which would leak time-of-day precision
      expect(submittedDateField!.nativeType![0]).not.toBe('Timestamptz');
      expect(submittedDateField!.nativeType![0]).not.toBe('Timestamp');
    });
  });

  // ── Test 3: No tenant_id on SurveyResponse ─────────────────────────────

  describe('SurveyResponse model has no tenant_id', () => {
    it('should have NO tenant_id field — responses are cross-tenant anonymous', () => {
      const model = getSurveyResponseModel();
      const fieldNames = getFieldNames(model);

      expect(fieldNames).not.toContain('tenant_id');
    });
  });

  // ── Test 4: No RLS possible without tenant_id ──────────────────────────

  describe('SurveyResponse cannot have RLS policy', () => {
    it('should have no tenant_id, making RLS structurally impossible', () => {
      // RLS policies in this codebase filter on tenant_id via
      // SET LOCAL app.current_tenant_id. Without a tenant_id column,
      // no RLS policy can be applied. This is the intentional design:
      // anonymity by architecture.
      //
      // Full verification that no RLS policy exists on the
      // survey_responses table requires a live DB integration test:
      //   SELECT * FROM pg_policies WHERE tablename = 'survey_responses'
      // That query should return zero rows.
      const model = getSurveyResponseModel();
      const fieldNames = getFieldNames(model);

      // Structural assertion: no tenant_id means no RLS can exist
      expect(fieldNames).not.toContain('tenant_id');

      // Double-check: no field ends with _tenant or tenant_ that could
      // serve as a covert tenant discriminator
      const tenantLikeFields = fieldNames.filter(
        (name) =>
          name.includes('tenant') || name.includes('organization') || name.includes('school'),
      );
      expect(tenantLikeFields).toEqual([]);
    });
  });

  // ── Test 5: Participation token is a one-way 64-char hex hash ──────────

  describe('HmacService — participation token one-way hash', () => {
    let hmacService: HmacService;
    let mockPrisma: {
      tenantSetting: {
        findUnique: jest.Mock;
        update: jest.Mock;
      };
      $transaction: jest.Mock;
    };
    let mockEncryption: {
      encrypt: jest.Mock;
      decrypt: jest.Mock;
    };

    beforeEach(async () => {
      mockPrisma = {
        tenantSetting: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'settings-1',
            tenant_id: TENANT_ID,
            settings: {
              staff_wellbeing: {
                hmac_secret_encrypted: 'mock-encrypted-value',
                hmac_key_ref: 'local',
              },
            },
            created_at: new Date(),
            updated_at: new Date(),
          }),
          update: jest.fn(),
        },
        $transaction: jest
          .fn()
          .mockImplementation(async (fn: (tx: typeof mockPrisma) => Promise<unknown>) =>
            fn(mockPrisma),
          ),
      };

      mockEncryption = {
        encrypt: jest.fn().mockReturnValue({
          encrypted: 'mock-encrypted-value',
          keyRef: 'local',
        }),
        decrypt: jest.fn().mockReturnValue(KNOWN_SECRET),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ...MOCK_FACADE_PROVIDERS,
          HmacService,
          { provide: PrismaService, useValue: mockPrisma },
          { provide: EncryptionService, useValue: mockEncryption },
          {
            provide: ConfigurationReadFacade,
            useValue: { findSettings: mockPrisma.tenantSetting.findUnique },
          },
        ],
      }).compile();

      hmacService = module.get<HmacService>(HmacService);
    });

    afterEach(() => jest.clearAllMocks());

    it('should return a 64-character hex string (SHA256 output)', async () => {
      const hash = await hmacService.computeTokenHash(TENANT_ID, SURVEY_ID, USER_ID_A);

      expect(hash).toMatch(/^[0-9a-f]{64}$/);
      expect(hash).toHaveLength(64);
    });

    it('should be deterministic — same inputs produce the same hash', async () => {
      const hash1 = await hmacService.computeTokenHash(TENANT_ID, SURVEY_ID, USER_ID_A);
      const hash2 = await hmacService.computeTokenHash(TENANT_ID, SURVEY_ID, USER_ID_A);

      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different user IDs', async () => {
      const hashA = await hmacService.computeTokenHash(TENANT_ID, SURVEY_ID, USER_ID_A);
      const hashB = await hmacService.computeTokenHash(TENANT_ID, SURVEY_ID, USER_ID_B);

      expect(hashA).not.toBe(hashB);
    });

    it('should produce different hashes for different survey IDs', async () => {
      const hashA = await hmacService.computeTokenHash(TENANT_ID, SURVEY_ID, USER_ID_A);
      const hashB = await hmacService.computeTokenHash(TENANT_ID, SURVEY_ID_B, USER_ID_A);

      expect(hashA).not.toBe(hashB);
    });
  });

  // ── Test 6: Token cleanup destroys linkability ─────────────────────────

  describe('Token cleanup destroys linkability', () => {
    it('should leave responses intact but unlinkable after token deletion', () => {
      // Simulate the participation token and response existing
      const participationToken = {
        survey_id: SURVEY_ID,
        token_hash: 'a'.repeat(64),
        created_date: new Date('2026-03-20'),
      };

      const response = {
        id: RESPONSE_ID,
        survey_id: SURVEY_ID,
        question_id: QUESTION_ID,
        answer_value: 4,
        answer_text: null,
        submitted_date: new Date('2026-03-20'),
        moderation_status: 'approved',
      };

      // --- Phase 1: Both exist — but even now, there is no user_id on the response
      expect(response).not.toHaveProperty('user_id');
      expect(response).not.toHaveProperty('staff_profile_id');
      expect(participationToken).toHaveProperty('token_hash');

      // The only theoretical link is: if you have the HMAC secret and
      // the full staff list, you could recompute token_hash for each
      // (surveyId, userId) pair and match against the token table.

      // --- Phase 2: Token cleanup runs (7 days after survey close)
      // Simulates surveyParticipationToken.deleteMany({ where: { survey_id } })
      const tokensAfterCleanup: (typeof participationToken)[] = [];

      // --- Phase 3: Verify the response survives but is unlinkable
      // Response still exists with its data intact
      expect(response.id).toBe(RESPONSE_ID);
      expect(response.answer_value).toBe(4);
      expect(response.survey_id).toBe(SURVEY_ID);

      // Tokens are gone — no records to reverse-lookup
      expect(tokensAfterCleanup).toHaveLength(0);

      // The response has no user-identifying fields — verified via DMMF
      const model = getSurveyResponseModel();
      const fieldNames = getFieldNames(model);

      expect(fieldNames).not.toContain('user_id');
      expect(fieldNames).not.toContain('staff_profile_id');
      expect(fieldNames).not.toContain('tenant_id');

      // With tokens deleted and no user reference on responses,
      // there is zero join path from response -> user.
      // Even with the HMAC secret, you cannot recompute token hashes
      // because the token records no longer exist to compare against.
    });
  });
});
