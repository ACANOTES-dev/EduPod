/**
 * k6 load test: Login flow + dashboard fetch.
 *
 * Simulates 100 virtual users across 2 tenants logging in and fetching
 * their dashboard data.
 *
 * Run: k6 run apps/api/test/load/login-flow.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, TENANTS, DEV_PASSWORD, authHeaders } from './k6-config.js';
import { thresholds, readTag, writeTag } from './k6-thresholds.js';

export const options = {
  stages: [
    { duration: '30s', target: 50 },  // ramp up
    { duration: '2m', target: 100 },   // sustain
    { duration: '30s', target: 0 },    // ramp down
  ],
  thresholds,
};

export default function () {
  const tenant = TENANTS[Math.floor(Math.random() * TENANTS.length)];

  // Login
  const loginRes = http.post(
    `${BASE_URL}/api/v1/auth/login`,
    JSON.stringify({ email: tenant.ownerEmail, password: DEV_PASSWORD }),
    {
      headers: { 'Content-Type': 'application/json', Host: tenant.domain },
      tags: writeTag,
    },
  );

  const loginOk = check(loginRes, {
    'login: status 200': (r) => r.status === 200,
    'login: has access_token': (r) => {
      const body = JSON.parse(r.body);
      return !!(body.data || body).access_token;
    },
  });

  if (!loginOk) return;

  const body = JSON.parse(loginRes.body);
  const token = (body.data || body).access_token;
  const headers = authHeaders(token, tenant.domain);

  sleep(0.5);

  // Fetch dashboard
  const dashRes = http.get(`${BASE_URL}/api/v1/dashboard`, {
    headers,
    tags: readTag,
  });

  check(dashRes, {
    'dashboard: status 200': (r) => r.status === 200,
  });

  sleep(1);
}
