'use client';

import { ImageIcon, Trash2, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, toast } from '@school/ui';

import { getAccessToken } from '@/lib/api-client';

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB — must match backend

interface SignatureUploadProps {
  hasSignature: boolean;
  signatureUrl: string | null;
  principalName: string;
  onUploaded: () => Promise<void> | void;
  onRemoved: () => Promise<void> | void;
  disabled?: boolean;
}

// ─── Signature upload component ──────────────────────────────────────────────

export function SignatureUpload({
  hasSignature,
  signatureUrl,
  principalName,
  onUploaded,
  onRemoved,
  disabled = false,
}: SignatureUploadProps) {
  const t = useTranslations('reportCards.settings');
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [removing, setRemoving] = React.useState(false);
  const [previewDataUrl, setPreviewDataUrl] = React.useState<string | null>(null);

  const handlePickFile = React.useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleFileChange = React.useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!ACCEPTED_TYPES.includes(file.type)) {
        toast.error(t('fileWrongType'));
        e.target.value = '';
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        toast.error(t('fileTooLarge'));
        e.target.value = '';
        return;
      }

      // Local preview so the user can visually confirm what's being uploaded.
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') setPreviewDataUrl(reader.result);
      };
      reader.readAsDataURL(file);

      setUploading(true);
      try {
        const formData = new FormData();
        formData.append('file', file);
        if (principalName) {
          formData.append('principal_name', principalName);
        }

        const token = getAccessToken();
        const res = await fetch('/api/v1/report-card-tenant-settings/principal-signature', {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData,
          credentials: 'include',
        });

        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { message?: string } | null;
          throw new Error(body?.message ?? t('signatureUploadFailed'));
        }

        toast.success(t('signatureUploaded'));
        await onUploaded();
      } catch (err) {
        const message =
          err instanceof Error && err.message ? err.message : t('signatureUploadFailed');
        console.error('[SignatureUpload.upload]', err);
        toast.error(message);
        setPreviewDataUrl(null);
      } finally {
        setUploading(false);
        if (inputRef.current) inputRef.current.value = '';
      }
    },
    [onUploaded, principalName, t],
  );

  const handleRemove = React.useCallback(async () => {
    setRemoving(true);
    try {
      const token = getAccessToken();
      const res = await fetch('/api/v1/report-card-tenant-settings/principal-signature', {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error(t('signatureRemoveFailed'));
      }
      toast.success(t('signatureRemoved'));
      setPreviewDataUrl(null);
      await onRemoved();
    } catch (err) {
      console.error('[SignatureUpload.remove]', err);
      toast.error(t('signatureRemoveFailed'));
    } finally {
      setRemoving(false);
    }
  }, [onRemoved, t]);

  const displayedUrl = previewDataUrl ?? signatureUrl;

  return (
    <div className="space-y-3">
      <div className="flex h-36 w-full max-w-sm items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-border bg-surface-secondary/40">
        {displayedUrl ? (
          // Plain img — the signed URL returns a user-uploaded image that
          // Next's Image optimizer isn't configured for.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={displayedUrl}
            alt={t('principalSignature')}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-text-tertiary">
            <ImageIcon className="h-8 w-8" />
            <span className="text-xs">{hasSignature ? '...' : t('noSignature')}</span>
          </div>
        )}
      </div>

      <p className="text-xs text-text-tertiary">{t('principalSignatureHint')}</p>

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(',')}
          onChange={(e) => void handleFileChange(e)}
          className="hidden"
          disabled={disabled || uploading}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handlePickFile}
          disabled={disabled || uploading}
        >
          <Upload className="me-1.5 h-4 w-4" />
          {hasSignature ? t('replaceSignature') : t('uploadSignature')}
        </Button>
        {hasSignature ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void handleRemove()}
            disabled={disabled || removing}
          >
            <Trash2 className="me-1.5 h-4 w-4" />
            {t('removeSignature')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
