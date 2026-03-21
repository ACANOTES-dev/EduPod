'use client';

import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@school/ui';
import { ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';


import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

const TIMEZONES = [
  'Asia/Riyadh',
  'Asia/Dubai',
  'Asia/Kuwait',
  'Asia/Bahrain',
  'Asia/Qatar',
  'Asia/Muscat',
  'Africa/Cairo',
  'Europe/London',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'UTC',
];

const DATE_FORMATS = [
  'DD/MM/YYYY',
  'MM/DD/YYYY',
  'YYYY-MM-DD',
];

const CURRENCIES = [
  { code: 'SAR', label: 'SAR — Saudi Riyal' },
  { code: 'AED', label: 'AED — UAE Dirham' },
  { code: 'KWD', label: 'KWD — Kuwaiti Dinar' },
  { code: 'BHD', label: 'BHD — Bahraini Dinar' },
  { code: 'QAR', label: 'QAR — Qatari Riyal' },
  { code: 'OMR', label: 'OMR — Omani Rial' },
  { code: 'EGP', label: 'EGP — Egyptian Pound' },
  { code: 'GBP', label: 'GBP — British Pound' },
  { code: 'USD', label: 'USD — US Dollar' },
];

const MONTHS = [
  { value: '1', label: 'January' },
  { value: '2', label: 'February' },
  { value: '3', label: 'March' },
  { value: '4', label: 'April' },
  { value: '5', label: 'May' },
  { value: '6', label: 'June' },
  { value: '7', label: 'July' },
  { value: '8', label: 'August' },
  { value: '9', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
];

interface FormState {
  name: string;
  slug: string;
  default_locale: string;
  timezone: string;
  date_format: string;
  currency_code: string;
  academic_year_start_month: string;
}

export default function CreateTenantPage() {
  const router = useRouter();
  const [slugManuallyEdited, setSlugManuallyEdited] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [form, setForm] = React.useState<FormState>({
    name: '',
    slug: '',
    default_locale: 'en',
    timezone: 'Asia/Riyadh',
    date_format: 'DD/MM/YYYY',
    currency_code: 'SAR',
    academic_year_start_month: '9',
  });

  const updateField = (field: keyof FormState, value: string) => {
    setForm((prev) => {
      const updated = { ...prev, [field]: value };
      if (field === 'name' && !slugManuallyEdited) {
        updated.slug = slugify(value);
      }
      return updated;
    });
  };

  const handleSlugChange = (value: string) => {
    setSlugManuallyEdited(true);
    setForm((prev) => ({ ...prev, slug: slugify(value) }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.slug.trim()) return;

    try {
      setSubmitting(true);
      setError(null);
      const result = await apiClient<{ data: { id: string } }>('/api/v1/admin/tenants', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          slug: form.slug.trim(),
          default_locale: form.default_locale,
          timezone: form.timezone,
          date_format: form.date_format,
          currency_code: form.currency_code,
          academic_year_start_month: Number(form.academic_year_start_month),
        }),
      });
      router.push(`/en/admin/tenants/${result.data.id}`);
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'error' in err
          ? String((err as { error: { message?: string } }).error?.message ?? 'Failed to create tenant')
          : 'Failed to create tenant';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/en/admin/tenants"
          className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Tenants
        </Link>
      </div>

      <PageHeader
        title="Create Tenant"
        description="Set up a new school tenant on the platform"
      />

      {error && (
        <div className="mt-6 rounded-xl border border-danger-fill bg-danger-fill/10 px-4 py-3 text-sm text-danger-text">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 max-w-2xl">
        <div className="space-y-6 rounded-2xl border border-border bg-surface p-6">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">School Name</Label>
            <Input
              id="name"
              placeholder="e.g. Al Noor International School"
              value={form.name}
              onChange={(e) => updateField('name', e.target.value)}
              required
            />
          </div>

          {/* Slug */}
          <div className="space-y-2">
            <Label htmlFor="slug">Slug</Label>
            <Input
              id="slug"
              placeholder="e.g. al-noor-international"
              value={form.slug}
              onChange={(e) => handleSlugChange(e.target.value)}
              required
            />
            <p className="text-xs text-text-tertiary">
              URL-friendly identifier. Auto-generated from the name.
            </p>
          </div>

          {/* Default Locale */}
          <div className="space-y-2">
            <Label htmlFor="default_locale">Default Language</Label>
            <Select
              value={form.default_locale}
              onValueChange={(v) => updateField('default_locale', v)}
            >
              <SelectTrigger id="default_locale">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="ar">Arabic</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Timezone */}
          <div className="space-y-2">
            <Label htmlFor="timezone">Timezone</Label>
            <Select
              value={form.timezone}
              onValueChange={(v) => updateField('timezone', v)}
            >
              <SelectTrigger id="timezone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date Format */}
          <div className="space-y-2">
            <Label htmlFor="date_format">Date Format</Label>
            <Select
              value={form.date_format}
              onValueChange={(v) => updateField('date_format', v)}
            >
              <SelectTrigger id="date_format">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DATE_FORMATS.map((fmt) => (
                  <SelectItem key={fmt} value={fmt}>
                    {fmt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Currency */}
          <div className="space-y-2">
            <Label htmlFor="currency_code">Currency</Label>
            <Select
              value={form.currency_code}
              onValueChange={(v) => updateField('currency_code', v)}
            >
              <SelectTrigger id="currency_code">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Academic Year Start Month */}
          <div className="space-y-2">
            <Label htmlFor="academic_year_start_month">Academic Year Start Month</Label>
            <Select
              value={form.academic_year_start_month}
              onValueChange={(v) => updateField('academic_year_start_month', v)}
            >
              <SelectTrigger id="academic_year_start_month">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex items-center gap-3">
          <Button type="submit" disabled={submitting || !form.name.trim() || !form.slug.trim()}>
            {submitting && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
            Create Tenant
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/en/admin/tenants')}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
