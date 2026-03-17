import { paginationQuerySchema } from './pagination.schema';

describe('paginationQuerySchema', () => {
  it('should accept valid pagination', () => {
    const result = paginationQuerySchema.safeParse({ page: 1, pageSize: 20 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.pageSize).toBe(20);
    }
  });

  it('should use defaults', () => {
    const result = paginationQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.pageSize).toBe(20);
      expect(result.data.order).toBe('desc');
    }
  });

  it('should reject page < 1', () => {
    const result = paginationQuerySchema.safeParse({ page: 0 });
    expect(result.success).toBe(false);
  });

  it('should reject pageSize > 100', () => {
    const result = paginationQuerySchema.safeParse({ pageSize: 200 });
    expect(result.success).toBe(false);
  });

  it('should accept valid sort order', () => {
    const result = paginationQuerySchema.safeParse({ order: 'asc' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.order).toBe('asc');
    }
  });

  it('should reject invalid order', () => {
    const result = paginationQuerySchema.safeParse({ order: 'random' });
    expect(result.success).toBe(false);
  });
});
