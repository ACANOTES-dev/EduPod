'use client';

import * as React from 'react';

import {
  Button,
  Label,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Textarea,
} from '@school/ui';

import { apiClient } from '@/lib/api-client';

// ─── Props ────────────────────────────────────────────────────────────────────

interface RevokeRestrictionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  revokeId: string | null;
  onRevoked: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RevokeRestrictionSheet({
  open,
  onOpenChange,
  revokeId,
  onRevoked,
}: RevokeRestrictionSheetProps) {
  const [revokeReason, setRevokeReason] = React.useState('');
  const [revoking, setRevoking] = React.useState(false);

  // Reset reason when sheet closes
  React.useEffect(() => {
    if (!open) setRevokeReason('');
  }, [open]);

  async function handleRevoke() {
    if (!revokeId || !revokeReason) return;
    setRevoking(true);
    try {
      await apiClient(`/api/v1/behaviour/guardian-restrictions/${revokeId}/revoke`, {
        method: 'POST',
        body: JSON.stringify({ reason: revokeReason }),
      });
      onOpenChange(false);
      setRevokeReason('');
      onRevoked();
    } catch (err) {
      console.error('[RevokeRestrictionSheet]', err);
    } finally {
      setRevoking(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="end" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Revoke Restriction</SheetTitle>
          <SheetDescription>
            Provide a reason for revoking this guardian restriction.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label>Reason for Revocation *</Label>
            <Textarea
              value={revokeReason}
              onChange={(e) => setRevokeReason(e.target.value)}
              placeholder="Explain why this restriction is being revoked..."
              rows={4}
              className="text-base sm:text-sm"
            />
          </div>
        </div>

        <SheetFooter className="mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={revoking}>
            Cancel
          </Button>
          <Button
            variant="default"
            onClick={() => void handleRevoke()}
            disabled={!revokeReason.trim() || revoking}
            className="bg-red-600 text-white hover:bg-red-700"
          >
            {revoking ? 'Revoking...' : 'Revoke Restriction'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
