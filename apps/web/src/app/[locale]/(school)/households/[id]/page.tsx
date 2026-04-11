'use client';

import { Edit, Plus, Pencil, Trash2, AlertTriangle, FileText, Loader2 } from 'lucide-react';
import { useParams, useRouter, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import type { InvoiceStatus } from '@school/shared';
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  StatusBadge,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  toast,
} from '@school/ui';

import { EntityLink } from '@/components/entity-link';
import { RecordHub } from '@/components/record-hub';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format-date';

import { CurrencyDisplay } from '../../finance/_components/currency-display';
import { InvoiceStatusBadge } from '../../finance/_components/invoice-status-badge';
import { MergeDialog } from '../_components/merge-dialog';
import { SplitDialog } from '../_components/split-dialog';

interface Invoice {
  id: string;
  invoice_number: string;
  status: InvoiceStatus;
  total_amount: number;
  balance_amount: number;
  due_date: string;
  currency_code: string;
}

interface EmergencyContact {
  id: string;
  contact_name: string;
  phone: string;
  relationship_label: string;
  display_order: number;
}

interface Student {
  id: string;
  first_name: string;
  last_name: string;
  full_name?: string;
  status: string;
  year_group?: { name: string } | null;
}

interface Parent {
  id: string;
  first_name: string;
  last_name: string;
  relationship_label?: string | null;
  is_primary_contact: boolean;
  is_billing_contact: boolean;
  status?: string;
}

interface HouseholdParentJoin {
  parent: Parent;
  role_label?: string;
}

interface Household {
  id: string;
  household_name: string;
  household_number?: string | null;
  status: 'active' | 'inactive' | 'archived';
  needs_completion: boolean;
  completion_issues?: string[];
  address_line_1?: string | null;
  address_line_2?: string | null;
  city?: string | null;
  country?: string | null;
  postal_code?: string | null;
  primary_billing_parent_id?: string | null;
  students?: Student[];
  parents?: Parent[];
  household_parents?: HouseholdParentJoin[];
  emergency_contacts?: EmergencyContact[];
}

const statusVariantMap: Record<
  Household['status'],
  'success' | 'warning' | 'danger' | 'info' | 'neutral'
> = {
  active: 'success',
  inactive: 'warning',
  archived: 'neutral',
};

interface ContactFormState {
  contact_name: string;
  phone: string;
  relationship_label: string;
}

