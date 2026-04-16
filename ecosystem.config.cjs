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
        // CP-SAT cutover (Stage 7): the worker dispatches every solve to the
        // loopback solver-py sidecar below. The request-timeout floor protects
        // tenants with small `max_solver_duration_seconds` budgets from tripping
        // the AbortController during the sidecar's presolve phase (Stage 5
        // carryover §2). Client formula: max(floor, (budget + 60) * 1000).
        SOLVER_PY_URL: 'http://127.0.0.1:5557',
        CP_SAT_REQUEST_TIMEOUT_FLOOR_MS: '120000',
      },
    },
    // ─── OR-Tools CP-SAT sidecar ────────────────────────────────────────────
    //
    // Loopback-only FastAPI service that houses the CP-SAT scheduling solver.
    // Invoked exclusively by the worker via SOLVER_PY_URL above — NEVER
    // proxied by nginx. Runs inside a Python 3.12 venv at
    // /opt/edupod/app/apps/solver-py/.venv. `interpreter: 'none'` tells pm2
    // to exec uvicorn directly instead of wrapping it in Node.
    //
    // `num_search_workers = 1` is fixed inside solve.py per Stage 5 findings:
    // OR-Tools 9.15's `interleave_search` overshoots max_time_in_seconds by
    // 4-7× on Tier-3-scale fixtures, and `repair_hint = True` segfaults in
    // `MinimizeL1DistanceWithHint`. Stage 9 re-tests multi-worker once the
    // upstream bugs are confirmed fixed.
    {
      name: 'solver-py',
      cwd: `${APP_DIR}/apps/solver-py`,
      script: `${APP_DIR}/apps/solver-py/.venv/bin/uvicorn`,
      args: 'solver_py.main:app --host 127.0.0.1 --port 5557',
      interpreter: 'none',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      // Stage 9.5.2 §E: raised 2G → 4G after the tier-4 measurement
      // showed RSS climbing monotonically with budget — 600 s budget
      // peaked at ~3.1 GB locally. Tier-5 (1800 s) and tier-6 (3600 s)
      // budgets are projected higher. 4 GB gives comfortable headroom
      // for tier-4/5 and is the entry point for tier-6 measurement; if
      // tier-6 sustains > 3.5 GB at 3600 s this will be raised again to
      // 6 G. Server has 12 GB free.
      max_memory_restart: '4G',
      max_restarts: 10,
      min_uptime: '30s',
      env: {
        SOLVER_PY_PORT: '5557',
        LOG_LEVEL: 'INFO',
        PYTHONUNBUFFERED: '1',
      },
    },
  ],
};
