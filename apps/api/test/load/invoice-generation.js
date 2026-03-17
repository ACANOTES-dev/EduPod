/**
 * k6 load test: Invoice and payment operations.
 *
 * Simulates 20 virtual users performing finance operations:
 * listing invoices, viewing payments, checking fee structures.
 *
 * Run: k6 run apps/api/test/load/invoice-generation.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, TENANTS, login, authHeaders } from './k6-config.js';
import { thresholds, readTag } from './k6-thresholds.js';

export const options = {
  stages: [
    { duration: '15s', target: 10 },
    { duration: '2m', target: 20 },
    { duration: '15s', target: 0 },
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

  // List invoices
  const invoicesRes = http.get(
    `${BASE_URL}/api/v1/invoices?page=1&pageSize=20`,
    { headers, tags: readTag },
  );

  check(invoicesRes, {
    'invoices: status 200': (r) => r.status === 200,
  });

  sleep(0.3);

  // List payments
  const paymentsRes = http.get(
    `${BASE_URL}/api/v1/payments?page=1&pageSize=20`,
    { headers, tags: readTag },
  );

  check(paymentsRes, {
    'payments: status 200': (r) => r.status === 200,
  });

  sleep(0.3);

  // List fee structures
  const feeRes = http.get(
    `${BASE_URL}/api/v1/fee-structures?page=1&pageSize=10`,
    { headers, tags: readTag },
  );

  check(feeRes, {
    'fee-structures: status 200': (r) => r.status === 200,
  });

  sleep(1);
}
