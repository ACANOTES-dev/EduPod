import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { TokenService } from './auth-token.service';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TENANT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const MEMBERSHIP_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const SESSION_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

const JWT_SECRET = 'test-jwt-secret-that-is-at-least-32-chars-long!!';
const JWT_REFRESH_SECRET = 'test-refresh-secret-that-is-at-least-32-chars!!';

describe('TokenService', () => {
  let service: TokenService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'JWT_SECRET') return JWT_SECRET;
              if (key === 'JWT_REFRESH_SECRET') return JWT_REFRESH_SECRET;
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<TokenService>(TokenService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── signAccessToken ──────────────────────────────────────────────────────

  describe('TokenService -- signAccessToken', () => {
    it('should sign a valid JWT access token with 3 parts', () => {
      const token = service.signAccessToken({
        sub: USER_ID,
        email: 'test@school.com',
        tenant_id: TENANT_ID,
        membership_id: MEMBERSHIP_ID,
      });
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    it('should include type=access in the payload', () => {
      const token = service.signAccessToken({
        sub: USER_ID,
        email: 'test@school.com',
        tenant_id: null,
        membership_id: null,
      });
      const payload = service.verifyAccessToken(token);
      expect(payload.type).toBe('access');
    });

    it('should throw Error when JWT_SECRET is not configured', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          TokenService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn().mockReturnValue(undefined),
            },
          },
        ],
      }).compile();

      const svcNoSecret = module.get<TokenService>(TokenService);

      expect(() =>
        svcNoSecret.signAccessToken({
          sub: USER_ID,
          email: 'test@school.com',
          tenant_id: null,
          membership_id: null,
        }),
      ).toThrow('JWT_SECRET not configured');
    });
  });

  // ─── verifyAccessToken ────────────────────────────────────────────────────

  describe('TokenService -- verifyAccessToken', () => {
    it('should verify a valid access token and return correct fields', () => {
      const token = service.signAccessToken({
        sub: USER_ID,
        email: 'test@school.com',
        tenant_id: TENANT_ID,
        membership_id: MEMBERSHIP_ID,
      });

      const payload = service.verifyAccessToken(token);
      expect(payload.sub).toBe(USER_ID);
      expect(payload.email).toBe('test@school.com');
      expect(payload.tenant_id).toBe(TENANT_ID);
      expect(payload.membership_id).toBe(MEMBERSHIP_ID);
      expect(payload.type).toBe('access');
      expect(typeof payload.iat).toBe('number');
      expect(typeof payload.exp).toBe('number');
    });

    it('should reject an expired JWT token', async () => {
      const jwt = await import('jsonwebtoken');
      const expiredToken = jwt.sign(
        { sub: USER_ID, email: 'test@school.com', type: 'access' },
        JWT_SECRET,
        { expiresIn: '0s' },
      );

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(() => service.verifyAccessToken(expiredToken)).toThrow();
    });

    it('should reject a token signed with a different secret', async () => {
      const jwt = await import('jsonwebtoken');
      const badToken = jwt.sign(
        { sub: USER_ID, email: 'test@school.com', type: 'access' },
        'wrong-secret-key-that-does-not-match',
        { expiresIn: '15m' },
      );

      expect(() => service.verifyAccessToken(badToken)).toThrow();
    });

    it('should throw Error when JWT_SECRET is not configured for verification', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          TokenService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn().mockReturnValue(undefined),
            },
          },
        ],
      }).compile();

      const svcNoSecret = module.get<TokenService>(TokenService);

      expect(() => svcNoSecret.verifyAccessToken('any-token')).toThrow('JWT_SECRET not configured');
    });
  });

  // ─── signRefreshToken / verifyRefreshToken ────────────────────────────────

  describe('TokenService -- signRefreshToken', () => {
    it('should sign a valid refresh token with type=refresh', () => {
      const token = service.signRefreshToken({
        sub: USER_ID,
        session_id: SESSION_ID,
      });

      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    it('should throw Error when JWT_REFRESH_SECRET is not configured', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          TokenService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn().mockReturnValue(undefined),
            },
          },
        ],
      }).compile();

      const svcNoSecret = module.get<TokenService>(TokenService);

      expect(() =>
        svcNoSecret.signRefreshToken({
          sub: USER_ID,
          session_id: SESSION_ID,
        }),
      ).toThrow('JWT_REFRESH_SECRET not configured');
    });
  });

  describe('TokenService -- verifyRefreshToken', () => {
    it('should verify a valid refresh token and return correct fields', () => {
      const token = service.signRefreshToken({
        sub: USER_ID,
        session_id: SESSION_ID,
      });

      const payload = service.verifyRefreshToken(token);
      expect(payload.sub).toBe(USER_ID);
      expect(payload.session_id).toBe(SESSION_ID);
      expect(payload.type).toBe('refresh');
    });

    it('should reject a refresh token signed with the access secret', async () => {
      const jwt = await import('jsonwebtoken');
      const badToken = jwt.sign(
        { sub: USER_ID, session_id: SESSION_ID, type: 'refresh' },
        JWT_SECRET, // access secret, not refresh secret
        { expiresIn: '7d' },
      );

      expect(() => service.verifyRefreshToken(badToken)).toThrow();
    });

    it('should throw Error when JWT_REFRESH_SECRET is not configured for verification', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          TokenService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn().mockReturnValue(undefined),
            },
          },
        ],
      }).compile();

      const svcNoSecret = module.get<TokenService>(TokenService);

      expect(() => svcNoSecret.verifyRefreshToken('any-token')).toThrow(
        'JWT_REFRESH_SECRET not configured',
      );
    });
  });
});