export default function HouseholdHubPage() {
  const _params = useParams<{ id: string }>();
  const id = _params?.id ?? '';
  const t = useTranslations('households');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [household, setHousehold] = React.useState<Household | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [mergeOpen, setMergeOpen] = React.useState(false);
  const [splitOpen, setSplitOpen] = React.useState(false);
  const [invoices, setInvoices] = React.useState<Invoice[]>([]);

  // Emergency contact editing
  const [contactDialogOpen, setContactDialogOpen] = React.useState(false);
  const [editingContact, setEditingContact] = React.useState<EmergencyContact | null>(null);
  const [contactForm, setContactForm] = React.useState<ContactFormState>({
    contact_name: '',
    phone: '',
    relationship_label: '',
  });
  const [isSavingContact, setIsSavingContact] = React.useState(false);

  // Add/Edit Guardian dialog
  const [guardianDialogOpen, setGuardianDialogOpen] = React.useState(false);
  const [editingGuardian, setEditingGuardian] = React.useState<Parent | null>(null);
  const [guardianForm, setGuardianForm] = React.useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    whatsapp_phone: '',
    relationship_label: '',
    preferred_contact_channels: ['email'] as ('email' | 'whatsapp')[],
  });
  const [isSavingGuardian, setIsSavingGuardian] = React.useState(false);

  // Add Student dialog
  interface YearGroup {
    id: string;
    name: string;
  }
  const [addStudentOpen, setAddStudentOpen] = React.useState(false);
  const [yearGroups, setYearGroups] = React.useState<YearGroup[]>([]);
  const [studentForm, setStudentForm] = React.useState({
    first_name: '',
    middle_name: '',
    last_name: '',
    date_of_birth: '',
    gender: '',
    year_group_id: '',
    national_id: '',
    nationality: '',
    city_of_birth: '',
  });
  const [isSavingStudent, setIsSavingStudent] = React.useState(false);

  const fetchHousehold = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiClient<{ data: Household }>(`/api/v1/households/${id}`);
      setHousehold(res.data);
    } catch (err) {
      // handled by empty state
      console.error('[setHousehold]', err);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    void fetchHousehold();
  }, [fetchHousehold]);

  React.useEffect(() => {
    if (!id) return;
    apiClient<{ data: Invoice[] }>(`/api/v1/finance/invoices?household_id=${id}&pageSize=50`)
      .then((res) => setInvoices(Array.isArray(res.data) ? res.data : []))
      .catch((err) => {
        console.error('[HouseholdsPage]', err);
        return setInvoices([]);
      });
  }, [id]);

  // Fetch year groups for add-student form
  React.useEffect(() => {
    apiClient<{ data: YearGroup[] }>('/api/v1/year-groups?pageSize=50')
      .then((res) => setYearGroups(Array.isArray(res.data) ? res.data : []))
      .catch((err) => {
        console.error('[HouseholdsPage]', err);
        return setYearGroups([]);
      });
  }, []);

  const openAddStudent = () => {
    setStudentForm({
      first_name: '',
      middle_name: '',
      last_name: '',
      date_of_birth: '',
      gender: '',
      year_group_id: '',
      national_id: '',
      nationality: '',
      city_of_birth: '',
    });
    setAddStudentOpen(true);
  };

  const handleSaveStudent = async () => {
    if (
      !studentForm.first_name ||
      !studentForm.date_of_birth ||
      !studentForm.gender ||
      !studentForm.year_group_id ||
      !studentForm.national_id
    ) {
      toast.error('Please fill in all required fields');
      return;
    }
    setIsSavingStudent(true);
    try {
      await apiClient(`/api/v1/households/${id}/students`, {
        method: 'POST',
        body: JSON.stringify({
          first_name: studentForm.first_name,
          middle_name: studentForm.middle_name || undefined,
          last_name: studentForm.last_name || undefined,
          date_of_birth: studentForm.date_of_birth,
          gender: studentForm.gender,
          year_group_id: studentForm.year_group_id,
          national_id: studentForm.national_id,
          nationality: studentForm.nationality || undefined,
          city_of_birth: studentForm.city_of_birth || undefined,
        }),
      });
      toast.success('Student added and fees assigned');
      setAddStudentOpen(false);
      await fetchHousehold();
      // Refresh invoices
      apiClient<{ data: Invoice[] }>(`/api/v1/finance/invoices?household_id=${id}&pageSize=50`)
        .then((res) => setInvoices(Array.isArray(res.data) ? res.data : []))
        .catch((err) => {
          console.error('[HouseholdsPage]', err);
        });
    } catch (err) {
      console.error('[HouseholdsPage]', err);
      toast.error('Failed to add student');
    } finally {
      setIsSavingStudent(false);
    }
  };

  const openAddContact = () => {
    setEditingContact(null);
    setContactForm({ contact_name: '', phone: '', relationship_label: '' });
    setContactDialogOpen(true);
  };

  const openEditContact = (contact: EmergencyContact) => {
    setEditingContact(contact);
    setContactForm({
      contact_name: contact.contact_name,
      phone: contact.phone,
      relationship_label: contact.relationship_label,
    });
    setContactDialogOpen(true);
  };

  const handleSaveContact = async () => {
    setIsSavingContact(true);
    try {
      if (editingContact) {
        await apiClient(`/api/v1/households/${id}/emergency-contacts/${editingContact.id}`, {
          method: 'PATCH',
          body: JSON.stringify(contactForm),
        });
        toast.success('Contact updated');
      } else {
        const contacts = household?.emergency_contacts ?? [];
        await apiClient(`/api/v1/households/${id}/emergency-contacts`, {
          method: 'POST',
          body: JSON.stringify({ ...contactForm, display_order: contacts.length + 1 }),
        });
        toast.success('Contact added');
      }
      setContactDialogOpen(false);
      await fetchHousehold();
    } catch (err) {
      console.error('[HouseholdsPage]', err);
      toast.error('Failed to save contact');
    } finally {
      setIsSavingContact(false);
    }
  };

  const handleRemoveContact = async (contactId: string) => {
    try {
      await apiClient(`/api/v1/households/${id}/emergency-contacts/${contactId}`, {
        method: 'DELETE',
      });
      toast.success('Contact removed');
      await fetchHousehold();
    } catch (err) {
      console.error('[HouseholdsPage]', err);
      toast.error('Failed to remove contact');
    }
  };

  const handleSetBillingParent = async (parentId: string) => {
    try {
      await apiClient(`/api/v1/households/${id}/billing-parent`, {
        method: 'PUT',
        body: JSON.stringify({ parent_id: parentId }),
      });
      toast.success('Billing parent updated');
      await fetchHousehold();
    } catch (err) {
      console.error('[HouseholdsPage]', err);
      toast.error('Failed to update billing parent');
    }
  };

  const openAddGuardian = () => {
    setEditingGuardian(null);
    setGuardianForm({
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      whatsapp_phone: '',
      relationship_label: '',
      preferred_contact_channels: ['email'],
    });
    setGuardianDialogOpen(true);
  };

  const openEditGuardian = (guardian: Parent) => {
    setEditingGuardian(guardian);
    // Fetch full guardian details for editing
    apiClient<{
      data: {
        first_name: string;
        last_name: string;
        email?: string | null;
        phone?: string | null;
        whatsapp_phone?: string | null;
        relationship_label?: string | null;
        preferred_contact_channels?: ('email' | 'whatsapp')[];
      };
    }>(`/api/v1/parents/${guardian.id}`, { silent: true })
      .then((res) => {
        const g = res.data;
        setGuardianForm({
          first_name: g.first_name ?? '',
          last_name: g.last_name ?? '',
          email: g.email ?? '',
          phone: g.phone ?? '',
          whatsapp_phone: g.whatsapp_phone ?? '',
          relationship_label: g.relationship_label ?? '',
          preferred_contact_channels: g.preferred_contact_channels ?? ['email'],
        });
      })
      .catch(() => {
        // Fallback to basic info from household data
        setGuardianForm({
          first_name: guardian.first_name ?? '',
          last_name: guardian.last_name ?? '',
          email: '',
          phone: '',
          whatsapp_phone: '',
          relationship_label: guardian.relationship_label ?? '',
          preferred_contact_channels: ['email'],
        });
      });
    setGuardianDialogOpen(true);
  };

  const handleSaveGuardian = async () => {
    if (!guardianForm.first_name || !guardianForm.last_name) {
      toast.error('First name and last name are required');
      return;
    }
    setIsSavingGuardian(true);
    try {
      if (editingGuardian) {
        // Update existing guardian
        await apiClient(`/api/v1/parents/${editingGuardian.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            first_name: guardianForm.first_name,
            last_name: guardianForm.last_name,
            email: guardianForm.email || null,
            phone: guardianForm.phone || null,
            whatsapp_phone: guardianForm.whatsapp_phone || null,
            relationship_label: guardianForm.relationship_label || null,
            preferred_contact_channels: guardianForm.preferred_contact_channels,
          }),
        });
        toast.success(t('guardianUpdated'));
      } else {
        // Create new guardian and link to household
        const res = await apiClient<{ data: { id: string } }>('/api/v1/parents', {
          method: 'POST',
          body: JSON.stringify({
            first_name: guardianForm.first_name,
            last_name: guardianForm.last_name,
            email: guardianForm.email || undefined,
            phone: guardianForm.phone || undefined,
            whatsapp_phone: guardianForm.whatsapp_phone || undefined,
            relationship_label: guardianForm.relationship_label || undefined,
            preferred_contact_channels: guardianForm.preferred_contact_channels,
            household_id: id,
            role_label: guardianForm.relationship_label || undefined,
          }),
        });
        // If the parent was created without household linking, link them
        if (res.data?.id) {
          await apiClient(`/api/v1/households/${id}/parents`, {
            method: 'POST',
            body: JSON.stringify({
              parent_id: res.data.id,
              role_label: guardianForm.relationship_label || undefined,
            }),
          }).catch(() => {
            // May already be linked if create handled it
          });
        }
        toast.success(t('guardianSaved'));
      }
      setGuardianDialogOpen(false);
      await fetchHousehold();
    } catch (err) {
      console.error('[HouseholdsPage]', err);
      toast.error(t('failedToSaveGuardian'));
    } finally {
      setIsSavingGuardian(false);
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

  if (!household) {
    return (
      <div className="flex h-64 items-center justify-center text-text-tertiary">
        {t('householdNotFound')}
      </div>
    );
  }

  const students = household.students ?? [];
  // Backend may return parents via household_parents join table or flat parents array
  const parents: Parent[] = household.parents?.length
    ? household.parents
    : (household.household_parents ?? []).map((hp) => ({
        ...hp.parent,
        relationship_label: hp.role_label ?? hp.parent.relationship_label ?? null,
      }));
  const contacts = household.emergency_contacts ?? [];

  const actions = (
    <>
      <Button variant="outline" onClick={() => router.push(`/households/${id}/edit`)}>
        <Edit className="me-2 h-4 w-4" />
        {tCommon('edit')}
      </Button>
      <Button variant="outline" onClick={() => setMergeOpen(true)}>
        {t('merge2')}
      </Button>
      <Button variant="outline" onClick={() => setSplitOpen(true)}>
        {t('split2')}
      </Button>
    </>
  );

  const metrics = [
    { label: 'Students', value: students.length },
    { label: t('guardians'), value: parents.length },
    { label: 'Emergency Contacts', value: contacts.length },
  ];

  // Format address
  const addressParts = [
    household.address_line_1,
    household.address_line_2,
    household.city,
    household.country,
    household.postal_code,
  ].filter(Boolean);

  const billingParent = parents.find((p) => p.id === household.primary_billing_parent_id);

  const overviewTab = (
    <div className="space-y-6">
      {/* Address */}
      <div>
        <h3 className="mb-1 text-sm font-semibold text-text-primary">{t('address')}</h3>
        {addressParts.length > 0 ? (
          <p className="text-sm text-text-secondary">{addressParts.join(', ')}</p>
        ) : (
          <p className="text-sm text-text-tertiary">{t('noAddressOnFile')}</p>
        )}
      </div>

      {/* Billing parent */}
      <div>
        <h3 className="mb-1 text-sm font-semibold text-text-primary">{t('billingParent')}</h3>
        {billingParent ? (
          <EntityLink
            entityType="parent"
            entityId={billingParent.id}
            label={`${billingParent.first_name} ${billingParent.last_name}`}
            href={`/parents/${billingParent.id}`}
          />
        ) : (
          <p className="text-sm text-text-tertiary">{t('notSet')}</p>
        )}
      </div>
    </div>
  );

  const studentsTab = (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">
          {students.length} {students.length === 1 ? 'Student' : 'Students'}
        </h3>
        <Button size="sm" onClick={openAddStudent}>
          <Plus className="me-2 h-4 w-4" />
          {t('addStudent')}
        </Button>
      </div>

      {students.length === 0 ? (
        <p className="text-sm text-text-tertiary">{t('noStudentsInThisHousehold')}</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {students.map((student) => (
            <li key={student.id} className="flex items-center justify-between px-4 py-3">
              <EntityLink
                entityType="student"
                entityId={student.id}
                label={student.full_name || `${student.first_name} ${student.last_name}`}
                href={`/students/${student.id}`}
              />
              <div className="flex items-center gap-2">
                {student.year_group && (
                  <span className="text-xs text-text-tertiary">{student.year_group.name}</span>
                )}
                <StatusBadge
                  status={
                    student.status === 'active'
                      ? 'success'
                      : student.status === 'applicant'
                        ? 'info'
                        : 'neutral'
                  }
                  dot
                >
                  {student.status.charAt(0).toUpperCase() + student.status.slice(1)}
                </StatusBadge>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const parentsTab = (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">
          {parents.length}{' '}
          {parents.length === 1 ? t('guardians').replace(/s$/i, '') : t('guardians')}
        </h3>
        <Button size="sm" onClick={openAddGuardian}>
          <Plus className="me-2 h-4 w-4" />
          {t('addGuardian')}
        </Button>
      </div>

      {parents.length === 0 ? (
        <p className="text-sm text-text-tertiary">{t('noGuardiansInThisHousehold')}</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {parents.map((parent) => (
            <li key={parent.id} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                <EntityLink
                  entityType="parent"
                  entityId={parent.id}
                  label={`${parent.first_name} ${parent.last_name}`}
                  href={`/parents/${parent.id}`}
                />
                {parent.relationship_label && (
                  <span className="text-xs text-text-tertiary">({parent.relationship_label})</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {parent.is_primary_contact && (
                  <StatusBadge status="info">{t('primary')}</StatusBadge>
                )}
                {parent.is_billing_contact && (
                  <StatusBadge status="neutral">{t('billing')}</StatusBadge>
                )}
                {parent.id !== household.primary_billing_parent_id && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void handleSetBillingParent(parent.id)}
                  >
                    {t('setBilling')}
                  </Button>
                )}
                <button
                  onClick={() => openEditGuardian(parent)}
                  className="p-1.5 text-text-tertiary hover:text-text-primary transition-colors rounded"
                  aria-label={t('editGuardian')}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const contactsTab = (
    <div className="space-y-4">
      {contacts.length === 0 ? (
        <p className="text-sm text-text-tertiary">{t('noEmergencyContactsOnFile')}</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {contacts
            .slice()
            .sort((a, b) => a.display_order - b.display_order)
            .map((contact) => (
              <li key={contact.id} className="flex items-start justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-text-primary">{contact.contact_name}</p>
                  <p className="text-xs text-text-tertiary">{contact.relationship_label}</p>
                  <p className="text-xs text-text-secondary" dir="ltr">
                    {contact.phone}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEditContact(contact)}
                    className="p-1.5 text-text-tertiary hover:text-text-primary transition-colors rounded"
                    aria-label={t('editContact')}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => void handleRemoveContact(contact.id)}
                    className="p-1.5 text-text-tertiary hover:text-danger-text transition-colors rounded"
                    aria-label={t('removeContact')}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
        </ul>
      )}

      {contacts.length < 3 && (
        <Button variant="outline" size="sm" onClick={openAddContact}>
          <Plus className="me-1 h-3.5 w-3.5" />
          {t('addContact')}
        </Button>
      )}
    </div>
  );

  const financeTab = (
    <div className="space-y-4">
      {/* View Statement link */}
      <div className="flex justify-end">
        <EntityLink
          entityType="household"
          entityId={id}
          label={t('viewStatement')}
          href={`/${locale}/finance/statements/${id}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-700 hover:underline"
        />
      </div>

      {invoices.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border py-12 text-center">
          <FileText className="h-8 w-8 text-text-tertiary" />
          <p className="text-sm text-text-tertiary">{t('noInvoicesForThisHousehold')}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-secondary">
                <th className="px-4 py-2.5 text-start font-medium text-text-secondary">
                  {t('invoice')}
                </th>
                <th className="px-4 py-2.5 text-start font-medium text-text-secondary">
                  {t('status')}
                </th>
                <th className="px-4 py-2.5 text-end font-medium text-text-secondary">
                  {t('totalAmount')}
                </th>
                <th className="px-4 py-2.5 text-end font-medium text-text-secondary">
                  {t('balance')}
                </th>
                <th className="px-4 py-2.5 text-start font-medium text-text-secondary">
                  {t('dueDate')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {invoices.map((invoice) => (
                <tr
                  key={invoice.id}
                  className="cursor-pointer transition-colors hover:bg-surface-secondary"
                  onClick={() => router.push(`/${locale}/finance/invoices/${invoice.id}`)}
                >
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-text-secondary">
                      {invoice.invoice_number}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <InvoiceStatusBadge status={invoice.status} />
                  </td>
                  <td className="px-4 py-3 text-end">
                    <CurrencyDisplay
                      amount={invoice.total_amount}
                      currency_code={invoice.currency_code}
                      className="font-medium"
                    />
                  </td>
                  <td className="px-4 py-3 text-end">
                    <CurrencyDisplay
                      amount={invoice.balance_amount}
                      currency_code={invoice.currency_code}
                      className={
                        invoice.balance_amount > 0
                          ? 'font-medium text-danger-text'
                          : 'text-text-secondary'
                      }
                    />
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{formatDate(invoice.due_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  return (
    <>
      <RecordHub
        title={household.household_name}
        reference={household.household_number ?? undefined}
        status={{
          label: household.status.charAt(0).toUpperCase() + household.status.slice(1),
          variant: statusVariantMap[household.status],
        }}
        actions={actions}
        metrics={metrics}
        tabs={[
          { key: 'overview', label: 'Overview', content: overviewTab },
          { key: 'students', label: `Students (${students.length})`, content: studentsTab },
          { key: 'guardians', label: `${t('guardians')} (${parents.length})`, content: parentsTab },
          { key: 'contacts', label: 'Emergency Contacts', content: contactsTab },
          { key: 'finance', label: `Finance (${invoices.length})`, content: financeTab },
        ]}
      >
        {/* Needs completion warning */}
        {household.needs_completion && (
          <div className="flex items-start gap-2 rounded-xl border border-warning-border bg-warning-surface px-4 py-3">
            <AlertTriangle className="h-4 w-4 shrink-0 text-warning-text mt-0.5" />
            <div className="text-sm text-warning-text">
              <p className="font-medium">{t('thisHouseholdIsIncomplete')}</p>
              <ul className="mt-1 list-disc ps-4 space-y-0.5">
                {(household.completion_issues ?? []).includes('missing_emergency_contact') && (
                  <li>{t('noEmergencyContactOnFile')}</li>
                )}
                {(household.completion_issues ?? []).includes('missing_billing_parent') && (
                  <li>{t('noBillingParentAssigned')}</li>
                )}
                {(household.completion_issues ?? []).length === 0 && (
                  <li>{t('pleaseAddMissingInformation')}</li>
                )}
              </ul>
            </div>
          </div>
        )}
      </RecordHub>

      {/* Emergency contact dialog */}
      <Dialog open={contactDialogOpen} onOpenChange={setContactDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingContact ? 'Edit Emergency Contact' : 'Add Emergency Contact'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ec_contact_name">{t('contactName')}</Label>
              <Input
                id="ec_contact_name"
                value={contactForm.contact_name}
                onChange={(e) =>
                  setContactForm((prev) => ({ ...prev, contact_name: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ec_phone">{t('phone')}</Label>
              <Input
                id="ec_phone"
                dir="ltr"
                type="tel"
                value={contactForm.phone}
                onChange={(e) => setContactForm((prev) => ({ ...prev, phone: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ec_relationship">{t('relationship')}</Label>
              <Input
                id="ec_relationship"
                value={contactForm.relationship_label}
                onChange={(e) =>
                  setContactForm((prev) => ({ ...prev, relationship_label: e.target.value }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setContactDialogOpen(false)}>
              {tCommon('cancel')}
            </Button>
            <Button onClick={() => void handleSaveContact()} disabled={isSavingContact}>
              {isSavingContact ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MergeDialog
        open={mergeOpen}
        onOpenChange={setMergeOpen}
        currentHouseholdId={id}
        onMerged={() => router.push('/households')}
      />

      <SplitDialog
        open={splitOpen}
        onOpenChange={setSplitOpen}
        currentHouseholdId={id}
        students={students}
        parents={parents}
        onSplit={(newId) => router.push(`/households/${newId}`)}
      />

      {/* Add/Edit Guardian dialog */}
      <Dialog open={guardianDialogOpen} onOpenChange={setGuardianDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingGuardian ? t('editGuardian') : t('addGuardian')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="guard_first">{t('guardianFirstName')}</Label>
                <Input
                  id="guard_first"
                  value={guardianForm.first_name}
                  onChange={(e) => setGuardianForm((p) => ({ ...p, first_name: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="guard_last">{t('guardianLastName')}</Label>
                <Input
                  id="guard_last"
                  value={guardianForm.last_name}
                  onChange={(e) => setGuardianForm((p) => ({ ...p, last_name: e.target.value }))}
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="guard_email">{t('guardianEmail')}</Label>
              <Input
                id="guard_email"
                type="email"
                dir="ltr"
                value={guardianForm.email}
                onChange={(e) => setGuardianForm((p) => ({ ...p, email: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="guard_phone">{t('guardianPhone')}</Label>
                <Input
                  id="guard_phone"
                  type="tel"
                  dir="ltr"
                  value={guardianForm.phone}
                  onChange={(e) => setGuardianForm((p) => ({ ...p, phone: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="guard_whatsapp">{t('guardianWhatsApp')}</Label>
                <Input
                  id="guard_whatsapp"
                  type="tel"
                  dir="ltr"
                  value={guardianForm.whatsapp_phone}
                  onChange={(e) =>
                    setGuardianForm((p) => ({ ...p, whatsapp_phone: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="guard_rel">{t('guardianRelationship')}</Label>
              <Input
                id="guard_rel"
                value={guardianForm.relationship_label}
                onChange={(e) =>
                  setGuardianForm((p) => ({ ...p, relationship_label: e.target.value }))
                }
                placeholder="e.g. Mother, Father, Uncle"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('guardianContactChannel')}</Label>
              <Select
                value={guardianForm.preferred_contact_channels[0] ?? 'email'}
                onValueChange={(v) =>
                  setGuardianForm((p) => ({
                    ...p,
                    preferred_contact_channels: [v as 'email' | 'whatsapp'],
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setGuardianDialogOpen(false)}
              disabled={isSavingGuardian}
            >
              {tCommon('cancel')}
            </Button>
            <Button onClick={() => void handleSaveGuardian()} disabled={isSavingGuardian}>
              {isSavingGuardian && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              {isSavingGuardian ? tCommon('saving') : tCommon('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Student dialog */}
      <Dialog open={addStudentOpen} onOpenChange={setAddStudentOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {t('addStudentTo')}
              {household.household_name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Name row */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="stu_first">{t('firstName')}</Label>
                <Input
                  id="stu_first"
                  value={studentForm.first_name}
                  onChange={(e) => setStudentForm((p) => ({ ...p, first_name: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="stu_middle">{t('middleName')}</Label>
                <Input
                  id="stu_middle"
                  value={studentForm.middle_name}
                  onChange={(e) => setStudentForm((p) => ({ ...p, middle_name: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="stu_last">{t('lastNameDefaultsToFamily')}</Label>
              <Input
                id="stu_last"
                placeholder={household.household_name
                  .replace(/^The\s+/i, '')
                  .replace(/\s+Family$/i, '')}
                value={studentForm.last_name}
                onChange={(e) => setStudentForm((p) => ({ ...p, last_name: e.target.value }))}
              />
            </div>

            {/* DOB + Gender */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="stu_dob">{t('dateOfBirth')}</Label>
                <Input
                  id="stu_dob"
                  type="date"
                  dir="ltr"
                  value={studentForm.date_of_birth}
                  onChange={(e) => setStudentForm((p) => ({ ...p, date_of_birth: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t('gender')}</Label>
                <Select
                  value={studentForm.gender}
                  onValueChange={(v) => setStudentForm((p) => ({ ...p, gender: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('selectGender')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">{t('male')}</SelectItem>
                    <SelectItem value="female">{t('female')}</SelectItem>
                    <SelectItem value="other">{t('other')}</SelectItem>
                    <SelectItem value="prefer_not_to_say">{t('preferNotToSay')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Year Group */}
            <div className="space-y-1.5">
              <Label>{t('yearGroup')}</Label>
              <Select
                value={studentForm.year_group_id}
                onValueChange={(v) => setStudentForm((p) => ({ ...p, year_group_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('selectYearGroup')} />
                </SelectTrigger>
                <SelectContent>
                  {yearGroups.map((yg) => (
                    <SelectItem key={yg.id} value={yg.id}>
                      {yg.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* National ID + Nationality */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="stu_nid">{t('nationalId')}</Label>
                <Input
                  id="stu_nid"
                  dir="ltr"
                  value={studentForm.national_id}
                  onChange={(e) => setStudentForm((p) => ({ ...p, national_id: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="stu_nationality">{t('nationality')}</Label>
                <Input
                  id="stu_nationality"
                  value={studentForm.nationality}
                  onChange={(e) => setStudentForm((p) => ({ ...p, nationality: e.target.value }))}
                />
              </div>
            </div>

            {/* City of Birth */}
            <div className="space-y-1.5">
              <Label htmlFor="stu_cob">{t('cityOfBirth')}</Label>
              <Input
                id="stu_cob"
                value={studentForm.city_of_birth}
                onChange={(e) => setStudentForm((p) => ({ ...p, city_of_birth: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddStudentOpen(false)}
              disabled={isSavingStudent}
            >
              {tCommon('cancel')}
            </Button>
            <Button onClick={() => void handleSaveStudent()} disabled={isSavingStudent}>
              {isSavingStudent && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              {isSavingStudent ? 'Adding...' : 'Add Student & Assign Fees'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
