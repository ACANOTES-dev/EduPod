'use client';

import { useParams } from 'next/navigation';
import * as React from 'react';

import { Skeleton, StatusBadge } from '@school/ui';

import { EntityLink } from '@/components/entity-link';
import { RecordHub } from '@/components/record-hub';
import { apiClient } from '@/lib/api-client';

interface HouseholdLink {
  household: {
    id: string;
    household_name: string;
  };
  role_label?: string | null;
}

interface StudentLink {
  student: {
    id: string;
    first_name: string;
    last_name: string;
    student_number: string;
    status: string;
  };
  relationship_label?: string | null;
}

interface ParentDetail {
  id: string;
  first_name: string;
  last_name: string;
  email?: string | null;
  phone?: string | null;
  relationship_label?: string | null;
  is_primary_contact: boolean;
  is_billing_contact: boolean;
  status: string;
  household_parents: HouseholdLink[];
  student_parents: StudentLink[];
}

const statusVariantMap: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  active: 'success',
  inactive: 'neutral',
  archived: 'neutral',
};

export default function ParentDetailPage() {
  const _params = useParams<{ id: string }>();
  const id = _params?.id ?? '';

  const [parent, setParent] = React.useState<ParentDetail | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    const fetchParent = async () => {
      setIsLoading(true);
      try {
        const res = await apiClient<{ data: ParentDetail }>(`/api/v1/parents/${id}`);
        setParent(res.data);
      } catch (err) {
        // handled by empty state
        console.error('[setParent]', err);
      } finally {
        setIsLoading(false);
      }
    };
    void fetchParent();
  }, [id]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!parent) {
    return (
      <div className="flex h-64 items-center justify-center text-text-tertiary">
        Parent not found.
      </div>
    );
  }

  const fullName = `${parent.first_name} ${parent.last_name}`;

  const metrics = [
    {
      label: 'Email',
      value: parent.email ? <span dir="ltr">{parent.email}</span> : '—',
    },
    {
      label: 'Phone',
      value: parent.phone ? <span dir="ltr">{parent.phone}</span> : '—',
    },
    {
      label: 'Relationship',
      value: parent.relationship_label
        ? parent.relationship_label.charAt(0).toUpperCase() + parent.relationship_label.slice(1)
        : '—',
    },
  ];

  const overviewTab = (
    <div className="space-y-6">
      {/* Contact info */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div>
          <dt className="text-xs text-text-tertiary">Primary Contact</dt>
          <dd className="text-sm font-medium text-text-primary">
            {parent.is_primary_contact ? 'Yes' : 'No'}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-text-tertiary">Billing Contact</dt>
          <dd className="text-sm font-medium text-text-primary">
            {parent.is_billing_contact ? 'Yes' : 'No'}
          </dd>
        </div>
      </div>

      {/* Households */}
      {parent.household_parents.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-text-primary">Households</h3>
          <ul className="space-y-2">
            {parent.household_parents.map((hp) => (
              <li key={hp.household.id} className="flex items-center gap-2">
                <EntityLink
                  entityType="household"
                  entityId={hp.household.id}
                  label={hp.household.household_name}
                  href={`/households/${hp.household.id}`}
                />
                {hp.role_label && (
                  <span className="text-xs text-text-tertiary">({hp.role_label})</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Students */}
      {parent.student_parents.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-text-primary">Children</h3>
          <ul className="divide-y divide-border rounded-xl border border-border">
            {parent.student_parents.map((sp) => (
              <li key={sp.student.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2">
                  <EntityLink
                    entityType="student"
                    entityId={sp.student.id}
                    label={`${sp.student.first_name} ${sp.student.last_name}`}
                    href={`/students/${sp.student.id}`}
                  />
                  {sp.relationship_label && (
                    <span className="text-xs text-text-tertiary">({sp.relationship_label})</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-tertiary" dir="ltr">
                    {sp.student.student_number}
                  </span>
                  <StatusBadge
                    status={
                      sp.student.status === 'active'
                        ? 'success'
                        : sp.student.status === 'applicant'
                          ? 'info'
                          : 'neutral'
                    }
                  >
                    {sp.student.status.charAt(0).toUpperCase() + sp.student.status.slice(1)}
                  </StatusBadge>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );

  return (
    <RecordHub
      title={fullName}
      subtitle={
        parent.relationship_label
          ? parent.relationship_label.charAt(0).toUpperCase() + parent.relationship_label.slice(1)
          : undefined
      }
      status={{
        label: parent.status.charAt(0).toUpperCase() + parent.status.slice(1),
        variant: statusVariantMap[parent.status] ?? 'neutral',
      }}
      metrics={metrics}
      tabs={[{ key: 'overview', label: 'Overview', content: overviewTab }]}
    />
  );
}
