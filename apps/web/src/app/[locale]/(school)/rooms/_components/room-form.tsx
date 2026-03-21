'use client';

import {
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
} from '@school/ui';
import { useTranslations } from 'next-intl';
import * as React from 'react';


// ─── Types ────────────────────────────────────────────────────────────────────

interface RoomFormData {
  name: string;
  room_type: string;
  capacity: number | null;
  is_exclusive: boolean;
}

interface RoomFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: RoomFormData) => Promise<void>;
  initialData?: RoomFormData;
  isEdit?: boolean;
}

const ROOM_TYPES = ['classroom', 'lab', 'library', 'hall', 'gym', 'office', 'other'];

// ─── Component ────────────────────────────────────────────────────────────────

export function RoomForm({ open, onOpenChange, onSubmit, initialData, isEdit }: RoomFormProps) {
  const t = useTranslations('scheduling');
  const tc = useTranslations('common');

  const [name, setName] = React.useState(initialData?.name ?? '');
  const [roomType, setRoomType] = React.useState(initialData?.room_type ?? 'classroom');
  const [capacity, setCapacity] = React.useState<string>(
    initialData?.capacity != null ? String(initialData.capacity) : ''
  );
  const [isExclusive, setIsExclusive] = React.useState(initialData?.is_exclusive ?? false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setName(initialData?.name ?? '');
      setRoomType(initialData?.room_type ?? 'classroom');
      setCapacity(initialData?.capacity != null ? String(initialData.capacity) : '');
      setIsExclusive(initialData?.is_exclusive ?? false);
    }
  }, [open, initialData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSubmit({
        name: name.trim(),
        room_type: roomType,
        capacity: capacity ? parseInt(capacity, 10) : null,
        is_exclusive: isExclusive,
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? t('editRoom') : t('createRoom')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="room-name">{t('roomName')}</Label>
            <Input
              id="room-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="room-type">{t('roomType')}</Label>
            <Select value={roomType} onValueChange={setRoomType}>
              <SelectTrigger id="room-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROOM_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="room-capacity">{t('capacity')}</Label>
            <Input
              id="room-capacity"
              type="number"
              min={0}
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="room-exclusive">{t('exclusive')}</Label>
            <Switch
              id="room-exclusive"
              checked={isExclusive}
              onCheckedChange={setIsExclusive}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tc('cancel')}
            </Button>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving ? tc('loading') : tc('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
