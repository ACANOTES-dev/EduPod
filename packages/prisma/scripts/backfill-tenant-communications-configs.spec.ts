import {
  StandaloneEncryptor,
  assertEncryptedShape,
  loadConfig,
  maskLast4,
  resolveConfigPath,
  runBackfill,
  type CredentialsConfig,
} from './backfill-tenant-communications-configs';

const TEST_KEY_HEX = 'a'.repeat(64);

const VALID_BLOCK = {
  email: {
    resend_api_key: 're_dev_test_aaaaaaaaaaaaaaaa',
    from_email: 'noreply@example.test',
    from_name: 'Example School',
    reply_to_email: 'office@example.test',
    webhook_secret: 'whsec_dev_test_secret',
  },
  sms: {
    twilio_account_sid: 'ACdev_test_sid_aaaaaaaaaaaaaaaa',
    twilio_auth_token: 'dev_test_auth_token',
    twilio_from_number: '+15551234567',
    webhook_secret: 'twsec_dev_test_secret',
  },
  whatsapp: {
    twilio_account_sid: 'ACdev_test_sid_aaaaaaaaaaaaaaaa',
    twilio_auth_token: 'dev_test_auth_token',
    twilio_whatsapp_from_number: '+15551234567',
    business_profile_id: 'BPdev_test_profile',
    webhook_secret: 'twsec_dev_test_secret',
  },
};

const VALID_CONFIG: CredentialsConfig = {
  verification_recipients: { email: 'dev@example.test', phone: '+15551234567' },
  nhqs: VALID_BLOCK,
  'stress-a': VALID_BLOCK,
  'stress-b': VALID_BLOCK,
  'stress-c': VALID_BLOCK,
  'stress-d': VALID_BLOCK,
};

describe('StandaloneEncryptor', () => {
  it('encrypts to {iv}:{tag}:{ct} hex shape', () => {
    const enc = new StandaloneEncryptor(TEST_KEY_HEX);
    const out = enc.encrypt('hello');
    expect(out.encrypted.split(':')).toHaveLength(3);
    expect(out.keyRef).toBe('v1');
    expect(out.encrypted).not.toBe('hello');
  });

  it('round-trips encrypt → decrypt → original plaintext', () => {
    const enc = new StandaloneEncryptor(TEST_KEY_HEX);
    const plaintext = 're_test_some_real_secret_value';
    const { encrypted } = enc.encrypt(plaintext);
    expect(enc.decrypt(encrypted)).toBe(plaintext);
  });

  it('throws on a non-32-byte key', () => {
    expect(() => new StandaloneEncryptor('00')).toThrow(/32 bytes/);
  });

  it('produces fresh ciphertext each call (random IV)', () => {
    const enc = new StandaloneEncryptor(TEST_KEY_HEX);
    const a = enc.encrypt('same').encrypted;
    const b = enc.encrypt('same').encrypted;
    expect(a).not.toBe(b);
  });
});

describe('helpers', () => {
  it('maskLast4 keeps only the last 4 visible', () => {
    expect(maskLast4('abcdefghijkl')).toMatch(/^•+ijkl$/);
    expect(maskLast4('abc')).toBe('****');
  });

  it('assertEncryptedShape rejects plaintext', () => {
    expect(() => assertEncryptedShape('label', 'plain', 'plain')).toThrow(/plaintext/);
  });

  it('assertEncryptedShape rejects malformed', () => {
    expect(() => assertEncryptedShape('label', 'no-colons-here', 'orig')).toThrow(/format/);
  });

  it('resolveConfigPath honours CREDENTIALS_FILE env override', () => {
    const original = process.env.CREDENTIALS_FILE;
    try {
      process.env.CREDENTIALS_FILE = '/tmp/test-creds.json';
      expect(resolveConfigPath()).toBe('/tmp/test-creds.json');
    } finally {
      if (original === undefined) delete process.env.CREDENTIALS_FILE;
      else process.env.CREDENTIALS_FILE = original;
    }
  });
});

describe('loadConfig', () => {
  it('throws a helpful error when the file is missing', () => {
    expect(() => loadConfig('/tmp/definitely-not-a-real-credentials-file.json')).toThrow(
      /Missing credentials file/,
    );
  });
});

// ─── runBackfill — Prisma mock contract ─────────────────────────────────────

interface MockUpsert {
  upsert: jest.Mock;
}

