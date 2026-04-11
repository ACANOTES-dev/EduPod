'use client';

import { saveAs } from 'file-saver';
import { Copy, Download, RefreshCcw } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { QRCodeCanvas } from 'qrcode.react';
import * as React from 'react';

import { Button, toast } from '@school/ui';

import { DynamicFormRenderer } from '@/components/admissions/dynamic-form-renderer';
import { PageHeader } from '@/components/page-header';
import { useRoleCheck } from '@/hooks/use-role-check';
import { apiClient, unwrap } from '@/lib/api-client';
import { buildPublicApplyUrl } from '@/lib/public-apply-url';
import { useAuth } from '@/providers/auth-provider';

import { canManageForm } from './form-preview-helpers';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PublishedFormField {
  id: string;
  field_key: string;
  label: string;
  help_text?: string | null;
  field_type: string;
  required: boolean;
  options_json?: Array<{ value: string; label: string }> | null;
  conditional_visibility_json?: {
    depends_on_field_key: string;
    show_when_value: string | string[];
  } | null;
  display_order: number;
}

interface PublishedForm {
  id: string;
  name: string;
  version_number: number;
  fields: PublishedFormField[];
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AdmissionsFormPreviewPage() {
  const { user } = useAuth();
  const { roleKeys } = useRoleCheck();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const tenantSlug = user?.memberships?.[0]?.tenant?.slug ?? '';
  const canManage = React.useMemo(() => canManageForm(roleKeys), [roleKeys]);

  const [form, setForm] = React.useState<PublishedForm | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRebuilding, setIsRebuilding] = React.useState(false);

  const publicUrl = React.useMemo(() => {
    if (!tenantSlug) return '';
    return buildPublicApplyUrl({ tenantSlug, locale });
  }, [tenantSlug, locale]);

  const qrCanvasWrapperRef = React.useRef<HTMLDivElement | null>(null);

  const fetchForm = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiClient<{ data: PublishedForm } | PublishedForm>(
        '/api/v1/admission-forms/system',
      );
      setForm(unwrap(res));
    } catch (err) {
      console.error('[AdmissionsFormPreviewPage.fetchForm]', err);
      toast.error('Failed to load admission form');
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchForm();
  }, [fetchForm]);

  const handleCopyLink = React.useCallback(async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.success('Link copied to clipboard');
    } catch (err) {
      console.error('[AdmissionsFormPreviewPage.copyLink]', err);
      toast.error('Could not copy link');
    }
  }, [publicUrl]);

  const handleDownloadQr = React.useCallback(() => {
    const wrapper = qrCanvasWrapperRef.current;
    if (!wrapper) return;
    const canvas = wrapper.querySelector('canvas');
    if (!canvas) {
      toast.error('QR code not ready');
      return;
    }
    canvas.toBlob((blob) => {
      if (!blob) {
        toast.error('Could not export QR code');
        return;
      }
      const filename = `admission-form-${tenantSlug || 'school'}.png`;
      saveAs(blob, filename);
    }, 'image/png');
  }, [tenantSlug]);

  const handleRebuild = React.useCallback(async () => {
    if (!canManage) return;
    setIsRebuilding(true);
    try {
      await apiClient<unknown>('/api/v1/admission-forms/system/rebuild', { method: 'POST' });
      toast.success('Form rebuilt from the latest wizard field set.');
      await fetchForm();
    } catch (err) {
      console.error('[AdmissionsFormPreviewPage.rebuild]', err);
      const message = (err as { error?: { message?: string } })?.error?.message ?? 'Rebuild failed';
      toast.error(message);
    } finally {
      setIsRebuilding(false);
    }
  }, [canManage, fetchForm]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admission Form"
        description="This is the form parents see when they apply online. It mirrors the walk-in registration wizard — one source of truth."
      />

      {/* ── Public link panel ────────────────────────────────────────────── */}
      <section className="rounded-xl border border-border bg-surface p-6 shadow-sm">
        <div className="mb-4 flex flex-col gap-1">
          <h2 className="text-base font-semibold text-text-primary">Public link</h2>
          <p className="text-sm text-text-secondary">
            Share this URL on posters, your website, or in messages to prospective families.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-[1fr_auto]">
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-surface-secondary px-4 py-3">
              <p className="break-all font-mono text-sm text-text-primary" dir="ltr">
                {publicUrl || 'Resolving tenant slug…'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={handleCopyLink} disabled={!publicUrl}>
                <Copy className="me-2 h-4 w-4" />
                Copy link
              </Button>
              <Button variant="outline" onClick={handleDownloadQr} disabled={!publicUrl}>
                <Download className="me-2 h-4 w-4" />
                Download QR code
              </Button>
            </div>
          </div>

          <div
            ref={qrCanvasWrapperRef}
            className="flex items-center justify-center rounded-lg border border-border bg-surface p-4"
          >
            {publicUrl ? (
              <QRCodeCanvas value={publicUrl} size={224} includeMargin level="M" />
            ) : (
              <div className="h-56 w-56 animate-pulse rounded bg-surface-secondary" />
            )}
          </div>
        </div>
      </section>

      {/* ── Form preview panel ───────────────────────────────────────────── */}
      <section className="rounded-xl border border-border bg-surface p-6 shadow-sm">
        <div className="mb-4 flex flex-col gap-1">
          <h2 className="text-base font-semibold text-text-primary">Form fields</h2>
          <p className="text-sm text-text-secondary">
            Read-only preview of the canonical system form. Fields, labels, and required flags match
            what parents see on the public link above.
          </p>
          {form && (
            <p className="text-xs text-text-tertiary">
              Version {form.version_number} · {form.fields.length} fields
            </p>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-3">
            <div className="h-10 animate-pulse rounded bg-surface-secondary" />
            <div className="h-10 animate-pulse rounded bg-surface-secondary" />
            <div className="h-10 animate-pulse rounded bg-surface-secondary" />
          </div>
        ) : form ? (
          <>
            <DynamicFormRenderer
              fields={form.fields}
              values={{}}
              onChange={() => {
                /* no-op in preview mode */
              }}
              readOnly
            />
            <div className="mt-6 flex justify-end">
              <Button type="button" disabled>
                Submit application
              </Button>
            </div>
          </>
        ) : (
          <p className="py-8 text-center text-sm text-text-tertiary">
            No form is currently available for this tenant.
          </p>
        )}
      </section>

      {/* ── Rebuild panel (admin only) ───────────────────────────────────── */}
      {canManage && (
        <section className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="max-w-xl space-y-1">
              <h2 className="text-base font-semibold text-text-primary">
                Need to refresh the form from the wizard?
              </h2>
              <p className="text-sm text-text-secondary">
                Use this only after the wizard field configuration has changed. Existing
                applications keep their original form reference.
              </p>
            </div>
            <Button variant="outline" onClick={handleRebuild} disabled={isRebuilding}>
              <RefreshCcw className="me-2 h-4 w-4" />
              {isRebuilding ? 'Rebuilding…' : 'Rebuild form'}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
