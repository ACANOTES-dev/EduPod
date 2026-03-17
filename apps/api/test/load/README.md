# Load Testing — School OS

Load tests use [k6](https://k6.io/) to simulate concurrent users against the API.

## Prerequisites

1. Install k6: `brew install k6` (macOS) or see [k6 installation](https://k6.io/docs/get-started/installation/)
2. Start local services: `docker-compose up -d`
3. Run migrations: `pnpm db:migrate`
4. Seed demo data: `pnpm seed:demo`
5. Start the API server: `pnpm --filter @school/api dev`

## Running Tests

```bash
# Login flow (100 VUs)
k6 run apps/api/test/load/login-flow.js

# Search operations (50 VUs)
k6 run apps/api/test/load/search-load.js

# Attendance marking (30 VUs)
k6 run apps/api/test/load/attendance-marking.js

# Invoice/payment operations (20 VUs)
k6 run apps/api/test/load/invoice-generation.js

# Payroll operations (10 VUs)
k6 run apps/api/test/load/payroll-finalisation.js
```

## Custom Base URL

```bash
k6 run -e BASE_URL=http://staging.example.com apps/api/test/load/login-flow.js
```

## Thresholds

| Metric | Target |
|--------|--------|
| p95 read response time | < 500ms |
| p95 write response time | < 2000ms |
| Error rate | < 1% |
| p99 response time | < 5000ms |

Tests fail automatically if thresholds are exceeded.

## Notes

- Load tests are NOT run in CI (too expensive). Run manually before release.
- Tests use seed data — ensure demo data is populated before running.
- Results are printed to stdout. Use `--out json=results.json` for structured output.
- For cloud execution: `k6 cloud apps/api/test/load/login-flow.js`
