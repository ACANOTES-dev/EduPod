// ─── PM2 Process Configuration ────────────────────────────────────────────────
//
// All processes run in fork mode. Cluster mode is incompatible with
// Node 24's CJS module resolution in pnpm strict workspaces — the
// cluster worker process fails to resolve symlinked node_modules.
// Fork mode with 1 instance is the production default.
// Worker always runs in fork mode (single instance for job consistency).

const APP_DIR = process.env.APP_DIR || '/opt/edupod/app';
const SENTRY_ENVIRONMENT = process.env.SENTRY_ENVIRONMENT || 'production';
const SENTRY_RELEASE = process.env.SENTRY_RELEASE || '';
const WORKER_SHUTDOWN_GRACE_MS = process.env.WORKER_SHUTDOWN_GRACE_MS || '30000';

module.exports = {
  apps: [
    {
      name: 'api',
      cwd: `${APP_DIR}/apps/api`,
      script: 'dist/api/src/main.js',
      interpreter: 'node',
      node_args: '--enable-source-maps',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_memory_restart: '750M',
      kill_timeout: 30000,
      listen_timeout: 10000,
      env: {
        NODE_ENV: 'production',
        API_PORT: '3001',
        SENTRY_ENVIRONMENT,
        SENTRY_RELEASE,
      },
    },
    {
      name: 'web',
      cwd: `${APP_DIR}/apps/web`,
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 5551',
      interpreter: 'node',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_memory_restart: '1G',
      kill_timeout: 30000,
      listen_timeout: 10000,
      env: {
        NODE_ENV: 'production',
        PORT: '5551',
        SENTRY_ENVIRONMENT,
        SENTRY_RELEASE,
      },
    },
    {
      name: 'worker',
      cwd: `${APP_DIR}/apps/worker`,
      script: 'dist/apps/worker/src/main.js',
      interpreter: 'node',
      node_args: '--enable-source-maps',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      // CP-SAT phase of scheduler v2 reaches ~900MB RSS during a 6-year-group /
      // 320-variable solve. The previous 750M ceiling triggered a pm2 restart
      // every ~60s mid-solve, killing every queued scheduling run. Server has
      // 12GB free; 2G is comfortable headroom (SCHED-013 follow-up, 2026-04-15).
      max_memory_restart: '2G',
      kill_timeout: Number.parseInt(WORKER_SHUTDOWN_GRACE_MS, 10) + 5000,
      env: {
        NODE_ENV: 'production',
        WORKER_PORT: '5556',
        WORKER_SHUTDOWN_GRACE_MS,
        SENTRY_ENVIRONMENT,
        SENTRY_RELEASE,
      },
    },
  ],
};
