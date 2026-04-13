/* eslint-disable school/no-hand-rolled-forms -- wizard with dynamic rows, not suited for react-hook-form */
'use client';

import { Minus, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  toast,
} from '@school/ui';

import { apiClient } from '@/lib/api-client';

// ─── Constants ────────────────────────────────────────────────────────────────

const ROOM_TYPES = [
  'classroom',
  'lab',
  'science_lab',
  'computer_lab',
  'art_room',
  'music_room',
  'library',
  'gym',
  'auditorium',
  'wood_workshop',
  'outdoor_yard',
  'indoor_yard',
  'outdoor',
  'other',
] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

interface CapacitySplit {
  id: string;
  count: number;
  capacity: number;
}

interface WizardEntry {
  id: string;
  roomType: string;
  quantity: number;
  isExclusive: boolean;
  capacitySplits: CapacitySplit[];
}

interface RoomWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

let nextId = 1;
function uid(): string {
  return `wiz-${nextId++}`;
}

function padNumber(n: number, length: number): string {
  return String(n).padStart(length, '0');
}

function getRoomPrefix(roomType: string, t: ReturnType<typeof useTranslations>): string {
  return t(`roomTypeLabels.${roomType}`);
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RoomWizard({ open, onOpenChange, onComplete }: RoomWizardProps) {
  const t = useTranslations('scheduling');
  const tc = useTranslations('common');

  const [entries, setEntries] = React.useState<WizardEntry[]>([]);
  const [saving, setSaving] = React.useState(false);

  // Reset on open
  React.useEffect(() => {
    if (open) {
      setEntries([
        {
          id: uid(),
          roomType: 'classroom',
          quantity: 1,
          isExclusive: true,
          capacitySplits: [],
        },
      ]);
    }
  }, [open]);

  // ─── Entry manipulation ───────────────────────────────────────────────────

  const addEntry = () => {
    // Find a room type not already in use
    const usedTypes = new Set(entries.map((e) => e.roomType));
    const availableType = ROOM_TYPES.find((rt) => !usedTypes.has(rt)) ?? 'classroom';
    setEntries((prev) => [
      ...prev,
      {
        id: uid(),
        roomType: availableType,
        quantity: 1,
        isExclusive: true,
        capacitySplits: [],
      },
    ]);
  };

  const removeEntry = (entryId: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== entryId));
  };

  const updateEntry = (entryId: string, patch: Partial<WizardEntry>) => {
    setEntries((prev) => prev.map((e) => (e.id === entryId ? { ...e, ...patch } : e)));
  };

  // ─── Capacity split manipulation ─────────────────────────────────────────

  const addSplit = (entryId: string) => {
    setEntries((prev) =>
      prev.map((e) => {
        if (e.id !== entryId) return e;
        const assigned = e.capacitySplits.reduce((sum, s) => sum + s.count, 0);
        const remaining = Math.max(1, e.quantity - assigned);
        return {
          ...e,
          capacitySplits: [...e.capacitySplits, { id: uid(), count: remaining, capacity: 20 }],
        };
      }),
    );
  };

  const removeSplit = (entryId: string, splitId: string) => {
    setEntries((prev) =>
      prev.map((e) => {
        if (e.id !== entryId) return e;
        return {
          ...e,
          capacitySplits: e.capacitySplits.filter((s) => s.id !== splitId),
        };
      }),
    );
  };

  const updateSplit = (entryId: string, splitId: string, patch: Partial<CapacitySplit>) => {
    setEntries((prev) =>
      prev.map((e) => {
        if (e.id !== entryId) return e;
        return {
          ...e,
          capacitySplits: e.capacitySplits.map((s) => (s.id === splitId ? { ...s, ...patch } : s)),
        };
      }),
    );
  };

  // ─── Validation ───────────────────────────────────────────────────────────

  const getAssignedCount = (entry: WizardEntry) =>
    entry.capacitySplits.reduce((sum, s) => sum + s.count, 0);

  const getRemainingCount = (entry: WizardEntry) => entry.quantity - getAssignedCount(entry);

  const isValid = React.useMemo(() => {
    if (entries.length === 0) return false;
    return entries.every((e) => {
      if (e.quantity < 1) return false;
      if (e.capacitySplits.length > 0) {
        const assigned = getAssignedCount(e);
        if (assigned !== e.quantity) return false;
        if (e.capacitySplits.some((s) => s.count < 1 || s.capacity < 1)) return false;
      }
      return true;
    });
  }, [entries]);

  // ─── Total preview ────────────────────────────────────────────────────────

  const totalRooms = entries.reduce((sum, e) => sum + e.quantity, 0);

  // ─── Generate rooms ───────────────────────────────────────────────────────

  const handleGenerate = async () => {
    setSaving(true);
    try {
      // Build the flat rooms array
      const rooms: Array<{
        name: string;
        room_type: string;
        capacity: number | null;
        is_exclusive: boolean;
      }> = [];

      for (const entry of entries) {
        const prefix = getRoomPrefix(entry.roomType, t);
        const padLen = entry.quantity >= 100 ? 3 : 2;
        let roomIndex = 1;

        if (entry.capacitySplits.length > 0) {
          // Generate rooms using capacity splits
          for (const split of entry.capacitySplits) {
            for (let i = 0; i < split.count; i++) {
              rooms.push({
                name: `${prefix} ${padNumber(roomIndex, padLen)}`,
                room_type: entry.roomType,
                capacity: split.capacity,
                is_exclusive: entry.isExclusive,
              });
              roomIndex++;
            }
          }
        } else {
          // All rooms with no specific capacity
          for (let i = 0; i < entry.quantity; i++) {
            rooms.push({
              name: `${prefix} ${padNumber(roomIndex, padLen)}`,
              room_type: entry.roomType,
              capacity: null,
              is_exclusive: entry.isExclusive,
            });
            roomIndex++;
          }
        }
      }

      const res = await apiClient<{ data: { created: number } }>('/api/v1/rooms/bulk', {
        method: 'POST',
        body: JSON.stringify({ rooms }),
      });

      toast.success(t('roomsGenerated', { count: res.data.created }));
      onOpenChange(false);
      onComplete();
    } catch (err) {
      console.error('[RoomWizard]', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary-600" />
            {t('roomWizardTitle')}
          </DialogTitle>
          <p className="text-sm text-text-secondary">{t('roomWizardDescription')}</p>
        </DialogHeader>

        <div className="space-y-4">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="relative rounded-xl border border-border bg-surface-secondary/50 p-4"
            >
              {/* Remove entry button */}
              {entries.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeEntry(entry.id)}
                  className="absolute end-3 top-3 rounded-md p-1 text-text-tertiary transition-colors hover:bg-danger-bg hover:text-danger-text"
                  aria-label={tc('delete')}
                >
                  <X className="h-4 w-4" />
                </button>
              )}

              {/* Row 1: Room type + quantity + exclusive */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_100px_auto]">
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('roomType')}</Label>
                  <Select
                    value={entry.roomType}
                    onValueChange={(v) => updateEntry(entry.id, { roomType: v })}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROOM_TYPES.map((rt) => (
                        <SelectItem key={rt} value={rt}>
                          {t(`roomTypeLabels.${rt}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">{t('quantity')}</Label>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 shrink-0"
                      disabled={entry.quantity <= 1}
                      onClick={() =>
                        updateEntry(entry.id, { quantity: Math.max(1, entry.quantity - 1) })
                      }
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      value={entry.quantity}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        if (!isNaN(val) && val >= 1 && val <= 100) {
                          updateEntry(entry.id, { quantity: val });
                        }
                      }}
                      className="h-9 w-full text-center text-base sm:w-14"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 shrink-0"
                      disabled={entry.quantity >= 100}
                      onClick={() =>
                        updateEntry(entry.id, { quantity: Math.min(100, entry.quantity + 1) })
                      }
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                <div className="flex items-end gap-2 pb-0.5">
                  <div className="flex items-center gap-2">
                    <Switch
                      id={`exclusive-${entry.id}`}
                      checked={entry.isExclusive}
                      onCheckedChange={(v) => updateEntry(entry.id, { isExclusive: v })}
                    />
                    <Label htmlFor={`exclusive-${entry.id}`} className="text-xs whitespace-nowrap">
                      {t('exclusive')}
                    </Label>
                  </div>
                </div>
              </div>

              {/* Capacity Splits Section */}
              <div className="mt-3 border-t border-border/50 pt-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium text-text-secondary">
                    {t('capacitySplits')}
                  </Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => addSplit(entry.id)}
                    disabled={entry.capacitySplits.length > 0 && getRemainingCount(entry) <= 0}
                  >
                    <Plus className="me-1 h-3 w-3" />
                    {t('addCapacitySplit')}
                  </Button>
                </div>

                {entry.capacitySplits.length === 0 ? (
                  <p className="mt-1 text-xs text-text-tertiary">{t('capacity')}: —</p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {entry.capacitySplits.map((split) => (
                      <div
                        key={split.id}
                        className="flex items-center gap-2 rounded-lg bg-surface p-2"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              min={1}
                              max={entry.quantity}
                              value={split.count}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                if (!isNaN(val) && val >= 1) {
                                  updateSplit(entry.id, split.id, { count: val });
                                }
                              }}
                              className="h-8 w-full text-center text-base sm:w-16"
                            />
                            <span className="shrink-0 text-xs text-text-secondary">×</span>
                            <Input
                              type="number"
                              min={1}
                              value={split.capacity}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                if (!isNaN(val) && val >= 1) {
                                  updateSplit(entry.id, split.id, { capacity: val });
                                }
                              }}
                              className="h-8 w-full text-center text-base sm:w-16"
                            />
                            <span className="shrink-0 text-xs text-text-secondary">
                              {t('capacity').toLowerCase()}
                            </span>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 text-text-tertiary hover:text-danger-text"
                          onClick={() => removeSplit(entry.id, split.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}

                    {/* Remaining indicator */}
                    {(() => {
                      const remaining = getRemainingCount(entry);
                      if (remaining > 0) {
                        return (
                          <p className="text-xs font-medium text-amber-600">
                            {t('remainingRooms', { count: remaining })}
                          </p>
                        );
                      }
                      if (remaining === 0) {
                        return (
                          <p className="text-xs font-medium text-emerald-600">{t('allAssigned')}</p>
                        );
                      }
                      return (
                        <p className="text-xs font-medium text-danger-text">
                          {t('remainingRooms', { count: remaining })}
                        </p>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Add another room type */}
          <Button
            type="button"
            variant="outline"
            className="w-full border-dashed"
            onClick={addEntry}
          >
            <Plus className="me-2 h-4 w-4" />
            {t('addRoomType')}
          </Button>
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-sm font-semibold">
              {totalRooms}
            </Badge>
            <span className="text-sm text-text-secondary">{t('totalRooms').toLowerCase()}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tc('cancel')}
            </Button>
            <Button type="button" disabled={saving || !isValid} onClick={handleGenerate}>
              <Sparkles className="me-2 h-4 w-4" />
              {saving ? t('generating') : t('generateRooms')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
