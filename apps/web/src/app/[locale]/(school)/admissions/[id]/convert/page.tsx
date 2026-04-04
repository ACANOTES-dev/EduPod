'use client';

import { ArrowLeft, AlertTriangle, CheckCircle } from 'lucide-react';
import { useRouter, usePathname, useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types (matching backend conversion-preview response) ────────────────────

interface MatchingParent {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
}

interface ConversionPreviewResponse {
  application: {
    id: string;
    application_number: string;
    student_first_name: string;
    student_last_name: string;
    date_of_birth: string | null;
    payload_json: Record<string, unknown>;
    updated_at: string;
  };
  submitted_by_parent: {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
  } | null;
  matching_parents: MatchingParent[];
  year_groups: Array<{ id: string; name: string }>;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ConversionPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const t = useTranslations('admissions');
  const tc = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [preview, setPreview] = React.useState<ConversionPreviewResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);

  // Student fields
  const [studentFirstName, setStudentFirstName] = React.useState('');
  const [studentLastName, setStudentLastName] = React.useState('');
  const [studentDob, setStudentDob] = React.useState('');
  const [yearGroupId, setYearGroupId] = React.useState('');

  // Parent 1 fields
  const [parent1FirstName, setParent1FirstName] = React.useState('');
  const [parent1LastName, setParent1LastName] = React.useState('');
  const [parent1Email, setParent1Email] = React.useState('');
  const [parent1Phone, setParent1Phone] = React.useState('');
  const [parent1LinkId, setParent1LinkId] = React.useState<string | null>(null);

  // Household
  const [householdName, setHouseholdName] = React.useState('');

  React.useEffect(() => {
    if (!id) return;
    apiClient<{ data: ConversionPreviewResponse }>(`/api/v1/applications/${id}/conversion-preview`)
      .then((res) => {
        const d = res.data;
        setPreview(d);

        // Populate student from application
        setStudentFirstName(d.application.student_first_name);
        setStudentLastName(d.application.student_last_name);
        setStudentDob(d.application.date_of_birth?.split('T')[0] ?? '');
        setHouseholdName(`${d.application.student_last_name} Family`);

        // Populate parent 1 from submitted_by_parent or payload
        const payload = d.application.payload_json ?? {};
        if (d.submitted_by_parent) {
          setParent1FirstName(d.submitted_by_parent.first_name);
          setParent1LastName(d.submitted_by_parent.last_name);
          setParent1Email(d.submitted_by_parent.email ?? '');
          setParent1Phone(d.submitted_by_parent.phone ?? '');
        } else {
          // Fallback to payload fields
          setParent1FirstName(
            (payload.parent1_first_name as string) ?? (payload.parent_first_name as string) ?? '',
          );
          setParent1LastName(
            (payload.parent1_last_name as string) ?? (payload.parent_last_name as string) ?? '',
          );
          setParent1Email(
            (payload.parent1_email as string) ?? (payload.parent_email as string) ?? '',
          );
          setParent1Phone(
            (payload.parent1_phone as string) ?? (payload.parent_phone as string) ?? '',
          );
        }
      })
      .catch((err) => { console.error('[AdmissionsConvertPage]', err); return toast.error('Failed to load conversion preview'); })
      .finally(() => setLoading(false));
  }, [id]);

  const handleSubmit = async () => {
    if (!preview) return;
    setSubmitting(true);
    try {
      await apiClient(`/api/v1/applications/${id}/convert`, {
        method: 'POST',
        body: JSON.stringify({
          student_first_name: studentFirstName,
          student_last_name: studentLastName,
          date_of_birth: studentDob,
          year_group_id: yearGroupId,
          parent1_first_name: parent1FirstName,
          parent1_last_name: parent1LastName,
          parent1_email: parent1Email || null,
          parent1_phone: parent1Phone || null,
          parent1_link_existing_id: parent1LinkId,
          household_name: householdName || undefined,
          expected_updated_at: preview.application.updated_at,
        }),
      });
      toast.success(t('conversionSuccess'));
      router.push(`/${locale}/admissions`);
    } catch (err) {
      console.error('[AdmissionsConvertPage]', err);
      toast.error(tc('errorGeneric'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-surface-secondary" />
        <div className="h-64 animate-pulse rounded-xl bg-surface-secondary" />
      </div>
    );
  }

  if (!preview) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" /> {tc('back')}
        </Button>
        <p className="text-sm text-danger-text">{t('failedToLoadConversionData')}</p>
      </div>
    );
  }

  const canSubmit =
    studentFirstName &&
    studentLastName &&
    studentDob &&
    yearGroupId &&
    parent1FirstName &&
    parent1LastName;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('conversionPreview')}
        actions={
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" /> {tc('back')}
          </Button>
        }
      />

      {/* Student section */}
      <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
        <h3 className="mb-4 text-base font-semibold text-text-primary">{t('studentName')}</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t('firstName')}<span className="text-emerald-600">*</span>
            </Label>
            <Input value={studentFirstName} onChange={(e) => setStudentFirstName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('lastName')}<span className="text-emerald-600">*</span>
            </Label>
            <Input value={studentLastName} onChange={(e) => setStudentLastName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>
              {t('dateOfBirth')} <span className="text-emerald-600">*</span>
            </Label>
            <Input
              type="date"
              dir="ltr"
              value={studentDob}
              onChange={(e) => setStudentDob(e.target.value)}
            />
            {!studentDob && (
              <p className="flex items-start gap-1 text-xs text-warning-text">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                {t('dobWarning')}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>
              {t('yearGroup')} <span className="text-emerald-600">*</span>
            </Label>
            <Select value={yearGroupId} onValueChange={setYearGroupId}>
              <SelectTrigger>
                <SelectValue placeholder={t('selectYearGroup')} />
              </SelectTrigger>
              <SelectContent>
                {(preview.year_groups ?? []).map((yg) => (
                  <SelectItem key={yg.id} value={yg.id}>
                    {yg.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Household section */}
      <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
        <h3 className="mb-4 text-base font-semibold text-text-primary">{t('household')}</h3>
        <div className="space-y-1.5">
          <Label>{t('householdName')}</Label>
          <Input value={householdName} onChange={(e) => setHouseholdName(e.target.value)} />
        </div>
      </div>

      {/* Parent 1 section */}
      <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
        <h3 className="mb-4 text-base font-semibold text-text-primary">{t('parent')} 1</h3>

        {/* Parent matching */}
        {preview.matching_parents.length > 0 && (
          <div className="mb-4 space-y-2">
            <p className="flex items-center gap-1.5 text-sm font-medium text-warning-text">
              <AlertTriangle className="h-4 w-4" />
              {t('duplicateWarning')}
            </p>
            <div className="space-y-2 ms-5">
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  id="parent1-new"
                  name="parent1-link"
                  checked={parent1LinkId === null}
                  onChange={() => setParent1LinkId(null)}
                />
                <label htmlFor="parent1-new" className="text-sm text-text-secondary">{t('createNewParentRecord')}</label>
              </div>
              {preview.matching_parents.map((match) => (
                <div key={match.id} className="flex items-center gap-2">
                  <input
                    type="radio"
                    id={`parent1-${match.id}`}
                    name="parent1-link"
                    checked={parent1LinkId === match.id}
                    onChange={() => setParent1LinkId(match.id)}
                  />
                  <label htmlFor={`parent1-${match.id}`} className="text-sm text-text-secondary">{t('linkTo')}{match.first_name} {match.last_name}
                    {match.email && (
                      <span className="ms-1 text-xs text-text-tertiary" dir="ltr">
                        ({match.email})
                      </span>
                    )}
                  </label>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Only show editable fields when creating new parent */}
        {parent1LinkId === null && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t('firstName')}<span className="text-emerald-600">*</span>
              </Label>
              <Input
                value={parent1FirstName}
                onChange={(e) => setParent1FirstName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('lastName')}<span className="text-emerald-600">*</span>
              </Label>
              <Input value={parent1LastName} onChange={(e) => setParent1LastName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('email')}</Label>
              <Input
                type="email"
                dir="ltr"
                value={parent1Email}
                onChange={(e) => setParent1Email(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('phone')}</Label>
              <Input
                type="tel"
                dir="ltr"
                value={parent1Phone}
                onChange={(e) => setParent1Phone(e.target.value)}
              />
            </div>
          </div>
        )}
      </div>

      {/* Submit */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()}>
          {tc('cancel')}
        </Button>
        <Button onClick={handleSubmit} disabled={submitting || !canSubmit}>
          <CheckCircle className="me-2 h-4 w-4" />
          {t('convertToStudent')}
        </Button>
      </div>
    </div>
  );
}
