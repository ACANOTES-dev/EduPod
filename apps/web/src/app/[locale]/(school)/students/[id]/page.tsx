'use client';

import { Edit, ChevronDown } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import * as React from 'react';

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  StatusBadge,
  Skeleton,
  toast,
} from '@school/ui';
import { EntityLink } from '@/components/entity-link';
import { RecordHub } from '@/components/record-hub';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format-date';

interface ClassEnrolment {
  id: string;
  class_id: string;
  class_name: string;
  subject_name?: string;
  status: string;
}

interface Parent {
  id: string;
  first_name: string;
  last_name: string;
  relationship_label?: string | null;
  is_primary_contact: boolean;
}

interface Student {
  id: string;
  student_number: string;
  first_name: string;
  last_name: string;
  full_name: string;
  status: 'applicant' | 'active' | 'withdrawn' | 'graduated' | 'archived';
  date_of_birth?: string | null;
  gender?: string | null;
  entry_date?: string | null;
  medical_notes?: string | null;
  has_allergy: boolean;
  allergy_details?: string | null;
  year_group?: { id: string; name: string } | null;
  household?: { id: string; household_name: string } | null;
  class_enrolments?: ClassEnrolment[];
  parents?: Parent[];
}

const statusVariantMap: Record<
  Student['status'],
  'success' | 'warning' | 'danger' | 'info' | 'neutral'
> = {
  active: 'success',
  applicant: 'info',
  withdrawn: 'warning',
  graduated: 'neutral',
  archived: 'neutral',
};

const nextStatuses: Record<Student['status'], string[]> = {
  applicant: ['active', 'withdrawn'],
  active: ['withdrawn', 'graduated', 'archived'],
  withdrawn: ['active', 'archived'],
  graduated: ['archived'],
  archived: [],
};

export default function StudentHubPage() {
  const _params = useParams<{ id: string }>();
  const id = _params?.id ?? '';
  const router = useRouter();

  const [student, setStudent] = React.useState<Student | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isChangingStatus, setIsChangingStatus] = React.useState(false);

  const fetchStudent = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiClient<{ data: Student }>(`/api/v1/students/${id}`);
      setStudent(res.data);
    } catch {
      // handled by empty state
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    void fetchStudent();
  }, [fetchStudent]);

  const handleStatusChange = async (newStatus: string) => {
    if (!student) return;
    setIsChangingStatus(true);
    try {
      const res = await apiClient<{ data: Student }>(`/api/v1/students/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      setStudent(res.data);
      toast.success(`Status changed to ${newStatus}`);
    } catch {
      toast.error('Failed to update status');
    } finally {
      setIsChangingStatus(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!student) {
    return (
      <div className="flex h-64 items-center justify-center text-text-tertiary">
        Student not found.
      </div>
    );
  }

  const allowedNextStatuses = nextStatuses[student.status] ?? [];

  const actions = (
    <>
      <Button variant="outline" onClick={() => router.push(`/students/${id}/edit`)}>
        <Edit className="me-2 h-4 w-4" />
        Edit
      </Button>

      {allowedNextStatuses.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" disabled={isChangingStatus}>
              Change Status
              <ChevronDown className="ms-2 h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {allowedNextStatuses.map((s) => (
              <DropdownMenuItem key={s} onClick={() => void handleStatusChange(s)}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </>
  );

  const metrics = [
    {
      label: 'Date of Birth',
      value: student.date_of_birth
        ? formatDate(student.date_of_birth)
        : '—',
    },
    {
      label: 'Entry Date',
      value: student.entry_date
        ? formatDate(student.entry_date)
        : '—',
    },
    {
      label: 'Household',
      value: student.household ? (
        <EntityLink
          entityType="household"
          entityId={student.household.id}
          label={student.household.household_name}
          href={`/households/${student.household.id}`}
        />
      ) : (
        '—'
      ),
    },
  ];

  const overviewTab = (
    <div className="space-y-6">
      {/* Basic info */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {student.gender && (
          <div>
            <dt className="text-xs text-text-tertiary">Gender</dt>
            <dd className="text-sm font-medium text-text-primary capitalize">{student.gender.replace(/_/g, ' ')}</dd>
          </div>
        )}
        {student.year_group && (
          <div>
            <dt className="text-xs text-text-tertiary">Year Group</dt>
            <dd className="text-sm font-medium text-text-primary">{student.year_group.name}</dd>
          </div>
        )}
      </div>

      {/* Household */}
      {student.household && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-text-primary">Household</h3>
          <EntityLink
            entityType="household"
            entityId={student.household.id}
            label={student.household.household_name}
            href={`/households/${student.household.id}`}
          />
        </div>
      )}

      {/* Parents */}
      {student.parents && student.parents.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-text-primary">Parents / Guardians</h3>
          <ul className="space-y-2">
            {student.parents.map((parent) => (
              <li key={parent.id} className="flex items-center gap-2">
                <EntityLink
                  entityType="parent"
                  entityId={parent.id}
                  label={`${parent.first_name} ${parent.last_name}`}
                  href={`/parents/${parent.id}`}
                />
                {parent.relationship_label && (
                  <span className="text-xs text-text-tertiary">({parent.relationship_label})</span>
                )}
                {parent.is_primary_contact && (
                  <StatusBadge status="info">Primary</StatusBadge>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );

  const classesTab = (
    <div>
      {!student.class_enrolments || student.class_enrolments.length === 0 ? (
        <p className="text-sm text-text-tertiary">No class enrolments found.</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {student.class_enrolments.map((enrolment) => (
            <li
              key={enrolment.id}
              className="flex items-center justify-between px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium text-text-primary">{enrolment.class_name}</p>
                {enrolment.subject_name && (
                  <p className="text-xs text-text-tertiary">{enrolment.subject_name}</p>
                )}
              </div>
              <StatusBadge
                status={enrolment.status === 'active' ? 'success' : enrolment.status === 'dropped' ? 'danger' : 'neutral'}
              >
                {enrolment.status.charAt(0).toUpperCase() + enrolment.status.slice(1)}
              </StatusBadge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const medicalTab = (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <StatusBadge status={student.has_allergy ? 'warning' : 'neutral'} dot>
          {student.has_allergy ? 'Has Allergies' : 'No Known Allergies'}
        </StatusBadge>
      </div>

      {student.has_allergy && student.allergy_details && (
        <div className="rounded-xl border border-warning-border bg-warning-surface p-4">
          <p className="text-sm font-semibold text-warning-text">Allergy Details</p>
          <p className="mt-1 text-sm text-text-primary">{student.allergy_details}</p>
        </div>
      )}

      {student.medical_notes && (
        <div>
          <h3 className="mb-1 text-sm font-semibold text-text-primary">Medical Notes</h3>
          <p className="text-sm text-text-secondary">{student.medical_notes}</p>
        </div>
      )}

      {!student.has_allergy && !student.medical_notes && (
        <p className="text-sm text-text-tertiary">No medical information on file.</p>
      )}
    </div>
  );

  return (
    <RecordHub
      title={student.full_name}
      subtitle={student.year_group?.name}
      status={{ label: student.status.charAt(0).toUpperCase() + student.status.slice(1), variant: statusVariantMap[student.status] }}
      reference={student.student_number}
      actions={actions}
      metrics={metrics}
      tabs={[
        { key: 'overview', label: 'Overview', content: overviewTab },
        { key: 'classes', label: 'Classes & Enrolments', content: classesTab },
        { key: 'medical', label: 'Medical', content: medicalTab },
      ]}
    />
  );
}
