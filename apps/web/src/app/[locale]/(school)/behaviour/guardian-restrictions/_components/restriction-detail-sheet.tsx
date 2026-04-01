'use client';

import { Ban } from 'lucide-react';
import * as React from 'react';

import {
  Badge,
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@school/ui';


import { formatDate } from '@/lib/format-date';

import { StatusBadge, TypeBadge } from './restriction-badges';
import { getParentDisplayName } from './restriction-types';
import type { RestrictionRow } from './restriction-types';


// ─── Detail Field ─────────────────────────────────────────────────────────────

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-text-tertiary">{label}</p>
      <p className="mt-0.5 text-sm text-text-primary">{value}</p>
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface RestrictionDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading: boolean;
  data: RestrictionRow | null;
  onRevokeClick: (id: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RestrictionDetailSheet({
  open,
  onOpenChange,
  loading,
  data,
  onRevokeClick,
}: RestrictionDetailSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="end" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Restriction Details</SheetTitle>
          <SheetDescription>View guardian restriction information and history.</SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="mt-8 flex items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : !data ? (
          <div className="mt-8 text-center text-text-tertiary">Restriction not found.</div>
        ) : (
          <div className="mt-6 space-y-6">
            {/* Status + Type */}
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={data.status} />
              <TypeBadge type={data.restriction_type} />
            </div>

            {/* Key Details */}
            <div className="space-y-3 rounded-lg border border-border p-4">
              <DetailField
                label="Student"
                value={
                  data.student ? `${data.student.first_name} ${data.student.last_name}` : '\u2014'
                }
              />
              <DetailField label="Guardian" value={getParentDisplayName(data.parent)} />
              <DetailField label="Reason" value={data.reason} />
              {data.legal_basis && <DetailField label="Legal Basis" value={data.legal_basis} />}
              <DetailField label="Effective From" value={formatDate(data.effective_from)} />
              <DetailField
                label="Effective Until"
                value={data.effective_until ? formatDate(data.effective_until) : 'Indefinite'}
              />
              {data.review_date && (
                <DetailField label="Review Date" value={formatDate(data.review_date)} />
              )}
              {data.set_by && (
                <DetailField
                  label="Set By"
                  value={`${data.set_by.first_name} ${data.set_by.last_name}`}
                />
              )}
              {data.approved_by && (
                <DetailField
                  label="Approved By"
                  value={`${data.approved_by.first_name} ${data.approved_by.last_name}`}
                />
              )}
              <DetailField label="Created" value={formatDate(data.created_at)} />
            </div>

            {/* Revoke info if revoked */}
            {data.status === 'revoked' && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Revoked</p>
                {data.revoked_by && (
                  <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
                    By: {data.revoked_by.first_name} {data.revoked_by.last_name}
                  </p>
                )}
                {data.revoked_at && (
                  <p className="text-sm text-amber-700 dark:text-amber-400">
                    Date: {formatDate(data.revoked_at)}
                  </p>
                )}
                {data.revoke_reason && (
                  <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
                    Reason: {data.revoke_reason}
                  </p>
                )}
              </div>
            )}

            {/* History */}
            {data.history && data.history.length > 0 && (
              <div>
                <h4 className="mb-3 text-sm font-medium text-text-primary">History</h4>
                <div className="space-y-2">
                  {data.history.map((entry) => (
                    <div key={entry.id} className="rounded-lg border border-border p-3">
                      <div className="flex items-center justify-between">
                        <Badge variant="secondary" className="text-xs capitalize">
                          {entry.action}
                        </Badge>
                        <span className="text-xs text-text-tertiary">
                          {formatDate(entry.created_at)}
                        </span>
                      </div>
                      {entry.reason && (
                        <p className="mt-1 text-sm text-text-secondary">{entry.reason}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Revoke button if active */}
            {(data.status === 'active_restriction' || data.status === 'active') && (
              <Button
                variant="outline"
                className="w-full text-red-600 hover:text-red-700"
                onClick={() => onRevokeClick(data.id)}
              >
                <Ban className="me-1.5 h-4 w-4" />
                Revoke Restriction
              </Button>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
