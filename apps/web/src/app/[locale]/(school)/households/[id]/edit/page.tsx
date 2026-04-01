'use client';

import { useParams, useRouter } from 'next/navigation';
import * as React from 'react';

import { Skeleton, toast } from '@school/ui';

import {
  HouseholdForm,
  type HouseholdFormData,
  type EmergencyContactData,
} from '../../_components/household-form';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

interface HouseholdDetail {
  id: string;
  household_name: string;
  address_line_1?: string | null;
  address_line_2?: string | null;
  city?: string | null;
  country?: string | null;
  postal_code?: string | null;
  emergency_contacts: EmergencyContactData[];
}

export default function EditHouseholdPage() {
  const _params = useParams<{ id: string }>();
  const id = _params?.id ?? '';
  const router = useRouter();

  const [household, setHousehold] = React.useState<HouseholdDetail | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    const fetch = async () => {
      setIsLoading(true);
      try {
        const res = await apiClient<{ data: HouseholdDetail }>(`/api/v1/households/${id}`);
        setHousehold(res.data);
      } catch {
        toast.error('Failed to load household');
      } finally {
        setIsLoading(false);
      }
    };
    void fetch();
  }, [id]);

  const handleSubmit = async (data: HouseholdFormData) => {
    // 1. Update household basics (name, address)
    const { emergency_contacts: _, ...householdBasics } = data;
    await apiClient<{ data: HouseholdDetail }>(`/api/v1/households/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(householdBasics),
    });

    // 2. Sync emergency contacts via dedicated endpoints
    const originalContacts = household?.emergency_contacts ?? [];
    const updatedContacts = data.emergency_contacts;

    const originalIds = new Set(originalContacts.map((c) => c.id).filter(Boolean));
    const updatedIds = new Set(updatedContacts.map((c) => c.id).filter(Boolean));

    // Delete contacts that were removed
    for (const original of originalContacts) {
      if (original.id && !updatedIds.has(original.id)) {
        await apiClient(`/api/v1/households/${id}/emergency-contacts/${original.id}`, {
          method: 'DELETE',
        });
      }
    }

    // Create new contacts (no id) and update existing ones
    for (const contact of updatedContacts) {
      const payload = {
        contact_name: contact.contact_name,
        phone: contact.phone,
        relationship_label: contact.relationship_label,
        display_order: contact.display_order,
      };

      if (contact.id && originalIds.has(contact.id)) {
        // Update existing contact
        await apiClient(`/api/v1/households/${id}/emergency-contacts/${contact.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        // Create new contact
        await apiClient(`/api/v1/households/${id}/emergency-contacts`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
    }

    toast.success('Household updated successfully');
    router.push(`/households/${id}`);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full max-w-2xl" />
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

  const initialData: Partial<HouseholdFormData> = {
    household_name: household.household_name,
    address_line_1: household.address_line_1 ?? '',
    address_line_2: household.address_line_2 ?? '',
    city: household.city ?? '',
    country: household.country ?? '',
    postal_code: household.postal_code ?? '',
    emergency_contacts: household.emergency_contacts,
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Edit Household" description={`Editing ${household.household_name}`} />
      <HouseholdForm initialData={initialData} onSubmit={handleSubmit} isEditMode />
    </div>
  );
}
