/**
 * Security headers integration test.
 *
 * Boots a minimal Express app with the same Helmet + Permissions-Policy
 * configuration used in main.ts and asserts that every required security
 * header is present with the correct value.
 *
 * This test does NOT import main.ts (it has env-validation side effects).
 * Instead it duplicates the header configuration inline — if main.ts changes,
 * this test should be updated to match.
 */
import type { NextFunction, Request, Response } from 'express';
import express from 'express';
import helmet from 'helmet';
import request from 'supertest';

// ─── Build a minimal app with security headers ────────────────────────────────

function buildSecureApp(): express.Application {
  const app = express();

  // ── Helmet (matches apps/api/src/main.ts exactly) ─────────────────────────
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'", 'https://*.sentry.io', 'https://*.stripe.com'],
          frameSrc: ["'self'", 'https://*.stripe.com'],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
    }),
  );

  // ── Permissions-Policy (matches apps/api/src/main.ts exactly) ─────────────
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(self)');
    next();
  });

  app.get('/probe', (_req, res) => {
    res.json({ ok: true });
  });

  return app;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Security Headers Configuration', () => {
  const app = buildSecureApp();

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should set Content-Security-Policy with default-src restricted to self', async () => {
    const res = await request(app).get('/probe');

    const csp = res.headers['content-security-policy'];
    expect(csp).toBeDefined();
    expect(csp).toContain("default-src 'self'");
  });

  it('should set Content-Security-Policy with object-src none', async () => {
    const res = await request(app).get('/probe');

    const csp = res.headers['content-security-policy'];
    expect(csp).toContain("object-src 'none'");
  });

  it('should set Content-Security-Policy with frame-ancestors none', async () => {
    const res = await request(app).get('/probe');

    const csp = res.headers['content-security-policy'];
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it('should set X-Content-Type-Options to nosniff', async () => {
    const res = await request(app).get('/probe');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('should set X-Frame-Options header', async () => {
    const res = await request(app).get('/probe');

    // Helmet sets SAMEORIGIN by default; frame-ancestors: 'none' in CSP
    // further restricts embedding. Both should be present.
    expect(res.headers['x-frame-options']).toBeDefined();
  });

  it('should set Strict-Transport-Security (HSTS) header', async () => {
    const res = await request(app).get('/probe');

    const hsts = res.headers['strict-transport-security'];
    expect(hsts).toBeDefined();
    // Helmet default: max-age=15552000 (180 days)
    expect(hsts).toMatch(/max-age=\d+/);
  });

  it('should set Permissions-Policy disabling camera, microphone, and geolocation', async () => {
    const res = await request(app).get('/probe');

    const policy = res.headers['permissions-policy'];
    expect(policy).toBeDefined();
    expect(policy).toContain('camera=()');
    expect(policy).toContain('microphone=()');
    expect(policy).toContain('geolocation=()');
  });

  it('should set Permissions-Policy allowing payment only for same origin', async () => {
    const res = await request(app).get('/probe');

    expect(res.headers['permissions-policy']).toContain('payment=(self)');
  });
});
