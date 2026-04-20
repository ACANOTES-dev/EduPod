/**
 * Contract test for behaviour analytics URL prefixes.
 *
 * All `apiClient` calls in the analytics pages MUST use the absolute
 * `/api/v1/behaviour/analytics/...` path. A bare `/behaviour/analytics/...`
 * URL 307-redirects to a localised route that returns 404. This file guards
 * the regression fix delivered in impl 11 of the wellbeing rebuild.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ANALYTICS_ENDPOINTS = [
  'pulse',
  'overview',
  'trends',
  'categories',
  'subjects',
  'heatmap',
  'comparisons',
  'staff',
] as const;

const PAGE_PATH = join(__dirname, 'page.tsx');
const AI_PAGE_PATH = join(__dirname, 'ai', 'page.tsx');

describe('behaviour analytics URL prefix', () => {
  const pageSource = readFileSync(PAGE_PATH, 'utf-8');
  const aiPageSource = readFileSync(AI_PAGE_PATH, 'utf-8');

  for (const endpoint of ANALYTICS_ENDPOINTS) {
    it(`analytics page uses /api/v1 prefix for ${endpoint}`, () => {
      expect(pageSource).toContain(`/api/v1/behaviour/analytics/${endpoint}`);
    });

    it(`analytics page does not use bare /behaviour/analytics/${endpoint} in apiClient calls`, () => {
      const bareRegex = new RegExp(`apiClient[^)]*['\`"]/behaviour/analytics/${endpoint}`);
      expect(pageSource).not.toMatch(bareRegex);
    });
  }

  it('ai-query history uses /api/v1 prefix', () => {
    expect(aiPageSource).toContain('/api/v1/behaviour/analytics/ai-query/history');
  });

  it('ai-query POST uses /api/v1 prefix', () => {
    expect(aiPageSource).toMatch(
      /apiClient[^)]*['`"]\/api\/v1\/behaviour\/analytics\/ai-query['`"]/,
    );
  });

  it('ai page does not use bare /behaviour/analytics/ai-query in apiClient calls', () => {
    const bareRegex = /apiClient[^)]*['`"]\/behaviour\/analytics\/ai-query/;
    expect(aiPageSource).not.toMatch(bareRegex);
  });
});
