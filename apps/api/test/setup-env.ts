// Defaults for local/integration test environments.
// Existing env vars (e.g. from CI) take precedence.
process.env.DATABASE_URL ??= 'postgresql://postgres:localpassword@localhost:5553/school_platform';
process.env.REDIS_URL ??= 'redis://localhost:5554';
process.env.JWT_SECRET ??= '73e10ad593c9fb3e3c0aaef14332e1f4f38dfe27bb579e35ef57e8303a767d48';
process.env.JWT_REFRESH_SECRET ??=
  '1a5be597a11a3d357ec51c55b88bdd4fe6a138f9f816dd0e8f048d802f87b2b3';
process.env.ENCRYPTION_KEY ??= 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
process.env.PLATFORM_DOMAIN ??= 'edupod.app';
process.env.MFA_ISSUER ??= 'SchoolOS-Test';
process.env.NODE_ENV ??= 'test';
process.env.APP_URL ??= 'http://localhost:5551';
process.env.API_PORT ??= '0';
