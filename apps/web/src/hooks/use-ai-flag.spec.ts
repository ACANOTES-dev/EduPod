/**
 * Pure-logic tests for the useAiFlag hook helpers (impl 19).
 *
 * The hook itself is a thin React wrapper around `loadFlags`, which fetches
 * `/api/v1/ai-flags` once per session. We cover the two pure helpers that
 * do the projection + state derivation — the bits that have every reason to
 * regress independently of React state.
 */

import { deriveFlagState, projectFlagsResponse } from './use-ai-flag';

describe('projectFlagsResponse', () => {
  it('accepts the bare-array shape', () => {
    const raw = [
      { module_key: 'behaviour', enabled: true },
      { module_key: 'pastoral', enabled: false },
    ];
    const map = projectFlagsResponse(raw);
    expect(map.get('behaviour')).toBe(true);
    expect(map.get('pastoral')).toBe(false);
    expect(map.size).toBe(2);
  });

  it('accepts the { data: [...] } envelope shape', () => {
    const raw = {
      data: [
        { module_key: 'early_warning', enabled: true },
        { module_key: 'staff_wellbeing', enabled: false },
      ],
    };
    const map = projectFlagsResponse(raw);
    expect(map.get('early_warning')).toBe(true);
    expect(map.get('staff_wellbeing')).toBe(false);
  });

  it('skips malformed rows', () => {
    const raw = [
      { module_key: 'behaviour', enabled: true },
      { module_key: 42, enabled: true }, // bad type
      { module_key: 'pastoral' }, // missing enabled
      null,
      { enabled: false }, // missing module_key
    ];
    const map = projectFlagsResponse(raw);
    expect(map.size).toBe(1);
    expect(map.get('behaviour')).toBe(true);
  });

  it('returns an empty map on null / non-object / non-array input', () => {
    expect(projectFlagsResponse(null).size).toBe(0);
    expect(projectFlagsResponse(undefined).size).toBe(0);
    expect(projectFlagsResponse('nope').size).toBe(0);
    expect(projectFlagsResponse({ data: 'nope' }).size).toBe(0);
  });
});

describe('deriveFlagState', () => {
  it('returns enabled for true', () => {
    const map = new Map([['behaviour', true]]);
    expect(deriveFlagState(map, 'behaviour')).toBe('enabled');
  });

  it('returns disabled for false', () => {
    const map = new Map([['behaviour', false]]);
    expect(deriveFlagState(map, 'behaviour')).toBe('disabled');
  });

  it('returns unknown when the module is missing from the map', () => {
    const map = new Map([['behaviour', true]]);
    expect(deriveFlagState(map, 'pastoral')).toBe('unknown');
  });

  it('returns unknown for an empty map (typical 403 / teacher case)', () => {
    expect(deriveFlagState(new Map(), 'behaviour')).toBe('unknown');
    expect(deriveFlagState(new Map(), 'pastoral')).toBe('unknown');
    expect(deriveFlagState(new Map(), 'early_warning')).toBe('unknown');
    expect(deriveFlagState(new Map(), 'staff_wellbeing')).toBe('unknown');
  });
});
