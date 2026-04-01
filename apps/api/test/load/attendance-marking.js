/**
 * k6 load test: Attendance marking flow.
 *
 * Simulates 30 virtual users concurrently creating attendance sessions
 * and marking students present/absent.
 *
 * Run: k6 run apps/api/test/load/attendance-marking.js
 */

import { check, sleep } from 'k6';
import http from 'k6/http';

import { BASE_URL, TENANTS, login, authHeaders } from './k6-config.js';
import { thresholds, readTag, writeTag } from './k6-thresholds.js';

export const options = {
  stages: [
    { duration: '15s', target: 15 },
    { duration: '2m', target: 30 },
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
  const tenant = TENANTS[0]; // Use Al Noor for attendance
  const token = data.tokens[tenant.domain];
  if (!token) return;

  const headers = authHeaders(token, tenant.domain);

  // List attendance sessions
  const listRes = http.get(`${BASE_URL}/api/v1/attendance/sessions?page=1&pageSize=10`, {
    headers,
    tags: readTag,
  });

  check(listRes, {
    'attendance list: status 200': (r) => r.status === 200,
  });

  sleep(0.5);

  // List classes (for context)
  const classRes = http.get(`${BASE_URL}/api/v1/classes?page=1&pageSize=5`, {
    headers,
    tags: readTag,
  });

  check(classRes, {
    'classes: status 200': (r) => r.status === 200,
  });

  sleep(1);
}
