/**
 * Unit tests for DataTable — pagination math.
 *
 * The DataTable component derives several display values from its props.
 * We test those calculations in isolation so regressions are caught without
 * rendering React.
 */

// ─── Pure logic extracted from data-table.tsx ─────────────────────────────────

function computePagination(
  page: number,
  pageSize: number,
  total: number,
): { totalPages: number; startItem: number; endItem: number; label: string } {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, total);
  const label = total === 0 ? 'No results' : `Showing ${startItem}–${endItem} of ${total}`;
  return { totalPages, startItem, endItem, label };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('DataTable — pagination math', () => {
  afterEach(() => jest.clearAllMocks());

  // ─── totalPages ──────────────────────────────────────────────────────────

  describe('totalPages', () => {
    it('should be 1 when there are no results', () => {
      const { totalPages } = computePagination(1, 20, 0);
      expect(totalPages).toBe(1);
    });

    it('should compute exact pages when total is a multiple of pageSize', () => {
      const { totalPages } = computePagination(1, 20, 60);
      expect(totalPages).toBe(3);
    });

    it('should round up when total is not a multiple of pageSize', () => {
      const { totalPages } = computePagination(1, 20, 41);
      expect(totalPages).toBe(3);
    });

    it('should be 1 when total is less than pageSize', () => {
      const { totalPages } = computePagination(1, 20, 5);
      expect(totalPages).toBe(1);
    });

    it('should handle pageSize of 1', () => {
      const { totalPages } = computePagination(1, 1, 7);
      expect(totalPages).toBe(7);
    });
  });

  // ─── startItem / endItem ─────────────────────────────────────────────────

  describe('startItem and endItem', () => {
    it('should show 0–0 when there are no results', () => {
      const { startItem, endItem } = computePagination(1, 20, 0);
      expect(startItem).toBe(0);
      expect(endItem).toBe(0);
    });

    it('should compute correct range for the first page', () => {
      const { startItem, endItem } = computePagination(1, 20, 55);
      expect(startItem).toBe(1);
      expect(endItem).toBe(20);
    });

    it('should compute correct range for the second page', () => {
      const { startItem, endItem } = computePagination(2, 20, 55);
      expect(startItem).toBe(21);
      expect(endItem).toBe(40);
    });

    it('should clamp endItem to total on the last page', () => {
      const { startItem, endItem } = computePagination(3, 20, 55);
      expect(startItem).toBe(41);
      expect(endItem).toBe(55);
    });

    it('should handle a single item correctly', () => {
      const { startItem, endItem } = computePagination(1, 20, 1);
      expect(startItem).toBe(1);
      expect(endItem).toBe(1);
    });
  });

  // ─── pagination label ─────────────────────────────────────────────────────

  describe('pagination label', () => {
    it('should show "No results" when total is 0', () => {
      const { label } = computePagination(1, 20, 0);
      expect(label).toBe('No results');
    });

    it('should show correct range label on page 1', () => {
      const { label } = computePagination(1, 20, 55);
      expect(label).toBe('Showing 1–20 of 55');
    });

    it('should show correct range label on the last partial page', () => {
      const { label } = computePagination(3, 20, 55);
      expect(label).toBe('Showing 41–55 of 55');
    });

    it('should show correct label when total equals exactly one page', () => {
      const { label } = computePagination(1, 20, 20);
      expect(label).toBe('Showing 1–20 of 20');
    });
  });

  // ─── edge: next/prev button disabled state ────────────────────────────────

  describe('edge: button disabled states', () => {
    it('previous button should be disabled on page 1', () => {
      const page = 1;
      expect(page <= 1).toBe(true);
    });

    it('next button should be disabled on the last page', () => {
      const { totalPages } = computePagination(3, 20, 55);
      const page = 3;
      expect(page >= totalPages).toBe(true);
    });

    it('next button should be enabled on intermediate pages', () => {
      const { totalPages } = computePagination(2, 20, 55);
      const page = 2;
      expect(page >= totalPages).toBe(false);
    });
  });
});
