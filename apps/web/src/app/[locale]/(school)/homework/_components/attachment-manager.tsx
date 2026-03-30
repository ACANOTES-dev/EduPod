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
} from '@school/ui';
import { Link as LinkIcon, Paperclip, Plus, Video, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Attachment {
  id?: string;
  attachment_type: 'file' | 'link' | 'video';
  file_name?: string;
  url?: string;
  display_order?: number;
}

interface AttachmentManagerProps {
  attachments: Attachment[];
  onAdd: (attachment: Omit<Attachment, 'id'>) => void;
  onRemove: (index: number) => void;
  disabled?: boolean;
}

// ─── Icons ────────────────────────────────────────────────────────────────────

const TYPE_ICON: Record<string, React.ReactNode> = {
  file: <Paperclip className="h-4 w-4" />,
  link: <LinkIcon className="h-4 w-4" />,
  video: <Video className="h-4 w-4" />,
};

// ─── Component ────────────────────────────────────────────────────────────────

export function AttachmentManager({ attachments, onAdd, onRemove, disabled }: AttachmentManagerProps) {
  const t = useTranslations('homework');
  const [open, setOpen] = React.useState(false);
  const [type, setType] = React.useState<'file' | 'link' | 'video'>('link');
  const [value, setValue] = React.useState('');

  const handleAdd = () => {
    if (!value.trim()) return;
    onAdd({
      attachment_type: type,
      ...(type === 'file' ? { file_name: value } : { url: value }),
    });
    setValue('');
    setOpen(false);
  };

  return (
    <div className="space-y-2">
      {attachments.map((a, i) => (
        <div key={i} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
          {TYPE_ICON[a.attachment_type]}
          <span className="flex-1 truncate text-text-primary">{a.file_name ?? a.url ?? ''}</span>
          {!disabled && (
            <button type="button" onClick={() => onRemove(i)} className="text-text-tertiary hover:text-danger-text">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      ))}
      {!disabled && (
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Plus className="me-1 h-4 w-4" />
          {t('addAttachment')}
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('addAttachment')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>{t('attachmentType')}</Label>
              <Select value={type} onValueChange={(v) => setType(v as 'file' | 'link' | 'video')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="file">{t('file')}</SelectItem>
                  <SelectItem value="link">{t('link')}</SelectItem>
                  <SelectItem value="video">{t('video')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{type === 'file' ? t('fileName') : t('url')}</Label>
              <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={type === 'file' ? 'document.pdf' : 'https://...'} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={!value.trim()}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
