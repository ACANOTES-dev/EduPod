'use client';

import { Plus, Trash2 } from 'lucide-react';
import * as React from 'react';

import { Button, Input, Label } from '@school/ui';

export interface EmergencyContactData {
  id?: string;
  contact_name: string;
  phone: string;
  relationship_label: string;
  display_order: number;
}

export interface HouseholdFormData {
  household_name: string;
  address_line_1?: string;
  address_line_2?: string;
  city?: string;
  country?: string;
  postal_code?: string;
  emergency_contacts: EmergencyContactData[];
}

interface HouseholdFormProps {
  initialData?: Partial<HouseholdFormData>;
  onSubmit: (data: HouseholdFormData) => Promise<void>;
  isEditMode?: boolean;
}

const emptyContact = (order: number): EmergencyContactData => ({
  contact_name: '',
  phone: '',
  relationship_label: '',
  display_order: order,
});

export function HouseholdForm({ initialData, onSubmit, isEditMode = false }: HouseholdFormProps) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const [formData, setFormData] = React.useState<HouseholdFormData>({
    household_name: initialData?.household_name ?? '',
    address_line_1: initialData?.address_line_1 ?? '',
    address_line_2: initialData?.address_line_2 ?? '',
    city: initialData?.city ?? '',
    country: initialData?.country ?? '',
    postal_code: initialData?.postal_code ?? '',
    emergency_contacts:
      initialData?.emergency_contacts && initialData.emergency_contacts.length > 0
        ? initialData.emergency_contacts
        : [emptyContact(1)],
  });

  const setField = (field: keyof Omit<HouseholdFormData, 'emergency_contacts'>, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: '' }));
  };

  const setContactField = (
    index: number,
    field: keyof Omit<EmergencyContactData, 'id' | 'display_order'>,
    value: string,
  ) => {
    setFormData((prev) => {
      const contacts = [...prev.emergency_contacts];
      contacts[index] = { ...contacts[index]!, [field]: value };
      return { ...prev, emergency_contacts: contacts };
    });
    const key = `contact_${index}_${field}`;
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: '' }));
  };

  const addContact = () => {
    if (formData.emergency_contacts.length >= 3) return;
    setFormData((prev) => ({
      ...prev,
      emergency_contacts: [
        ...prev.emergency_contacts,
        emptyContact(prev.emergency_contacts.length + 1),
      ],
    }));
  };

  const removeContact = (index: number) => {
    if (formData.emergency_contacts.length <= 1) return;
    setFormData((prev) => {
      const contacts = prev.emergency_contacts
        .filter((_, i) => i !== index)
        .map((c, i) => ({ ...c, display_order: i + 1 }));
      return { ...prev, emergency_contacts: contacts };
    });
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!formData.household_name.trim()) newErrors.household_name = 'Household name is required';
    formData.emergency_contacts.forEach((contact, index) => {
      if (!contact.contact_name.trim())
        newErrors[`contact_${index}_contact_name`] = 'Contact name is required';
      if (!contact.phone.trim()) newErrors[`contact_${index}_phone`] = 'Phone is required';
      if (!contact.relationship_label.trim())
        newErrors[`contact_${index}_relationship_label`] = 'Relationship is required';
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setIsSubmitting(true);
    try {
      await onSubmit(formData);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-8 max-w-2xl">
      {/* Household name */}
      <div className="space-y-1.5">
        <Label htmlFor="household_name">Household Name *</Label>
        <Input
          id="household_name"
          value={formData.household_name}
          onChange={(e) => setField('household_name', e.target.value)}
          placeholder="e.g. The Al-Farsi Family"
        />
        {errors.household_name && (
          <p className="text-xs text-danger-text">{errors.household_name}</p>
        )}
      </div>

      {/* Address */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-text-primary">Address</legend>
        <div className="space-y-1.5">
          <Label htmlFor="address_line_1">Address Line 1</Label>
          <Input
            id="address_line_1"
            value={formData.address_line_1}
            onChange={(e) => setField('address_line_1', e.target.value)}
            placeholder="Street address"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="address_line_2">Address Line 2</Label>
          <Input
            id="address_line_2"
            value={formData.address_line_2}
            onChange={(e) => setField('address_line_2', e.target.value)}
            placeholder="Apartment, suite, etc."
          />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="city">City</Label>
            <Input
              id="city"
              value={formData.city}
              onChange={(e) => setField('city', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="country">Country</Label>
            <Input
              id="country"
              value={formData.country}
              onChange={(e) => setField('country', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="postal_code">Postal Code</Label>
            <Input
              id="postal_code"
              dir="ltr"
              value={formData.postal_code}
              onChange={(e) => setField('postal_code', e.target.value)}
            />
          </div>
        </div>
      </fieldset>

      {/* Emergency contacts */}
      <fieldset className="space-y-4">
        <div className="flex items-center justify-between">
          <legend className="text-sm font-semibold text-text-primary">Emergency Contacts *</legend>
          {formData.emergency_contacts.length < 3 && (
            <Button type="button" variant="outline" size="sm" onClick={addContact}>
              <Plus className="me-1 h-3.5 w-3.5" />
              Add Contact
            </Button>
          )}
        </div>

        {formData.emergency_contacts.map((contact, index) => (
          <div key={index} className="relative rounded-xl border border-border p-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">
                Contact {contact.display_order}
              </span>
              {formData.emergency_contacts.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeContact(index)}
                  className="text-text-tertiary hover:text-danger-text transition-colors"
                  aria-label="Remove contact"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor={`contact_name_${index}`}>Contact Name *</Label>
                <Input
                  id={`contact_name_${index}`}
                  value={contact.contact_name}
                  onChange={(e) => setContactField(index, 'contact_name', e.target.value)}
                  placeholder="Full name"
                />
                {errors[`contact_${index}_contact_name`] && (
                  <p className="text-xs text-danger-text">
                    {errors[`contact_${index}_contact_name`]}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`phone_${index}`}>Phone *</Label>
                <Input
                  id={`phone_${index}`}
                  dir="ltr"
                  type="tel"
                  value={contact.phone}
                  onChange={(e) => setContactField(index, 'phone', e.target.value)}
                  placeholder="+971 50 000 0000"
                />
                {errors[`contact_${index}_phone`] && (
                  <p className="text-xs text-danger-text">{errors[`contact_${index}_phone`]}</p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`relationship_${index}`}>Relationship *</Label>
              <Input
                id={`relationship_${index}`}
                value={contact.relationship_label}
                onChange={(e) => setContactField(index, 'relationship_label', e.target.value)}
                placeholder="e.g. Aunt, Uncle, Grandparent"
              />
              {errors[`contact_${index}_relationship_label`] && (
                <p className="text-xs text-danger-text">
                  {errors[`contact_${index}_relationship_label`]}
                </p>
              )}
            </div>
          </div>
        ))}
      </fieldset>

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : isEditMode ? 'Save Changes' : 'Create Household'}
        </Button>
      </div>
    </form>
  );
}
