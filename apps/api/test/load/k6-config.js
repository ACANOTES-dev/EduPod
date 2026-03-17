/**
 * k6 shared configuration — School OS load testing.
 *
 * k6 uses its own JS runtime (not Node.js). Scripts import from 'k6' modules.
 * Run with: k6 run apps/api/test/load/<script>.js
 */

export const BASE_URL = __ENV.BASE_URL || 'http://localhost:5552';

export const TENANTS = [
  { domain: 'al-noor.edupod.app', ownerEmail: 'owner@alnoor.test' },
  { domain: 'cedar.edupod.app', ownerEmail: 'owner@cedar.test' },
];

export const DEV_PASSWORD = 'Password123!';

/**
 * Login and return the access token.
 */
export function login(http, domain, email) {
  const res = http.post(
    `${BASE_URL}/api/v1/auth/login`,
    JSON.stringify({ email, password: DEV_PASSWORD }),
    {
      headers: {
        'Content-Type': 'application/json',
        Host: domain,
      },
    },
  );

  if (res.status !== 200) {
    console.error(`Login failed for ${email}@${domain}: ${res.status}`);
    return null;
  }

  const body = JSON.parse(res.body);
  return (body.data || body).access_token;
}

/**
 * Create auth headers for a request.
 */
export function authHeaders(token, domain) {
  return {
    Authorization: `Bearer ${token}`,
    Host: domain,
    'Content-Type': 'application/json',
  };
}
