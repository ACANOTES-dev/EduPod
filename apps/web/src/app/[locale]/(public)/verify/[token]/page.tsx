import { CheckCircle2, ShieldX } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import * as React from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

// ─── Types ────────────────────────────────────────────────────────────────────

interface VerificationResult {
  valid: boolean;
  school_name: string | null;
  student_name: string | null;
  period_name: string | null;
  issued_at: string | null;
  school_logo_url: string | null;
}

// ─── Data fetching ────────────────────────────────────────────────────────────

async function verifyToken(token: string): Promise<VerificationResult | null> {
  try {
    const res = await fetch(`${API_URL}/api/v1/verify/${token}`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    const data = await res.json() as { data: VerificationResult };
    return data.data;
  } catch (err) {
    console.error('[VerifyPage]', err);
    return null;
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

interface PageProps {
  params: { token: string };
}

export default async function VerifyPage({ params }: PageProps) {
  const t = await getTranslations('reportCards');
  const result = await verifyToken(params.token);

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-secondary p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 shadow-lg space-y-6">
        {/* School logo */}
        {result?.school_logo_url && (
          <div className="flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={result.school_logo_url}
              alt={result.school_name ?? 'School logo'}
              className="h-16 w-auto object-contain"
            />
          </div>
        )}

        {result?.valid ? (
          <>
            {/* Valid */}
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success-100">
                <CheckCircle2 className="h-8 w-8 text-success-600" />
              </div>
              <h1 className="text-xl font-bold text-text-primary">
                {t('verificationTitle')}
              </h1>
              <p className="text-sm text-text-secondary">
                {t('verificationSubtitle')}
              </p>
            </div>

            <div className="rounded-xl bg-surface-secondary p-5 space-y-3">
              {result.school_name && (
                <VerifyRow label={t('school')} value={result.school_name} />
              )}
              {result.student_name && (
                <VerifyRow label={t('student')} value={result.student_name} />
              )}
              {result.period_name && (
                <VerifyRow label={t('period')} value={result.period_name} />
              )}
              {result.issued_at && (
                <VerifyRow
                  label={t('issuedAt')}
                  value={new Date(result.issued_at).toLocaleDateString()}
                  mono
                />
              )}
            </div>

            <p className="text-center text-xs text-text-tertiary">
              {t('verificationPrivacyNote')}
            </p>
          </>
        ) : (
          <>
            {/* Invalid */}
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-error-100">
                <ShieldX className="h-8 w-8 text-error-600" />
              </div>
              <h1 className="text-xl font-bold text-text-primary">
                {t('verificationInvalidTitle')}
              </h1>
              <p className="text-sm text-text-secondary">
                {t('verificationInvalidDesc')}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function VerifyRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-xs font-medium uppercase text-text-tertiary shrink-0">{label}</span>
      <span className={`text-sm text-text-primary text-end ${mono ? 'font-mono' : 'font-medium'}`}>
        {value}
      </span>
    </div>
  );
}
