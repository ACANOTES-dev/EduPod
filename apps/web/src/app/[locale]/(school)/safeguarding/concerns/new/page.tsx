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
  Textarea,
} from '@school/ui';
import { AlertTriangle, Send } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

const CONCERN_TYPES = [
  'physical_abuse',
  'emotional_abuse',
  'sexual_abuse',
  'neglect',
  'domestic_violence',
  'online_safety',
  'self_harm',
  'bullying',
  'other',
] as const;

const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReportConcernPage() {
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [studentSearch, setStudentSearch] = React.useState('');
  const [studentId, setStudentId] = React.useState('');
  const [studentResults, setStudentResults] = React.useState<Array<{ id: string; name: string }>>([]);
  const [showResults, setShowResults] = React.useState(false);
  const [concernType, setConcernType] = React.useState('');
  const [severity, setSeverity] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [immediateActions, setImmediateActions] = React.useState('');
  const [incidentLink, setIncidentLink] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState('');

  // Student search with debounce
  const searchTimeoutRef = React.useRef<ReturnType<typeof setTimeout>>();

  React.useEffect(() => {
    if (studentSearch.length < 2) {
      setStudentResults([]);
      setShowResults(false);
      return;
    }

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    searchTimeoutRef.current = setTimeout(() => {
      apiClient<{ data: Array<{ id: string; first_name: string; last_name: string }> }>(
        `/api/v1/students?search=${encodeURIComponent(studentSearch)}&pageSize=10`,
      )
        .then((res) => {
          setStudentResults(
            (res.data ?? []).map((s) => ({ id: s.id, name: `${s.first_name} ${s.last_name}` })),
          );
          setShowResults(true);
        })
        .catch(() => {
          setStudentResults([]);
        });
    }, 300);

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [studentSearch]);

  const selectStudent = (student: { id: string; name: string }) => {
    setStudentId(student.id);
    setStudentSearch(student.name);
    setShowResults(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!studentId) {
      setError('Please select a student.');
      return;
    }
    if (!concernType) {
      setError('Please select a concern type.');
      return;
    }
    if (!severity) {
      setError('Please select a severity level.');
      return;
    }
    if (description.length < 10) {
      setError('Description must be at least 10 characters.');
      return;
    }

    setIsSubmitting(true);
    try {
      await apiClient('/api/v1/safeguarding/concerns', {
        method: 'POST',
        body: JSON.stringify({
          student_id: studentId,
          concern_type: concernType,
          severity,
          description,
          immediate_actions: immediateActions || undefined,
          incident_id: incidentLink || undefined,
        }),
      });
      router.push(`/${locale}/safeguarding/my-reports`);
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string } };
      setError(ex?.error?.message ?? 'Failed to submit concern. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Report a Safeguarding Concern"
        description="All reports are confidential and handled by the Designated Liaison Person."
      />

      <div className="mx-auto max-w-2xl rounded-xl border border-border bg-surface p-5">
        <h2 className="text-base font-semibold text-text-primary">Concern Details</h2>
        <div className="mt-4">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Student Search */}
            <div className="space-y-1.5">
              <Label htmlFor="student-search">Student</Label>
              <div className="relative">
                <Input
                  id="student-search"
                  type="text"
                  placeholder="Search student by name..."
                  value={studentSearch}
                  onChange={(e) => {
                    setStudentSearch(e.target.value);
                    setStudentId('');
                  }}
                  className="w-full text-base"
                  autoComplete="off"
                />
                {showResults && studentResults.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full rounded-lg border border-border bg-surface shadow-lg">
                    {studentResults.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => selectStudent(s)}
                        className="w-full px-4 py-2 text-start text-sm hover:bg-surface-secondary"
                      >
                        {s.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {studentId && (
                <p className="text-xs text-success-text">Student selected</p>
              )}
            </div>

            {/* Concern Type */}
            <div className="space-y-1.5">
              <Label>Concern Type</Label>
              <Select value={concernType} onValueChange={setConcernType}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select type..." />
                </SelectTrigger>
                <SelectContent>
                  {CONCERN_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type.replace(/_/g, ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Severity */}
            <div className="space-y-1.5">
              <Label>Severity</Label>
              <div className="flex flex-wrap gap-2">
                {SEVERITIES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSeverity(s)}
                    className={`rounded-lg px-4 py-2 text-sm font-medium capitalize transition-colors ${
                      severity === s
                        ? s === 'critical'
                          ? 'bg-red-600 text-white'
                          : s === 'high'
                            ? 'bg-orange-600 text-white'
                            : s === 'medium'
                              ? 'bg-yellow-500 text-white'
                              : 'bg-blue-600 text-white'
                        : 'bg-surface-secondary text-text-secondary hover:bg-surface-secondary/80'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Critical severity warning */}
            {severity === 'critical' && (
              <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
                <div>
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                    Critical Severity
                  </p>
                  <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-300">
                    Critical concerns trigger immediate SLA timelines. The Designated Liaison Person
                    will be notified immediately upon submission.
                  </p>
                </div>
              </div>
            )}

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Describe the concern in detail (minimum 10 characters)..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                className="w-full text-base"
              />
              <p className="text-xs text-text-tertiary">
                {description.length} / 10 minimum characters
              </p>
            </div>

            {/* Immediate Actions */}
            <div className="space-y-1.5">
              <Label htmlFor="immediate-actions">Immediate Actions Taken (optional)</Label>
              <Textarea
                id="immediate-actions"
                placeholder="Describe any immediate steps you have taken..."
                value={immediateActions}
                onChange={(e) => setImmediateActions(e.target.value)}
                rows={3}
                className="w-full text-base"
              />
            </div>

            {/* Incident Link */}
            <div className="space-y-1.5">
              <Label htmlFor="incident-link">Linked Behaviour Incident ID (optional)</Label>
              <Input
                id="incident-link"
                type="text"
                placeholder="e.g. BH-202603-0012"
                value={incidentLink}
                onChange={(e) => setIncidentLink(e.target.value)}
                className="w-full text-base"
              />
            </div>

            {/* Error */}
            {error && (
              <p className="text-sm text-danger-text">{error}</p>
            )}

            {/* Submit */}
            <div className="flex justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  'Submitting...'
                ) : (
                  <>
                    <Send className="me-2 h-4 w-4" />
                    Submit Concern
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