function buildMockPrisma(tenantSlugs: string[]) {
  const tenantRows = tenantSlugs.map((slug, i) => ({
    id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
    slug,
  }));

  const findManySelect = jest
    .fn()
    .mockImplementation(({ where }: { where: { tenant_id: { in: string[] } } }) =>
      Promise.resolve(
        where.tenant_id.in.map((id) => ({
          tenant_id: id,
          // Use the encrypted-shape fixture so the post-condition assertion passes
          resend_api_key_encrypted: 'aabbcc:ddeeff:001122',
          webhook_secret_encrypted: 'aabbcc:ddeeff:001122',
          twilio_account_sid_encrypted: 'aabbcc:ddeeff:001122',
          twilio_auth_token_encrypted: 'aabbcc:ddeeff:001122',
        })),
      ),
    );

  const upsertEmail: MockUpsert = { upsert: jest.fn().mockResolvedValue(undefined) };
  const upsertSms: MockUpsert = { upsert: jest.fn().mockResolvedValue(undefined) };
  const upsertWhatsapp: MockUpsert = { upsert: jest.fn().mockResolvedValue(undefined) };
  const upsertTpl: MockUpsert = { upsert: jest.fn().mockResolvedValue(undefined) };

  const tx = {
    $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
    tenantEmailConfig: upsertEmail,
    tenantSmsConfig: upsertSms,
    tenantWhatsAppConfig: upsertWhatsapp,
    whatsAppTemplate: upsertTpl,
  };

  return {
    $queryRaw: jest.fn().mockResolvedValue(tenantRows),
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
    tenantEmailConfig: { findMany: findManySelect },
    tenantSmsConfig: { findMany: findManySelect },
    tenantWhatsAppConfig: { findMany: findManySelect },
    upsertEmail,
    upsertSms,
    upsertWhatsapp,
    upsertTpl,
    tenantRows,
  };
}

describe('runBackfill', () => {
  let originalLog: typeof console.log;

  beforeEach(() => {
    originalLog = console.log;
    console.log = jest.fn();
  });

  afterEach(() => {
    console.log = originalLog;
  });

  it('writes 5 email + 5 sms + 5 whatsapp config rows + 5 wa templates', async () => {
    const mock = buildMockPrisma(['nhqs', 'stress-a', 'stress-b', 'stress-c', 'stress-d']);
    const enc = new StandaloneEncryptor(TEST_KEY_HEX);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await runBackfill(mock as any, enc, VALID_CONFIG);

    expect(result.tenantsProcessed).toBe(5);
    expect(result.emailRowsWritten).toBe(5);
    expect(result.smsRowsWritten).toBe(5);
    expect(result.whatsappRowsWritten).toBe(5);
    expect(result.whatsappTemplateRowsWritten).toBe(5);

    expect(mock.upsertEmail.upsert).toHaveBeenCalledTimes(5);
    expect(mock.upsertSms.upsert).toHaveBeenCalledTimes(5);
    expect(mock.upsertWhatsapp.upsert).toHaveBeenCalledTimes(5);
    expect(mock.upsertTpl.upsert).toHaveBeenCalledTimes(5);
  });

  it('encrypts secrets — upsert payloads carry encrypted blobs, not plaintext', async () => {
    const mock = buildMockPrisma(['nhqs', 'stress-a', 'stress-b', 'stress-c', 'stress-d']);
    const enc = new StandaloneEncryptor(TEST_KEY_HEX);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await runBackfill(mock as any, enc, VALID_CONFIG);

    const firstEmailCall = mock.upsertEmail.upsert.mock.calls[0][0] as {
      create: { resend_api_key_encrypted: string };
    };
    const apiKey = firstEmailCall.create.resend_api_key_encrypted;
    expect(apiKey).not.toBe(VALID_BLOCK.email.resend_api_key);
    expect(apiKey.split(':')).toHaveLength(3);

    // Decrypt to confirm round-trip
    expect(enc.decrypt(apiKey)).toBe(VALID_BLOCK.email.resend_api_key);
  });

  it('seeds the comms.verify WhatsApp template with HX_DEV_VERIFY sentinel', async () => {
    const mock = buildMockPrisma(['nhqs', 'stress-a', 'stress-b', 'stress-c', 'stress-d']);
    const enc = new StandaloneEncryptor(TEST_KEY_HEX);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await runBackfill(mock as any, enc, VALID_CONFIG);

    const firstTplCall = mock.upsertTpl.upsert.mock.calls[0][0] as {
      create: { template_key: string; twilio_template_sid: string; status: string };
    };
    expect(firstTplCall.create.template_key).toBe('comms.verify');
    expect(firstTplCall.create.twilio_template_sid).toBe('HX_DEV_VERIFY');
    expect(firstTplCall.create.status).toBe('approved');
  });

  it('hard-fails when a tenant slug is missing from the DB', async () => {
    const mock = buildMockPrisma(['nhqs', 'stress-a', 'stress-b', 'stress-c']);
    const enc = new StandaloneEncryptor(TEST_KEY_HEX);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(runBackfill(mock as any, enc, VALID_CONFIG)).rejects.toThrow(
      /tenant slug='stress-d' not found/,
    );
  });
});
