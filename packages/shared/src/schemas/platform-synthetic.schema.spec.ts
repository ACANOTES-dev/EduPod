import { createSyntheticCheckDefinitionSchema } from './platform';

const BASE_DEFINITION = {
  consecutive_failure_threshold_critical: 3,
  display_name: 'Synthetic Login',
  enabled: true,
  expected: { status_codes: [200] },
  key: 'platform.synthetic.login',
  kind: 'http_post',
  retry_attempts: 1,
  schedule_cron: '*/5 * * * *',
  target: {
    body: {
      email: { env: 'SYNTHETIC_PLATFORM_USER_EMAIL' },
      password: { env: 'SYNTHETIC_PLATFORM_USER_PASSWORD' },
    },
    url: 'https://dua.edupod.app/api/v1/auth/login',
  },
  timeout_ms: 15000,
} as const;

describe('platform synthetic schemas', () => {
  it('accepts env-referenced credentials for synthetic checks', () => {
    expect(createSyntheticCheckDefinitionSchema.safeParse(BASE_DEFINITION).success).toBe(true);
  });

  it.each([
    '~/.codex/secrets/edupod-platform-admin.env',
    '/Users/ram/.codex/secrets/edupod-platform-admin.env',
    `${['sk', 'live'].join('_')}_${'123456789012345678901234567890'}`,
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaaaaaaaaaaa.bbbbbbbbbbbb',
    `AC${'0123456789abcdef0123456789abcdef'}`,
  ])('rejects raw secret-like target values: %s', (secretLikeValue) => {
    const parsed = createSyntheticCheckDefinitionSchema.safeParse({
      ...BASE_DEFINITION,
      target: {
        body: { password: secretLikeValue },
        url: 'https://dua.edupod.app/api/v1/auth/login',
      },
    });

    expect(parsed.success).toBe(false);
  });

  it('rejects a target that does not match the selected check kind', () => {
    const parsed = createSyntheticCheckDefinitionSchema.safeParse({
      ...BASE_DEFINITION,
      kind: 'queue_canary',
    });

    expect(parsed.success).toBe(false);
  });
});
