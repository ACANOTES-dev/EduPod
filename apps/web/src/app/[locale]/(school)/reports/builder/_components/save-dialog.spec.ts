import { saveDialogSchema } from './save-dialog';

describe('saveDialogSchema', () => {
  it('accepts a minimal valid payload', () => {
    const result = saveDialogSchema.safeParse({ name: 'Year 10 underperformers', description: '', visibility: 'private', is_favorite: false });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe('Year 10 underperformers');
  });
  it('rejects names shorter than 2 characters', () => {
    expect(saveDialogSchema.safeParse({ name: 'a', description: '', visibility: 'private', is_favorite: false }).success).toBe(false);
  });
  it('rejects names longer than 80 characters', () => {
    expect(saveDialogSchema.safeParse({ name: 'a'.repeat(81), description: '', visibility: 'private', is_favorite: false }).success).toBe(false);
  });
  it('trims whitespace from the name', () => {
    const result = saveDialogSchema.safeParse({ name: '   Year 10  ', description: '', visibility: 'private', is_favorite: false });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe('Year 10');
  });
  it('rejects whitespace-only names', () => {
    expect(saveDialogSchema.safeParse({ name: '   ', description: '', visibility: 'private', is_favorite: false }).success).toBe(false);
  });
  it('accepts shared visibility with favorite', () => {
    const result = saveDialogSchema.safeParse({ name: 'Annual board prep', description: 'For the termly board meeting', visibility: 'shared', is_favorite: true });
    expect(result.success).toBe(true);
  });
  it('rejects unknown visibility values', () => {
    expect(saveDialogSchema.safeParse({ name: 'X', description: '', visibility: 'public', is_favorite: false }).success).toBe(false);
  });
  it('rejects descriptions over 500 chars', () => {
    expect(saveDialogSchema.safeParse({ name: 'X', description: 'a'.repeat(501), visibility: 'private', is_favorite: false }).success).toBe(false);
  });
});
