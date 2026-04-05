'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import * as React from 'react';

import { Skeleton } from '@school/ui';
import { StatusBadge } from '@school/ui';

import { apiClient } from '@/lib/api-client';

interface PreviewData {
  primary_label: string;
  secondary_label?: string;
  status?: { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral' };
  facts?: { label: string; value: string }[];
}

interface HoverPreviewCardProps {
  entityType: string;
  entityId: string;
  children: React.ReactNode;
}

export function HoverPreviewCard({ entityType, entityId, children }: HoverPreviewCardProps) {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PreviewData | null>(null);
  const [position, setPosition] = useState({ top: 0, left: 0, isRtl: false });

  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLSpanElement>(null);
  const fetchedRef = useRef(false);

  const fetchPreview = useCallback(async () => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    setLoading(true);
    try {
      const res = await apiClient<{ data: PreviewData }>(
        `/api/v1/${entityType}s/${entityId}/preview`,
      );
      setData(res.data);
    } catch (err) {
      // silently fail — card just won't show rich data
      console.error('[setData]', err);
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  const handleMouseEnter = useCallback(
    (e: React.MouseEvent<HTMLSpanElement>) => {
      // No-op on touch devices
      if (window.matchMedia('(hover: none)').matches) return;

      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }

      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const isRtl = document.documentElement.dir === 'rtl';
      setPosition({
        top: rect.bottom + window.scrollY + 4,
        left: isRtl ? window.innerWidth - rect.right + window.scrollX : rect.left + window.scrollX,
        isRtl,
      });

      showTimerRef.current = setTimeout(() => {
        setVisible(true);
        void fetchPreview();
      }, 300);
    },
    [fetchPreview],
  );

  const handleMouseLeave = useCallback(() => {
    if (showTimerRef.current) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
    hideTimerRef.current = setTimeout(() => {
      setVisible(false);
    }, 150);
  }, []);

  useEffect(() => {
    return () => {
      if (showTimerRef.current) clearTimeout(showTimerRef.current);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  const showSkeleton = visible && (loading || !data);

  return (
    <span
      ref={containerRef}
      className="relative inline-block"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}

      {visible && (
        <div
          className="fixed z-50 w-64 rounded-xl border border-border bg-surface p-4 shadow-lg"
          style={
            position.isRtl
              ? { top: position.top, right: position.left }
              : { top: position.top, left: position.left }
          }
          onMouseEnter={() => {
            if (hideTimerRef.current) {
              clearTimeout(hideTimerRef.current);
              hideTimerRef.current = null;
            }
          }}
          onMouseLeave={handleMouseLeave}
        >
          {showSkeleton ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-3 w-full" />
            </div>
          ) : data ? (
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-semibold text-text-primary">
                  {data.primary_label}
                </span>
                {data.status && (
                  <StatusBadge status={data.status.variant}>{data.status.label}</StatusBadge>
                )}
              </div>
              {data.secondary_label && (
                <p className="text-xs text-text-secondary">{data.secondary_label}</p>
              )}
              {data.facts && data.facts.length > 0 && (
                <dl className="mt-2 space-y-1 border-t border-border pt-2">
                  {data.facts.map((fact) => (
                    <div key={fact.label} className="flex items-center justify-between gap-2">
                      <dt className="text-xs text-text-tertiary">{fact.label}</dt>
                      <dd className="text-xs font-medium text-text-primary">{fact.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          ) : null}
        </div>
      )}
    </span>
  );
}
