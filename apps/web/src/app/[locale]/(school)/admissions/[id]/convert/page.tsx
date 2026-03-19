'use client';

import { ArrowLeft, AlertTriangle, CheckCircle } from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
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

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParentMatch {
  id: string;
  name: string;
  email: string;
  match_type: 'exact' | 'fuzzy';
}

interface ConversionPreview {
  application_id: string;
  student: {
    first_name: string;
    last_name: string;
    date_of_birth: string;
    gender: string;
  };
  parents: Array<{
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    matches: ParentMatch[];
  }>;
  household: {
    household_name: string;
  };
  year_groups: Array<{ id: string; name: string }>;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

interface PageProps {
  params: { id: string };
}

export default function ConversionPage({ params }: PageProps) {
  const t = useTranslations('admissions');
  const tc = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
  const { id } = params;

  const [preview, setPreview] = React.useState<ConversionPreview | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);

  // Editable state
  const [studentFirstName, setStudentFirstName] = React.useState('');
  const [studentLastName, setStudentLastName] = React.useState('');
  const [studentDob, setStudentDob] = React.useState('');
  const [studentGender, setStudentGender] = React.useState('');
  const [yearGroupId, setYearGroupId] = React.useState('');
  const [householdName, setHouseholdName] = React.useState('');
  const [parentSelections, setParentSelections] = React.useState<
    Array<{ link_existing_id: string | null }>
  >([]);

  React.useEffect(() => {
    apiClient<ConversionPreview>(`/api/v1/applications/${id}/conversion-preview`)
      .then((res) => {
        setPreview(res);
        setStudentFirstName(res.student.first_name);
        setStudentLastName(res.student.last_name);
        setStudentDob(res.student.date_of_birth ?? '');
        setStudentGender(res.student.gender ?? '');
        setHouseholdName(res.household.household_name);
        setParentSelections(res.parents.map(() => ({ link_existing_id: null })));
      })
      .catch(() => toast.error('Failed to load conversion preview'))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await apiClient(`/api/v1/applications/${id}/convert`, {
        method: 'POST',
        body: JSON.stringify({
          student: {
            first_name: studentFirstName,
            last_name: studentLastName,
            date_of_birth: studentDob || undefined,
            gender: studentGender || undefined,
            year_group_id: yearGroupId || undefined,
          },
          household_name: householdName,
          parent_mappings: preview?.parents.map((_, idx) => ({
            index: idx,
            link_existing_id: parentSelections[idx]?.link_existing_id || null,
          })),
        }),
      });
      toast.success(t('conversionSuccess'));
      router.push(`/${locale}/admissions`);
    } catch {
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
        <p className="text-sm text-danger-text">Failed to load conversion data.</p>
      </div>
    );
  }

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
        <h3 className="mb-4 text-base font-semibold text-text-primary">
          {t('studentName')}
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>First Name <span className="text-emerald-600">*</span></Label>
            <Input
              value={studentFirstName}
              onChange={(e) => setStudentFirstName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Last Name <span className="text-emerald-600">*</span></Label>
            <Input
              value={studentLastName}
              onChange={(e) => setStudentLastName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t('dateOfBirth')}</Label>
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
            <Label>{t('yearGroup')}</Label>
            <Select value={yearGroupId} onValueChange={setYearGroupId}>
              <SelectTrigger>
                <SelectValue placeholder="Select year group" />
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
        <h3 className="mb-4 text-base font-semibold text-text-primary">
          {t('household')}
        </h3>
        <div className="space-y-1.5">
          <Label>Household Name <span className="text-emerald-600">*</span></Label>
          <Input
            value={householdName}
            onChange={(e) => setHouseholdName(e.target.value)}
          />
        </div>
      </div>

      {/* Parents section */}
      {preview.parents.map((parent, idx) => (
        <div key={idx} className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          <h3 className="mb-4 text-base font-semibold text-text-primary">
            {t('parent')} {idx + 1}
          </h3>

          <dl className="mb-4 grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-text-tertiary">Name</dt>
              <dd className="mt-0.5 text-sm text-text-primary">
                {parent.first_name} {parent.last_name}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-text-tertiary">Email</dt>
              <dd className="mt-0.5 text-sm text-text-primary" dir="ltr">
                {parent.email}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-text-tertiary">Phone</dt>
              <dd className="mt-0.5 text-sm text-text-primary" dir="ltr">
                {parent.phone || '—'}
              </dd>
            </div>
          </dl>

          {/* Parent matching */}
          {parent.matches.length > 0 && (
            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-sm font-medium text-warning-text">
                <AlertTriangle className="h-4 w-4" />
                {t('duplicateWarning')}
              </p>
              <div className="space-y-2 ms-5">
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    id={`parent-${idx}-new`}
                    name={`parent-${idx}`}
                    checked={parentSelections[idx]?.link_existing_id === null}
                    onChange={() => {
                      const updated = [...parentSelections];
                      updated[idx] = { link_existing_id: null };
                      setParentSelections(updated);
                    }}
                  />
                  <label htmlFor={`parent-${idx}-new`} className="text-sm text-text-secondary">
                    Create new parent record
                  </label>
                </div>
                {parent.matches.map((match) => (
                  <div key={match.id} className="flex items-center gap-2">
                    <input
                      type="radio"
                      id={`parent-${idx}-${match.id}`}
                      name={`parent-${idx}`}
                      checked={parentSelections[idx]?.link_existing_id === match.id}
                      onChange={() => {
                        const updated = [...parentSelections];
                        updated[idx] = { link_existing_id: match.id };
                        setParentSelections(updated);
                      }}
                    />
                    <label
                      htmlFor={`parent-${idx}-${match.id}`}
                      className="text-sm text-text-secondary"
                    >
                      Link to {match.name} ({match.email})
                      <span className="ms-1 text-xs text-text-tertiary">
                        ({match.match_type} match)
                      </span>
                    </label>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Submit */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()}>
          {tc('cancel')}
        </Button>
        <Button onClick={handleSubmit} disabled={submitting || !studentFirstName || !studentLastName}>
          <CheckCircle className="me-2 h-4 w-4" />
          {t('convertToStudent')}
        </Button>
      </div>
    </div>
  );
}
