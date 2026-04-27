/**
 * After backfill-tenant-communications-configs.ts has run, drive the verify
 * endpoints for each (tenant, channel) pair. Surfaces verbatim provider
 * errors so the developer can immediately see whether their dev credentials
 * are wired up correctly.
 *
 * Usage:
 *   pnpm tsx packages/prisma/scripts/verify-tenant-communications-configs.ts
 *
 * Pre-reqs:
 *   - API is running on http://localhost:3001 (override with API_BASE)
 *   - Backfill has run successfully (5 × 3 = 15 config rows present)
 *   - dev-tenant-credentials.json has a valid verification_recipients block
 *
 * The runner does NOT retry on failure — surfacing real provider errors is
 * the goal. If a stress tenant's keys are placeholder strings, the runner
 * correctly logs the verbatim provider rejection and that's the verification:
 * the encryption pipeline works, the network path works, and the provider
 * rejected as expected.
 *
 * Exit code 1 only when EVERY verification fails (symptomatic of a wiring or
 * environment issue). Per-tenant failures are logged but don't fail the run.
 */
/* eslint-disable no-console */
import * as fs from 'node:fs';
import * as path from 'node:path';

const TENANT_SLUGS = ['nhqs', 'stress-a', 'stress-b', 'stress-c', 'stress-d'] as const;
type TenantSlug = (typeof TENANT_SLUGS)[number];

const TENANT_PASSWORDS: Record<TenantSlug, string> = {
  nhqs: 'Password123!',
  'stress-a': 'StressTest2026!',
  'stress-b': 'StressTest2026!',
  'stress-c': 'StressTest2026!',
  'stress-d': 'StressTest2026!',
};

const SCRIPT_DIR = path.resolve(__dirname);
const DEFAULT_CONFIG_PATH = path.join(SCRIPT_DIR, 'dev-tenant-credentials.json');

export interface VerifyResult {
  tenant: TenantSlug;
  channel: 'email' | 'sms' | 'whatsapp';
  success: boolean;
  provider_message_id?: string;
  provider_error?: string;
  http_status?: number;
}

export interface VerifyDeps {
  fetch: typeof fetch;
  apiBase: string;
}

async function login(deps: VerifyDeps, slug: TenantSlug): Promise<string> {
  const email = `owner@${slug}.test`;
  const password = TENANT_PASSWORDS[slug];
  const resp = await deps.fetch(`${deps.apiBase}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!resp.ok) {
    throw new Error(`Login failed for ${email}: HTTP ${resp.status}`);
  }
  const json = (await resp.json()) as { access_token?: string; data?: { accessToken?: string } };
  const token = json.access_token ?? json.data?.accessToken;
  if (!token) {
    throw new Error(`Login response for ${email} missing access token`);
  }
  return token;
}

async function verifyChannel(
  deps: VerifyDeps,
  token: string,
  slug: TenantSlug,
  channel: 'email' | 'sms' | 'whatsapp',
  recipient: { email: string; phone: string },
): Promise<VerifyResult> {
  const url = `${deps.apiBase}/api/v1/${channel}-config/test`;
  const body =
    channel === 'email'
      ? { recipient_email: recipient.email }
      : channel === 'sms'
        ? { recipient_phone: recipient.phone }
        : { recipient_phone: recipient.phone, template_key: 'comms.verify' };

  const resp = await deps.fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const raw = await resp.json().catch(() => ({}) as Record<string, unknown>);
  const json = raw as {
    success?: boolean;
    provider_message_id?: string;
    provider_error?: string;
    error?: { details?: { provider_error?: string }; message?: string };
  };

  return {
    tenant: slug,
    channel,
    success: resp.ok && (json.success ?? true),
    provider_message_id: json.provider_message_id,
    provider_error:
      json.provider_error ?? json.error?.details?.provider_error ?? json.error?.message,
    http_status: resp.status,
  };
}

export interface VerifyRunResult {
  results: VerifyResult[];
  succeeded: number;
  failed: number;
  attempted: number;
}

export async function runVerify(
  deps: VerifyDeps,
  recipient: { email: string; phone: string },
): Promise<VerifyRunResult> {
  const results: VerifyResult[] = [];

  for (const slug of TENANT_SLUGS) {
    let token: string;
    try {
      token = await login(deps, slug);
    } catch (err) {
      console.error(`[skip] ${slug}: ${(err as Error).message}`);
      continue;
    }
    for (const channel of ['email', 'sms', 'whatsapp'] as const) {
      const result = await verifyChannel(deps, token, slug, channel, recipient);
      results.push(result);
      const tag = result.success ? '✔' : '✘';
      const detail = result.success
        ? `msg_id=${result.provider_message_id ?? '<none>'}`
        : `http=${result.http_status} err=${result.provider_error ?? '<no body>'}`;
      console.log(`  ${tag} ${slug.padEnd(10)} ${channel.padEnd(8)} ${detail}`);
    }
  }

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.length - succeeded;
  console.log('\n──────────────────────────────────────────────');
  console.log(`Verifications attempted: ${results.length} (target: 15)`);
  console.log(`Succeeded:               ${succeeded}`);
  console.log(`Failed (provider error): ${failed}`);
  console.log('──────────────────────────────────────────────');

  return { results, succeeded, failed, attempted: results.length };
}

async function main(): Promise<void> {
  const configPath = process.env.CREDENTIALS_FILE
    ? path.resolve(process.cwd(), process.env.CREDENTIALS_FILE)
    : DEFAULT_CONFIG_PATH;
  if (!fs.existsSync(configPath)) {
    console.error(`[fatal] missing ${configPath} — run backfill first`);
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
    verification_recipients?: { email: string; phone: string };
  };
  const recipient = raw.verification_recipients;
  if (!recipient?.email || !recipient?.phone) {
    console.error(`[fatal] ${configPath} is missing verification_recipients block`);
    process.exit(1);
  }

  const apiBase = process.env.API_BASE ?? 'http://localhost:3001';
  const deps: VerifyDeps = { fetch: globalThis.fetch.bind(globalThis), apiBase };

  const summary = await runVerify(deps, recipient);

  if (summary.attempted === 0) {
    console.error('No verifications attempted — every login failed. Check API + credentials.');
    process.exit(1);
  }
  if (summary.succeeded === 0) {
    console.error('All verifications failed — check API logs and credentials file.');
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Verify runner crashed:', err);
    process.exit(1);
  });
}
