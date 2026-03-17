/**
 * k6 load test: Payroll operations.
 *
 * Simulates 10 virtual users performing payroll read operations:
 * listing runs, viewing entries, checking compensation records.
 *
 * Run: k6 run apps/api/test/load/payroll-finalisation.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, TENANTS, login, authHeaders } from './k6-config.js';
import { thresholds, readTag } from './k6-thresholds.js';

export const options = {
  stages: [
    { duration: '10s', target: 5 },
    { duration: '2m', target: 10 },
    { duration: '10s', target: 0 },
  ],
  thresholds,
};

export function setup() {
  const tokens = {};
  for (const tenant of TENANTS) {
    tokens[tenant.domain] = login(http, tenant.domain, tenant.ownerEmail);
  }
  return { tokens };
}

export default function (data) {
  const tenant = TENANTS[0];
  const token = data.tokens[tenant.domain];
  if (!token) return;

  const headers = authHeaders(token, tenant.domain);

  // List payroll runs
  const runsRes = http.get(
    `${BASE_URL}/api/v1/payroll/runs?page=1&pageSize=10`,
    { headers, tags: readTag },
  );

  check(runsRes, {
    'payroll runs: status 200': (r) => r.status === 200,
  });

  sleep(0.5);

  // List compensation records
  const compRes = http.get(
    `${BASE_URL}/api/v1/payroll/compensation?page=1&pageSize=20`,
    { headers, tags: readTag },
  );

  check(compRes, {
    'compensation: status 200': (r) => r.status === 200,
  });

  sleep(1);
}
