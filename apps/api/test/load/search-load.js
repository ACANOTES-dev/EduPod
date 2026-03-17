/**
 * k6 load test: Search operations.
 *
 * Simulates 50 virtual users performing concurrent search queries
 * across students, staff, and households.
 *
 * Run: k6 run apps/api/test/load/search-load.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, TENANTS, login, authHeaders } from './k6-config.js';
import { thresholds, readTag } from './k6-thresholds.js';

export const options = {
  stages: [
    { duration: '20s', target: 25 },
    { duration: '2m', target: 50 },
    { duration: '20s', target: 0 },
  ],
  thresholds,
};

const SEARCH_QUERIES = ['ahmed', 'sarah', 'math', 'grade', 'fatima', 'class'];

export function setup() {
  const tokens = {};
  for (const tenant of TENANTS) {
    tokens[tenant.domain] = login(http, tenant.domain, tenant.ownerEmail);
  }
  return { tokens };
}

export default function (data) {
  const tenant = TENANTS[Math.floor(Math.random() * TENANTS.length)];
  const token = data.tokens[tenant.domain];
  if (!token) return;

  const query = SEARCH_QUERIES[Math.floor(Math.random() * SEARCH_QUERIES.length)];
  const headers = authHeaders(token, tenant.domain);

  const res = http.get(
    `${BASE_URL}/api/v1/search?q=${encodeURIComponent(query)}&page=1&pageSize=20`,
    { headers, tags: readTag },
  );

  check(res, {
    'search: status 200': (r) => r.status === 200,
    'search: returns data array': (r) => {
      const body = JSON.parse(r.body);
      return Array.isArray(body.data);
    },
  });

  sleep(0.5);
}
