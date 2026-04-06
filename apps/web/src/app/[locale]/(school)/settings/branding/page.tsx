'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, Input, Label, toast } from '@school/ui';

import { apiClient, getAccessToken } from '@/lib/api-client';

interface BrandingData {
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
}

interface BrandingApiResponse {
  logo_url?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
}

export default function BrandingPage() {
  const t = useTranslations('settings');

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);

  const [primaryColor, setPrimaryColor] = React.useState('#1a56db');
  const [secondaryColor, setSecondaryColor] = React.useState('#6b7280');
  const [logoUrl, setLogoUrl] = React.useState<string | null>(null);

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    async function fetchBranding() {
      try {
        const data = await apiClient<BrandingApiResponse>('/api/v1/branding');
        if (data.primary_color) setPrimaryColor(data.primary_color);
        if (data.secondary_color) setSecondaryColor(data.secondary_color);
        if (data.logo_url) setLogoUrl(data.logo_url);
      } catch (err) {
        // Branding may not exist yet — that's fine, use defaults
        console.error('[data]', err);
      } finally {
        setLoading(false);
      }
    }
    void fetchBranding();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiClient<BrandingData>('/api/v1/branding', {
        method: 'PATCH',
        body: JSON.stringify({
          primary_colour: primaryColor,
          secondary_colour: secondaryColor,
        }),
      });
      toast.success(t('brandingSaved'));
    } catch (err: unknown) {
      const errorObj = err as { error?: { message?: string } };
      toast.error(errorObj?.error?.message ?? t('saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const uploadHeaders: Record<string, string> = {};
      const token = getAccessToken();
      if (token) {
        uploadHeaders['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? ''}/api/v1/branding/logo`,
        {
          method: 'POST',
          body: formData,
          credentials: 'include',
          headers: uploadHeaders,
          // Content-Type is intentionally omitted — browser sets it with the multipart boundary
        },
      );

      if (!response.ok) {
        const errData = await response
          .json()
          .catch(() => ({ error: { message: 'Upload failed' } }));
        throw errData;
      }

      const result = (await response.json()) as BrandingApiResponse;
      if (result.logo_url) setLogoUrl(result.logo_url);
      toast.success(t('logoUploaded'));
    } catch (err: unknown) {
      const errorObj = err as { error?: { message?: string } };
      toast.error(errorObj?.error?.message ?? t('uploadFailed'));
    } finally {
      setUploading(false);
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-200 border-t-primary-700" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <h2 className="text-lg font-semibold text-text-primary">{t('branding')}</h2>
      <p className="mt-1 text-sm text-text-secondary">{t('brandingDescription')}</p>

      {/* Logo section */}
      <div className="mt-6 rounded-2xl border border-border bg-surface p-6">
        <h3 className="text-sm font-semibold text-text-primary">{t('logo')}</h3>
        <p className="mt-1 text-xs text-text-tertiary">{t('logoHint')}</p>

        <div className="mt-4 flex flex-wrap items-center gap-4">
          {/* Logo preview */}
          <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-border bg-surface-secondary">
            {logoUrl ? (
              <Image
                src={logoUrl}
                alt={t('logo')}
                width={64}
                height={64}
                className="h-full w-full rounded-xl object-contain"
                unoptimized
              />
            ) : (
              <span className="text-xs text-text-tertiary">{t('noLogo')}</span>
            )}
          </div>

          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? t('uploading') : t('uploadLogo')}
            </Button>
            <p className="mt-1 text-xs text-text-tertiary">{t('logoFormats')}</p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".png,.jpg,.jpeg,.svg,.webp"
            className="hidden"
            onChange={handleLogoUpload}
          />
        </div>
      </div>

      {/* Colors section */}
      <form onSubmit={handleSave} className="mt-4 rounded-2xl border border-border bg-surface p-6">
        <h3 className="text-sm font-semibold text-text-primary">{t('colours')}</h3>
        <p className="mt-1 text-xs text-text-tertiary">{t('coloursDescription')}</p>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Primary colour */}
          <div className="space-y-2">
            <Label htmlFor="primary-color">{t('primaryColour')}</Label>
            <div className="flex items-center gap-3">
              <input
                id="primary-color"
                type="color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="h-10 w-12 cursor-pointer rounded-lg border border-border bg-transparent p-0.5"
              />
              <Input
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                placeholder={t('1a56db')}
                className="font-mono"
                aria-label={t('primaryColourHex')}
              />
            </div>
          </div>

          {/* Secondary colour */}
          <div className="space-y-2">
            <Label htmlFor="secondary-color">{t('secondaryColour')}</Label>
            <div className="flex items-center gap-3">
              <input
                id="secondary-color"
                type="color"
                value={secondaryColor}
                onChange={(e) => setSecondaryColor(e.target.value)}
                className="h-10 w-12 cursor-pointer rounded-lg border border-border bg-transparent p-0.5"
              />
              <Input
                value={secondaryColor}
                onChange={(e) => setSecondaryColor(e.target.value)}
                placeholder={t('6b7280')}
                className="font-mono"
                aria-label={t('secondaryColourHex')}
              />
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <Button type="submit" disabled={saving}>
            {saving ? t('saving') : t('saveChanges')}
          </Button>
        </div>
      </form>
    </div>
  );
}
