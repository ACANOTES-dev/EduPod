/**
 * Pure-logic tests for the AI query citation extractor (impl 19).
 */

import { extractCitations } from './citation-helpers';

describe('extractCitations', () => {
  it('maps incident citations to behaviour/incidents/:id', () => {
    const out = extractCitations({
      citations: [
        { type: 'incident', id: 'inc-1', label: 'Incident #42' },
        { type: 'incident', id: 'inc-2' }, // no label — fall back to id
      ],
    });
    expect(out).toEqual([
      { href: '/behaviour/incidents/inc-1', label: 'Incident #42' },
      { href: '/behaviour/incidents/inc-2', label: 'inc-2' },
    ]);
  });

  it('maps student / task / sanction / intervention / concern', () => {
    const out = extractCitations({
      citations: [
        { type: 'student', id: 's-1', label: 'Amina K.' },
        { type: 'task', id: 't-1', label: 'Task' },
        { type: 'sanction', id: 'sa-1', label: 'Sanction' },
        { type: 'intervention', id: 'iv-1', label: 'Plan' },
        { type: 'concern', id: 'c-1', label: 'Concern' },
      ],
    });
    expect(out.map((c) => c.href)).toEqual([
      '/behaviour/students/s-1',
      '/behaviour/tasks/t-1',
      '/behaviour/sanctions/sa-1',
      '/behaviour/interventions/iv-1',
      '/pastoral/concerns/c-1',
    ]);
  });

  it('drops entries without type or id', () => {
    const out = extractCitations({
      citations: [
        { type: 'incident', id: 'inc-1' },
        { type: 'incident' },
        { id: 'no-type' },
        { type: 'student', id: null },
        null,
      ],
    });
    expect(out).toEqual([{ href: '/behaviour/incidents/inc-1', label: 'inc-1' }]);
  });

  it('drops unknown types', () => {
    const out = extractCitations({
      citations: [
        { type: 'incident', id: 'inc-1' },
        { type: 'phantom', id: 'ph-1' },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0]?.href).toBe('/behaviour/incidents/inc-1');
  });

  it('returns empty on non-array / null / wrong shape', () => {
    expect(extractCitations(null)).toEqual([]);
    expect(extractCitations(undefined)).toEqual([]);
    expect(extractCitations('nope')).toEqual([]);
    expect(extractCitations({ citations: 'nope' })).toEqual([]);
    expect(extractCitations({ other: [] })).toEqual([]);
  });

  it('falls back to id when label is empty string', () => {
    const out = extractCitations({
      citations: [{ type: 'incident', id: 'inc-1', label: '  ' }],
    });
    expect(out[0]?.label).toBe('inc-1');
  });
});
