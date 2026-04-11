import type { SafeguardingKeywordRow } from '../keywords/safeguarding-keywords.repository';

import { KeywordSafeguardingScanner } from './keyword-safeguarding-scanner';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function makeRow(
  keyword: string,
  severity: 'low' | 'medium' | 'high',
  category:
    | 'bullying'
    | 'self_harm'
    | 'abuse'
    | 'inappropriate_contact'
    | 'weapons'
    | 'other' = 'other',
): SafeguardingKeywordRow {
  return {
    id: keyword,
    tenant_id: TENANT_ID,
    keyword,
    severity,
    category,
    active: true,
    created_at: new Date(),
    updated_at: new Date(),
  };
}

describe('KeywordSafeguardingScanner', () => {
  let repo: { findActiveByTenant: jest.Mock };
  let scanner: KeywordSafeguardingScanner;

  beforeEach(() => {
    repo = { findActiveByTenant: jest.fn() };
    scanner = new KeywordSafeguardingScanner(repo as never);
  });

  afterEach(() => jest.clearAllMocks());

  it('returns no matches for an empty keyword list', async () => {
    repo.findActiveByTenant.mockResolvedValue([]);
    const result = await scanner.scan({ tenantId: TENANT_ID, body: 'anything here' });
    expect(result.matches).toEqual([]);
    expect(result.highest_severity).toBeNull();
  });

  it('returns no matches for empty body', async () => {
    repo.findActiveByTenant.mockResolvedValue([makeRow('gun', 'high')]);
    const result = await scanner.scan({ tenantId: TENANT_ID, body: '' });
    expect(result.matches).toEqual([]);
    expect(result.highest_severity).toBeNull();
  });

  it('detects a case-insensitive exact match', async () => {
    repo.findActiveByTenant.mockResolvedValue([makeRow('Bullying', 'medium')]);
    const result = await scanner.scan({
      tenantId: TENANT_ID,
      body: 'I think this is bullying.',
    });
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]!.keyword).toBe('Bullying');
    expect(result.highest_severity).toBe('medium');
  });

  it('reports every match, not just the first', async () => {
    repo.findActiveByTenant.mockResolvedValue([makeRow('harm', 'low')]);
    const result = await scanner.scan({
      tenantId: TENANT_ID,
      body: 'harm twice and harm again',
    });
    expect(result.matches).toHaveLength(2);
  });

  it('respects word boundaries — does not match "gun" in "begun"', async () => {
    repo.findActiveByTenant.mockResolvedValue([makeRow('gun', 'high')]);
    const result = await scanner.scan({
      tenantId: TENANT_ID,
      body: 'The project has begun and is going well.',
    });
    expect(result.matches).toEqual([]);
    expect(result.highest_severity).toBeNull();
  });

  it('escapes regex metacharacters in keywords (e.g. "c++")', async () => {
    repo.findActiveByTenant.mockResolvedValue([makeRow('c++', 'low')]);
    const result = await scanner.scan({
      tenantId: TENANT_ID,
      body: 'I like c++ a lot',
    });
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]!.keyword).toBe('c++');
  });

  it('ignores inactive keywords (repo only returns active ones)', async () => {
    // The repo method `findActiveByTenant` is what filters inactive rows;
    // this test asserts the scanner honours whatever the repo returns.
    repo.findActiveByTenant.mockResolvedValue([]);
    const result = await scanner.scan({
      tenantId: TENANT_ID,
      body: 'harm is a serious concern',
    });
    expect(result.matches).toEqual([]);
  });

  it('computes highest severity as the max across matches', async () => {
    repo.findActiveByTenant.mockResolvedValue([
      makeRow('mild', 'low'),
      makeRow('worrying', 'medium'),
      makeRow('severe', 'high'),
    ]);
    const result = await scanner.scan({
      tenantId: TENANT_ID,
      body: 'mild worrying severe concern',
    });
    expect(result.matches).toHaveLength(3);
    expect(result.highest_severity).toBe('high');
  });

  it('reports medium when only low + medium matches are present', async () => {
    repo.findActiveByTenant.mockResolvedValue([
      makeRow('mild', 'low'),
      makeRow('worrying', 'medium'),
    ]);
    const result = await scanner.scan({
      tenantId: TENANT_ID,
      body: 'mild worrying words',
    });
    expect(result.highest_severity).toBe('medium');
  });

  it('handles multiple matches of the same keyword', async () => {
    repo.findActiveByTenant.mockResolvedValue([makeRow('bully', 'medium')]);
    const result = await scanner.scan({
      tenantId: TENANT_ID,
      body: 'a bully is a bully no matter what',
    });
    expect(result.matches).toHaveLength(2);
    expect(result.matches[0]!.position).toBeLessThan(result.matches[1]!.position);
  });
});
