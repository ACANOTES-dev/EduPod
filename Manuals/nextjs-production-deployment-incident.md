# Next.js Production Deployment — Incident Note for Future Reference

This happened before. Read this before deploying a Next.js monorepo to production so you do not repeat the same mistakes.

---

## What Went Wrong

The site was returning 500 errors despite the API running correctly and the server being healthy. After hours of debugging the root cause was simple: **the `.next` production build directory was corrupted**.

Here is the exact chain of events:

1. The initial `pnpm build` ran with `NEXT_PUBLIC_API_URL` missing from the environment. This caused every server component using that variable to fall back to the hardcoded dev value `http://localhost:5552`. Since that port does not exist in production, every page render that touched the API crashed.

2. During debugging, `next dev` was run on the production server to get better error output. This overwrote `.next` with a dev build. Subsequent production rebuilds via Turborepo were partially cached and did not fully replace the dev artefacts.

3. The result was a `.next` directory in a mixed/corrupted state — some files from dev mode, some from production — which caused Next.js's internal module registry (`clientModules`) to be undefined at runtime. Next.js swallows this as a generic 500 with no useful stack trace.

4. `pm2 restart` was used repeatedly hoping it would pick up changes. It does not rebuild the app and does not re-read `NEXT_PUBLIC_*` variables. This created a loop where the real problem was masked by repeated restart attempts.

**The actual fix:**

```bash
cd apps/web
rm -rf .next
NEXT_PUBLIC_API_URL=https://yourdomain.com npx next build
PORT=3000 npx next start   # manual smoke test in one terminal
curl -i http://localhost:3000/en/login  # confirm 200 in second terminal
# stop manual server
pm2 start web
pm2 save
```

---

## Root Causes

### 1. `NEXT_PUBLIC_*` variables were not in the environment at build time

`NEXT_PUBLIC_` variables in Next.js are baked into the compiled output at build time — they are **not** read at runtime. The `.env` file existed on the server but was not being sourced by the Turborepo build subprocess. The build completed with zero errors while silently baking in the wrong values.

### 2. Running `next dev` on a production server

`next dev` writes a dev build into `.next`, which is the same directory used by `next start`. Once this happened, the production build was gone. Every subsequent Turborepo build was partially cached against the corrupted state and did not fully recover.

**Never run `next dev` on a production server. Ever.**

### 3. No pre-flight environment validation before build

A missing `NEXT_PUBLIC_API_URL` produces a build that looks successful — zero errors, zero warnings — but is broken at runtime. There was no check to confirm the variable was present and baked in before handing the build to PM2.

### 4. No post-build smoke test

After the build completed, the app was immediately handed to PM2 without verifying that `next start` actually served a real response. A 30-second manual test would have caught this immediately.

### 5. PM2 crash loop masking the real error

With no `max_restarts` limit set, PM2 restarted the app 336 times before anyone noticed. This made the logs extremely noisy and hid the actual failure.

---

## What To Do Instead

### Before every production build

```bash
# 1. Confirm the critical build-time var is present
grep "NEXT_PUBLIC_API_URL" .env

# 2. Wipe old build to prevent cache poisoning
rm -rf apps/web/.next
rm -rf .turbo

# 3. Source env and build
set -a && source .env && set +a
pnpm build --filter @school/web --force

# 4. Confirm the var is actually baked into the output
grep -r "yourdomain.com" apps/web/.next/server/app/ --include="*.js" -l | head -3
# If this returns nothing, the build is wrong. Do not proceed.

# 5. Smoke test manually before handing to PM2
cd apps/web
PORT=3000 node_modules/.bin/next start &
sleep 5
curl -sf http://localhost:3000/en/login && echo "OK" || echo "FAILED — do not deploy"
kill %1
```

### PM2 ecosystem config — always use this

Do not start processes with bare `pm2 start`. Use an `ecosystem.config.js` with restart limits:

```javascript
module.exports = {
  apps: [
    {
      name: 'web',
      script: 'pnpm',
      args: 'start --filter @school/web',
      max_restarts: 10,
      restart_delay: 5000,
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
    {
      name: 'api',
      script: 'pnpm',
      args: 'start --filter @school/api',
      max_restarts: 10,
      restart_delay: 5000,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
```

### After a confirmed working deploy

```bash
pm2 save
```

Always. If the server reboots and you have not saved, PM2 will not restart the apps.

### GitHub Actions — enforce the checks in CI

```yaml
- name: Validate required env vars
  run: |
    required=("NEXT_PUBLIC_API_URL" "DATABASE_URL" "REDIS_URL" "JWT_SECRET")
    for var in "${required[@]}"; do
      [[ -z "${!var}" ]] && echo "ERROR: Missing $var" && exit 1
    done

- name: Clean build
  run: |
    rm -rf apps/web/.next .turbo
    pnpm build --force

- name: Smoke test
  run: |
    cd apps/web
    PORT=3001 node_modules/.bin/next start &
    sleep 5
    curl -sf http://localhost:3001/en/login || (echo "Smoke test failed" && exit 1)
    kill %1

- name: Restart via PM2
  run: pm2 restart web --update-env && pm2 save
```

---

## Hard Rules

| Never do this | Because | Do this instead |
|---|---|---|
| Run `next dev` on a production server | Overwrites production build | Use `NODE_ENV=production next start` for debugging |
| Use `pm2 restart` to apply a code change | Does not rebuild | Always rebuild first, then restart |
| Edit `.env` without checking for duplicates | Later value silently wins | Run `grep KEY .env` before adding a new entry |
| Run a build while a dev server is holding the port | Port conflicts corrupt the Turbo cache | Stop all processes before building |
| Hand a build to PM2 without a smoke test | Silent failures look like successes | Always curl a real route before switching PM2 over |
| Trust Turborepo cache after a failed or interrupted build | Partial cache causes mixed build state | Always `rm -rf .turbo` and use `--force` after any build failure |

---

## `NEXT_PUBLIC_*` Variables — Key Facts

- They are **build-time only**. Changing them in `.env` and restarting PM2 does nothing.
- They must be present in the shell environment when `next build` runs.
- To verify they are baked in: `grep -r "NEXT_PUBLIC_API_URL" apps/web/.next/server/ --include="*.js" | head -3`
- If the grep returns the fallback value (e.g. `localhost:5552`) instead of the production URL, **the build is wrong and must be redone**.
- The correct way to pass them reliably: `set -a && source .env && set +a && pnpm build`

---

## Summary

The 4-hour outage on launch day came down to one missing environment variable and one `next dev` command run in the wrong place. The fix took 2 minutes once the root cause was identified. Every item in the prevention checklist above exists because of something that went wrong in this incident.

When deploying a Next.js app to production: **delete `.next`, source your env, build, curl a real route, then hand to PM2.**
