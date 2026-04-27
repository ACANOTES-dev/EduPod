import { createHmac, timingSafeEqual } from 'crypto';

import { Injectable, Logger } from '@nestjs/common';

const REPLAY_WINDOW_SECONDS = 300; // 5 minutes — Svix's default tolerance

/**
 * Channel-agnostic webhook signature verification.
 *
 * Both `verifyResend` (Svix HMAC-SHA256) and `verifyTwilio` (HMAC-SHA1)
 * share three rules:
 *   1. Missing inputs → return false. Never throw on missing inputs.
 *      A forged or malformed request must be silently rejected, not crash
 *      the controller.
 *   2. Timestamps older than 5 minutes → return false. Replay protection.
 *      Twilio does not include a timestamp by default; we add `ts=` to the
 *      request URL when registering callbacks (Impl 13 sets that up).
 *   3. Final comparison is `timingSafeEqual`. Never `===`. Never
 *      `Buffer.compare`. Constant-time only.
 */
@Injectable()
export class WebhookSignatureVerifierService {
  private readonly logger = new Logger(WebhookSignatureVerifierService.name);

  // ─── Resend (Svix-Signature) ────────────────────────────────────────────
  verifyResend(
    rawBody: Buffer,
    headers: Record<string, string | undefined>,
    secret: string,
  ): boolean {
    const svixId = headers['svix-id'];
    const svixTs = headers['svix-timestamp'];
    const svixSig = headers['svix-signature'];

    if (!svixId || !svixTs || !svixSig || !secret || !rawBody) return false;

    const ts = Number.parseInt(svixTs, 10);
    if (!Number.isFinite(ts)) return false;
    const driftSeconds = Math.abs(Date.now() / 1000 - ts);
    if (driftSeconds > REPLAY_WINDOW_SECONDS) {
      this.logger.warn(`Resend webhook timestamp drift ${driftSeconds}s — rejecting`);
      return false;
    }

    const secretBytes = Buffer.from(
      secret.startsWith('whsec_') ? secret.slice(6) : secret,
      'base64',
    );
    if (secretBytes.length === 0) return false;

    const payload = `${svixId}.${svixTs}.${rawBody.toString('utf8')}`;
    const expected = createHmac('sha256', secretBytes).update(payload).digest('base64');

    // Svix may send multiple signatures (key rotation); any one valid wins.
    const signatures = svixSig.split(' ').map((s) => s.replace(/^v1,/, ''));
    return signatures.some((sig) => safeEquals(sig, expected));
  }

  // ─── Twilio (X-Twilio-Signature) ────────────────────────────────────────
  verifyTwilio(
    url: string,
    params: Record<string, string>,
    signature: string,
    authToken: string,
  ): boolean {
    if (!url || !signature || !authToken || !params) return false;

    // Replay protection — only enforced when `ts` is in the query string.
    const tsMatch = url.match(/[?&]ts=(\d+)(?:&|$)/);
    if (tsMatch) {
      const tsRaw = tsMatch[1];
      if (tsRaw === undefined) return false;
      const ts = Number.parseInt(tsRaw, 10);
      if (!Number.isFinite(ts)) return false;
      const driftSeconds = Math.abs(Date.now() / 1000 - ts);
      if (driftSeconds > REPLAY_WINDOW_SECONDS) {
        this.logger.warn(`Twilio webhook timestamp drift ${driftSeconds}s — rejecting`);
        return false;
      }
    }

    const sortedKeys = Object.keys(params).sort();
    const dataStr = url + sortedKeys.map((k) => k + (params[k] ?? '')).join('');
    const expected = createHmac('sha1', authToken).update(dataStr).digest('base64');

    return safeEquals(signature, expected);
  }
}

/**
 * Constant-time string comparison via `timingSafeEqual`. Returns false on
 * any input that fails to convert to equal-length buffers.
 */
export function safeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  try {
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}
