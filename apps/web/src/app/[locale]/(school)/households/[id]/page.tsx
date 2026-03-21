'use client';

import type { InvoiceStatus } from '@school/shared';
import {
  Button,
  Input,
  Label,
  Skeleton,
  StatusBadge,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  toast,
} from '@school/ui';
import { Edit, Plus, Pencil, Trash2, AlertTriangle, FileText } from 'lucide-react';
import { useParams, useRouter, usePathname } from 'next/navigation';
import * as React from 'react';


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

  const fetchHousehold = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiClient<{ data: Household }>(`/api/v1/households/${id}`);
      setHousehold(res.data);
    } catch {
      // handled by empty state
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
      .catch(() => setInvoices([]));
  }, [id]);

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
    } catch {
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
    } catch {
      toast.error('Failed to remove contact');
    }
  };

  const handleSetBillingParent = async (parentId: string) => {
    try {
      await apiClient(`/api/v1/households/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ primary_billing_parent_id: parentId }),
      });
      toast.success('Billing parent updated');
      await fetchHousehold();
    } catch {
      toast.error('Failed to update billing parent');
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
        Household not found.
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
        Edit
      </Button>
      <Button variant="outline" onClick={() => setMergeOpen(true)}>
        Merge
      </Button>
      <Button variant="outline" onClick={() => setSplitOpen(true)}>
        Split
      </Button>
    </>
  );

  const metrics = [
    { label: 'Students', value: students.length },
    { label: 'Parents', value: parents.length },
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
        <h3 className="mb-1 text-sm font-semibold text-text-primary">Address</h3>
        {addressParts.length > 0 ? (
          <p className="text-sm text-text-secondary">{addressParts.join(', ')}</p>
        ) : (
          <p className="text-sm text-text-tertiary">No address on file</p>
        )}
      </div>

      {/* Billing parent */}
      <div>
        <h3 className="mb-1 text-sm font-semibold text-text-primary">Billing Parent</h3>
        {billingParent ? (
          <EntityLink
            entityType="parent"
            entityId={billingParent.id}
            label={`${billingParent.first_name} ${billingParent.last_name}`}
            href={`/parents/${billingParent.id}`}
          />
        ) : (
          <p className="text-sm text-text-tertiary">Not set</p>
        )}
      </div>
    </div>
  );

  const studentsTab = (
    <div>
      {students.length === 0 ? (
        <p className="text-sm text-text-tertiary">No students in this household.</p>
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
    <div>
      {parents.length === 0 ? (
        <p className="text-sm text-text-tertiary">No parents in this household.</p>
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
                  <StatusBadge status="info">Primary</StatusBadge>
                )}
                {parent.is_billing_contact && (
                  <StatusBadge status="neutral">Billing</StatusBadge>
                )}
                {parent.id !== household.primary_billing_parent_id && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void handleSetBillingParent(parent.id)}
                  >
                    Set Billing
                  </Button>
                )}
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
        <p className="text-sm text-text-tertiary">No emergency contacts on file.</p>
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
                    aria-label="Edit contact"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => void handleRemoveContact(contact.id)}
                    className="p-1.5 text-text-tertiary hover:text-danger-text transition-colors rounded"
                    aria-label="Remove contact"
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
          Add Contact
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
          label="View Statement"
          href={`/${locale}/finance/statements/${id}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-700 hover:underline"
        />
      </div>

      {invoices.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border py-12 text-center">
          <FileText className="h-8 w-8 text-text-tertiary" />
          <p className="text-sm text-text-tertiary">No invoices for this household.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-secondary">
                <th className="px-4 py-2.5 text-start font-medium text-text-secondary">Invoice #</th>
                <th className="px-4 py-2.5 text-start font-medium text-text-secondary">Status</th>
                <th className="px-4 py-2.5 text-end font-medium text-text-secondary">Total Amount</th>
                <th className="px-4 py-2.5 text-end font-medium text-text-secondary">Balance</th>
                <th className="px-4 py-2.5 text-start font-medium text-text-secondary">Due Date</th>
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
                        invoice.balance_amount > 0 ? 'font-medium text-danger-text' : 'text-text-secondary'
                      }
                    />
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {formatDate(invoice.due_date)}
                  </td>
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
        status={{
          label: household.status.charAt(0).toUpperCase() + household.status.slice(1),
          variant: statusVariantMap[household.status],
        }}
        actions={actions}
        metrics={metrics}
        tabs={[
          { key: 'overview', label: 'Overview', content: overviewTab },
          { key: 'students', label: `Students (${students.length})`, content: studentsTab },
          { key: 'parents', label: `Parents (${parents.length})`, content: parentsTab },
          { key: 'contacts', label: 'Emergency Contacts', content: contactsTab },
          { key: 'finance', label: `Finance (${invoices.length})`, content: financeTab },
        ]}
      >
        {/* Needs completion warning */}
        {household.needs_completion && (
          <div className="flex items-start gap-2 rounded-xl border border-warning-border bg-warning-surface px-4 py-3">
            <AlertTriangle className="h-4 w-4 shrink-0 text-warning-text mt-0.5" />
            <div className="text-sm text-warning-text">
              <p className="font-medium">This household is incomplete:</p>
              <ul className="mt-1 list-disc ps-4 space-y-0.5">
                {(household.completion_issues ?? []).includes('missing_emergency_contact') && (
                  <li>No emergency contact on file</li>
                )}
                {(household.completion_issues ?? []).includes('missing_billing_parent') && (
                  <li>No billing parent assigned</li>
                )}
                {(household.completion_issues ?? []).length === 0 && (
                  <li>Please add missing information</li>
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
              <Label htmlFor="ec_contact_name">Contact Name</Label>
              <Input
                id="ec_contact_name"
                value={contactForm.contact_name}
                onChange={(e) =>
                  setContactForm((prev) => ({ ...prev, contact_name: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ec_phone">Phone</Label>
              <Input
                id="ec_phone"
                dir="ltr"
                type="tel"
                value={contactForm.phone}
                onChange={(e) =>
                  setContactForm((prev) => ({ ...prev, phone: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ec_relationship">Relationship</Label>
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
              Cancel
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
    </>
  );
}
