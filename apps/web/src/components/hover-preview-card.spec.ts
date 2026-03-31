/**
 * Unit tests for HoverPreviewCard — pure helper logic.
 *
 * HoverPreviewCard is an interactive component with API side-effects, but its
 * key logic is in the RTL-aware position calculation inline with the mouse
 * event.  We extract and test the position arithmetic here without mounting
 * React or touching the DOM.
 */

// ─── Types (mirrored) ─────────────────────────────────────────────────────────

interface PreviewPosition {
  top: number;
  left: number;
  isRtl: boolean;
}

// ─── Pure helpers (derived from hover-preview-card.tsx position logic) ────────

/**
 * Calculates the absolute card position from the trigger element's bounding
 * rect and the current scroll offsets.
 *
 * LTR: card left edge aligns with the trigger's left edge.
 * RTL: card right edge (expressed as `left` from the right viewport edge)
 *      aligns with the trigger's right edge.
 */
function calculateCardPosition(
  rect: { top: number; bottom: number; left: number; right: number },
  scrollX: number,
  scrollY: number,
  innerWidth: number,
  isRtl: boolean,
): PreviewPosition {
  return {
    top: rect.bottom + scrollY + 4,
    left: isRtl ? innerWidth - rect.right + scrollX : rect.left + scrollX,
    isRtl,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('HoverPreviewCard — position calculation', () => {
  afterEach(() => jest.clearAllMocks());

  const BASE_RECT = { top: 100, bottom: 120, left: 50, right: 200 };

  describe('LTR layout', () => {
    it('should place the card 4px below the trigger bottom', () => {
      const pos = calculateCardPosition(BASE_RECT, 0, 0, 1024, false);
      expect(pos.top).toBe(124); // bottom(120) + scrollY(0) + 4
    });

    it('should align the card left edge with the trigger left edge', () => {
      const pos = calculateCardPosition(BASE_RECT, 0, 0, 1024, false);
      expect(pos.left).toBe(50); // rect.left + scrollX(0)
    });

    it('should add horizontal scroll offset to left', () => {
      const pos = calculateCardPosition(BASE_RECT, 30, 0, 1024, false);
      expect(pos.left).toBe(80); // rect.left(50) + scrollX(30)
    });

    it('should add vertical scroll offset to top', () => {
      const pos = calculateCardPosition(BASE_RECT, 0, 200, 1024, false);
      expect(pos.top).toBe(324); // bottom(120) + scrollY(200) + 4
    });

    it('should set isRtl to false', () => {
      const pos = calculateCardPosition(BASE_RECT, 0, 0, 1024, false);
      expect(pos.isRtl).toBe(false);
    });
  });

  describe('RTL layout', () => {
    it('should place the card 4px below the trigger bottom', () => {
      const pos = calculateCardPosition(BASE_RECT, 0, 0, 1024, true);
      expect(pos.top).toBe(124);
    });

    it('should express left as distance from the right viewport edge', () => {
      // innerWidth(1024) - rect.right(200) + scrollX(0) = 824
      const pos = calculateCardPosition(BASE_RECT, 0, 0, 1024, true);
      expect(pos.left).toBe(824);
    });

    it('should add horizontal scroll offset in RTL mode', () => {
      const pos = calculateCardPosition(BASE_RECT, 30, 0, 1024, true);
      expect(pos.left).toBe(854); // (1024 - 200) + 30
    });

    it('should set isRtl to true', () => {
      const pos = calculateCardPosition(BASE_RECT, 0, 0, 1024, true);
      expect(pos.isRtl).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle a trigger at the very top of the page', () => {
      const rect = { top: 0, bottom: 20, left: 10, right: 80 };
      const pos = calculateCardPosition(rect, 0, 0, 1024, false);
      expect(pos.top).toBe(24);
    });

    it('should handle zero-width viewport', () => {
      const pos = calculateCardPosition(BASE_RECT, 0, 0, 0, true);
      // innerWidth(0) - rect.right(200) + 0 = -200
      expect(pos.left).toBe(-200);
    });
  });
});
