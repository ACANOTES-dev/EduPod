/**
 * Shared k6 threshold definitions — School OS.
 *
 * Import into individual test scripts via:
 *   import { thresholds } from './k6-thresholds.js';
 */

export const thresholds = {
  // p95 response time for read operations
  'http_req_duration{type:read}': ['p(95)<500'],
  // p95 response time for write operations
  'http_req_duration{type:write}': ['p(95)<2000'],
  // Overall error rate
  http_req_failed: ['rate<0.01'],
  // p99 response time (absolute ceiling)
  http_req_duration: ['p(99)<5000'],
};

export const readTag = { type: 'read' };
export const writeTag = { type: 'write' };
