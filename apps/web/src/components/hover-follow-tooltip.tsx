'use client';

/**
 * HoverFollowTooltip — wraps any element and shows a floating explanation
 * bubble that tracks the cursor while the pointer is inside the wrapped
 * element, then disappears when the pointer leaves.
 *
 * Unlike a static Radix Tooltip, this one renders near the cursor position
 * (with a small offset) and updates on every mousemove. It uses a fixed-
 * positioned portal so it is never clipped by parent containers.
 *
 * Usage:
 *   <HoverFollowTooltip
 *     title="Scheduled"
 *     body="Open assessments that have a due date in the future..."
 *   >
 *     <div>...the hoverable content...</div>
 *   </HoverFollowTooltip>
 */

import * as React from 'react';
import { createPortal } from 'react-dom';

interface HoverFollowTooltipProps {
  title: string;
  body: string;
  children: React.ReactNode;
  /** Optional className appended to the wrapper element */
  className?: string;
  /** Pixel offset from the cursor (default: 14px right, 18px below) */
  offsetX?: number;
  offsetY?: number;
  /** Max width of the tooltip card in px (default 260) */
  maxWidth?: number;
  /** Render the wrapper as a span (for inline contexts like table headers) */
  as?: 'div' | 'span';
}

export function HoverFollowTooltip({
  title,
  body,
  children,
  className,
  offsetX = 14,
  offsetY = 18,
  maxWidth = 260,
  as = 'div',
}: HoverFollowTooltipProps) {
  const [visible, setVisible] = React.useState(false);
  const [pos, setPos] = React.useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const handleMouseEnter = React.useCallback((e: React.MouseEvent<HTMLElement>) => {
    setVisible(true);
    setPos({ x: e.clientX, y: e.clientY });
  }, []);

  const handleMouseMove = React.useCallback((e: React.MouseEvent<HTMLElement>) => {
    setPos({ x: e.clientX, y: e.clientY });
  }, []);

  const handleMouseLeave = React.useCallback(() => {
    setVisible(false);
  }, []);

  // Flip horizontally if the tooltip would overflow the right edge
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1920;
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 1080;
  const tooltipHeight = 110;
  const wouldOverflowRight = pos.x + offsetX + maxWidth > viewportWidth - 8;
  const wouldOverflowBottom = pos.y + offsetY + tooltipHeight > viewportHeight - 8;

  const style: React.CSSProperties = {
    position: 'fixed',
    left: wouldOverflowRight ? pos.x - offsetX - maxWidth : pos.x + offsetX,
    top: wouldOverflowBottom ? pos.y - offsetY - tooltipHeight : pos.y + offsetY,
    maxWidth,
    pointerEvents: 'none',
    zIndex: 9999,
  };

  const wrapperProps = {
    className,
    onMouseEnter: handleMouseEnter,
    onMouseMove: handleMouseMove,
    onMouseLeave: handleMouseLeave,
  };

  return (
    <>
      {as === 'span' ? (
        <span {...wrapperProps}>{children}</span>
      ) : (
        <div {...wrapperProps}>{children}</div>
      )}
      {mounted &&
        visible &&
        createPortal(
          <div
            style={style}
            className="rounded-lg border border-border bg-surface px-3 py-2 shadow-xl ring-1 ring-black/5"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wider text-text-primary">
              {title}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-text-secondary">{body}</p>
          </div>,
          document.body,
        )}
    </>
  );
}
