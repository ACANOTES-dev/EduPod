'use client';

import { AlertCircle, FileText, Loader2, Paperclip, UploadCloud, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  ALLOWED_ATTACHMENT_MIME_TYPES,
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_ATTACHMENT_BYTES,
  type AttachmentInput,
} from '@school/shared/inbox';
import { Button, cn, toast } from '@school/ui';

import { getAccessToken } from '@/lib/api-client';

/**
 * AttachmentUploader — drag-drop + click-to-browse for inbox message
 * attachments. Posts each file to `POST /v1/inbox/attachments` (the
 * multipart endpoint added in this impl), which uploads to S3 under
 * the tenant namespace and returns the canonical `AttachmentInput`
 * shape. Client-side limits mirror the backend Zod schema from impl 04.
 */

interface Props {
  value: AttachmentInput[];
  onChange: (value: AttachmentInput[]) => void;
  disabled?: boolean;
}

type PendingUpload = {
  id: string;
  filename: string;
  size_bytes: number;
  state: 'uploading' | 'error';
  error?: string;
};

export function AttachmentUploader({ value, onChange, disabled }: Props) {
  const t = useTranslations();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [pending, setPending] = React.useState<PendingUpload[]>([]);
  const [isDragging, setIsDragging] = React.useState(false);

  const effectiveCount = value.length + pending.filter((p) => p.state === 'uploading').length;
  const canAddMore = effectiveCount < MAX_ATTACHMENTS_PER_MESSAGE;

  const handleFiles = React.useCallback(
    async (files: FileList | File[]) => {
      if (disabled) return;
      const list = Array.from(files);
      const currentCount = value.length + pending.filter((p) => p.state === 'uploading').length;
      const remaining = MAX_ATTACHMENTS_PER_MESSAGE - currentCount;
      if (remaining <= 0) {
        toast.error(t('inbox.attachmentUploader.tooMany', { max: MAX_ATTACHMENTS_PER_MESSAGE }));
        return;
      }
      const accepted = list.slice(0, remaining);

      for (const file of accepted) {
        const localId = `${file.name}-${file.size}-${Date.now()}-${Math.random()}`;
        if (!isAllowedMime(file.type)) {
          toast.error(
            t('inbox.attachmentUploader.disallowedType', { filename: file.name, mime: file.type }),
          );
          continue;
        }
        if (file.size > MAX_ATTACHMENT_BYTES) {
          toast.error(t('inbox.attachmentUploader.tooLarge', { filename: file.name }));
          continue;
        }
        setPending((prev) => [
          ...prev,
          { id: localId, filename: file.name, size_bytes: file.size, state: 'uploading' },
        ]);
        try {
          const uploaded = await uploadAttachment(file);
          onChange([...value, uploaded]);
          setPending((prev) => prev.filter((p) => p.id !== localId));
        } catch (err) {
          console.error('[attachment-uploader.upload]', err);
          const message = err instanceof Error ? err.message : t('inbox.attachmentUploader.error');
          toast.error(`"${file.name}" — ${message}`);
          setPending((prev) =>
            prev.map((p) => (p.id === localId ? { ...p, state: 'error', error: message } : p)),
          );
        }
      }
    },
    [value, onChange, pending, disabled, t],
  );

  const removeExisting = (storageKey: string) => {
    onChange(value.filter((v) => v.storage_key !== storageKey));
  };
  const removePending = (id: string) => {
    setPending((prev) => prev.filter((p) => p.id !== id));
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      void handleFiles(e.dataTransfer.files);
    }
  };

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={cn(
          'flex items-center justify-between gap-3 rounded-lg border border-dashed border-border bg-surface p-3 text-sm transition',
          isDragging && 'border-primary bg-primary/5',
          !canAddMore && 'opacity-60',
        )}
      >
        <div className="flex items-center gap-2 text-text-tertiary">
          <UploadCloud className="h-4 w-4" />
          <span>
            {t('inbox.attachmentUploader.dropHint')} ·{' '}
            <span className="text-text-secondary">
              {effectiveCount}/{MAX_ATTACHMENTS_PER_MESSAGE}
            </span>
          </span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled || !canAddMore}
          onClick={() => inputRef.current?.click()}
        >
          <Paperclip className="me-1 h-4 w-4" />
          {t('inbox.attachmentUploader.addFiles')}
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ALLOWED_ATTACHMENT_MIME_TYPES.join(',')}
          onChange={(e) => {
            if (e.target.files) void handleFiles(e.target.files);
            e.target.value = '';
          }}
          className="hidden"
        />
      </div>
      {(value.length > 0 || pending.length > 0) && (
        <ul className="space-y-1.5">
          {value.map((att) => (
            <li
              key={att.storage_key}
              className="flex items-center gap-2 rounded-md border border-border bg-surface p-2 text-sm"
            >
              <FileText className="h-4 w-4 text-text-tertiary" />
              <span className="flex-1 truncate">{att.filename}</span>
              <span className="text-xs text-text-tertiary">{formatBytes(att.size_bytes)}</span>
              <button
                type="button"
                aria-label={t('inbox.attachmentUploader.removeAria', { filename: att.filename })}
                onClick={() => removeExisting(att.storage_key)}
                className="rounded p-1 text-text-tertiary hover:bg-background/40"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
          {pending.map((p) => (
            <li
              key={p.id}
              className={cn(
                'flex items-center gap-2 rounded-md border p-2 text-sm',
                p.state === 'error'
                  ? 'border-destructive/40 bg-destructive/5'
                  : 'border-border bg-surface',
              )}
            >
              {p.state === 'uploading' ? (
                <Loader2 className="h-4 w-4 animate-spin text-text-tertiary" />
              ) : (
                <AlertCircle className="h-4 w-4 text-destructive" />
              )}
              <span className="flex-1 truncate">{p.filename}</span>
              <span className="text-xs text-text-tertiary">
                {p.state === 'error'
                  ? (p.error ?? t('inbox.attachmentUploader.error'))
                  : t('inbox.attachmentUploader.uploading')}
              </span>
              <button
                type="button"
                aria-label={t('inbox.attachmentUploader.cancelAria', { filename: p.filename })}
                onClick={() => removePending(p.id)}
                className="rounded p-1 text-text-tertiary hover:bg-background/40"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function isAllowedMime(mime: string): boolean {
  return (ALLOWED_ATTACHMENT_MIME_TYPES as readonly string[]).includes(mime);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function uploadAttachment(file: File): Promise<AttachmentInput> {
  const formData = new FormData();
  formData.append('file', file);
  const token = getAccessToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
  const response = await fetch(`${apiUrl}/api/v1/inbox/attachments`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
    headers,
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    const message = body?.error?.message ?? `Upload failed (${response.status})`;
    throw new Error(message);
  }
  const payload = (await response.json()) as AttachmentInput | { data: AttachmentInput } | null;
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: AttachmentInput }).data;
  }
  return payload as AttachmentInput;
}
