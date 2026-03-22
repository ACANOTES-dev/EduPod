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
  Checkbox,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@school/ui';
import { Check, ChevronsUpDown } from 'lucide-react';
import * as React from 'react';

import { apiClient } from '@/lib/api-client';

interface YearGroup {
  id: string;
  name: string;
}

interface Household {
  id: string;
  household_name?: string;
  name?: string;
  household_number?: string | null;
  primary_billing_parent?: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;
}

export interface StudentFormData {
  first_name: string;
  middle_name: string;
  last_name: string;
  date_of_birth: string;
  gender: string;
  household_id: string;
  year_group_id: string;
  status?: string;
  national_id: string;
  medical_notes?: string;
  has_allergy: boolean;
  allergy_details?: string;
}

interface StudentFormProps {
  initialData?: Partial<StudentFormData>;
  onSubmit: (data: StudentFormData) => Promise<void>;
  isEditMode?: boolean;
}

export function StudentForm({ initialData, onSubmit, isEditMode = false }: StudentFormProps) {
  const [yearGroups, setYearGroups] = React.useState<YearGroup[]>([]);
  const [households, setHouseholds] = React.useState<Household[]>([]);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const [householdOpen, setHouseholdOpen] = React.useState(false);

  const [formData, setFormData] = React.useState<StudentFormData>({
    first_name: initialData?.first_name ?? '',
    middle_name: initialData?.middle_name ?? '',
    last_name: initialData?.last_name ?? '',
    date_of_birth: initialData?.date_of_birth ?? '',
    gender: initialData?.gender ?? '',
    household_id: initialData?.household_id ?? '',
    year_group_id: initialData?.year_group_id ?? '',
    status: initialData?.status ?? 'applicant',
    national_id: initialData?.national_id ?? '',
    medical_notes: initialData?.medical_notes ?? '',
    has_allergy: initialData?.has_allergy ?? false,
    allergy_details: initialData?.allergy_details ?? '',
  });

  React.useEffect(() => {
    const fetchOptions = async () => {
      try {
        const [ygRes, hhRes] = await Promise.all([
          apiClient<{ data: YearGroup[] }>('/api/v1/year-groups?pageSize=100'),
          apiClient<{ data: Household[] }>('/api/v1/households?pageSize=100&status=active'),
        ]);
        setYearGroups(ygRes.data);
        setHouseholds(hhRes.data);
      } catch {
        // ignore fetch failures — dropdowns will be empty
      }
    };
    void fetchOptions();
  }, []);

  const set = (field: keyof StudentFormData, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: '' }));
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!formData.first_name.trim()) newErrors.first_name = 'First name is required';
    if (!formData.last_name.trim()) newErrors.last_name = 'Last name is required';
    if (!formData.date_of_birth) newErrors.date_of_birth = 'Date of birth is required';
    if (!formData.gender) newErrors.gender = 'Gender is required';
    if (!formData.household_id) newErrors.household_id = 'Household is required';
    if (!formData.year_group_id) newErrors.year_group_id = 'Year group is required';
    if (!formData.national_id.trim()) newErrors.national_id = 'National ID is required';
    if (formData.has_allergy && !formData.allergy_details?.trim()) {
      newErrors.allergy_details = 'Allergy details are required when has_allergy is checked';
    }
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
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6 max-w-2xl">
      {/* Name */}
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="first_name">First Name *</Label>
          <Input
            id="first_name"
            value={formData.first_name}
            onChange={(e) => set('first_name', e.target.value)}
            placeholder="First name"
          />
          {errors.first_name && <p className="text-xs text-danger-text">{errors.first_name}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="middle_name">Middle Name</Label>
          <Input
            id="middle_name"
            value={formData.middle_name}
            onChange={(e) => set('middle_name', e.target.value)}
            placeholder="Middle name"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="last_name">Last Name *</Label>
          <Input
            id="last_name"
            value={formData.last_name}
            onChange={(e) => set('last_name', e.target.value)}
            placeholder="Last name"
          />
          {errors.last_name && <p className="text-xs text-danger-text">{errors.last_name}</p>}
        </div>
      </div>

      {/* DOB + Gender */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="date_of_birth">Date of Birth *</Label>
          <Input
            id="date_of_birth"
            type="date"
            dir="ltr"
            value={formData.date_of_birth}
            onChange={(e) => set('date_of_birth', e.target.value)}
          />
          {errors.date_of_birth && <p className="text-xs text-danger-text">{errors.date_of_birth}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="gender">Gender *</Label>
          <Select value={formData.gender} onValueChange={(v) => set('gender', v)}>
            <SelectTrigger id="gender">
              <SelectValue placeholder="Select gender" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="male">Male</SelectItem>
              <SelectItem value="female">Female</SelectItem>
              <SelectItem value="other">Other</SelectItem>
              <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
            </SelectContent>
          </Select>
          {errors.gender && <p className="text-xs text-danger-text">{errors.gender}</p>}
        </div>
      </div>

      {/* Household + Year Group */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="household_id">Household *</Label>
          <Popover open={householdOpen} onOpenChange={setHouseholdOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={householdOpen}
                className="w-full justify-between font-normal"
              >
                {formData.household_id
                  ? households.find((h) => h.id === formData.household_id)?.household_name ??
                    households.find((h) => h.id === formData.household_id)?.name ??
                    'Select household'
                  : 'Select household'}
                <ChevronsUpDown className="ms-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
              <Command>
                <CommandInput placeholder="Search households..." />
                <CommandList>
                  <CommandEmpty>No household found.</CommandEmpty>
                  <CommandGroup>
                    {households.map((hh) => (
                      <CommandItem
                        key={hh.id}
                        value={`${hh.household_name ?? hh.name ?? ''} ${hh.household_number ?? ''} ${hh.primary_billing_parent ? `${hh.primary_billing_parent.first_name} ${hh.primary_billing_parent.last_name}` : ''}`}
                        onSelect={() => {
                          set('household_id', hh.id);
                          setHouseholdOpen(false);
                        }}
                      >
                        <Check
                          className={`me-2 h-4 w-4 ${formData.household_id === hh.id ? 'opacity-100' : 'opacity-0'}`}
                        />
                        <div>
                          <p className="text-sm font-medium">{hh.household_name ?? hh.name ?? 'Unnamed'}</p>
                          <p className="text-xs text-text-tertiary">
                            {[
                              hh.household_number,
                              hh.primary_billing_parent
                                ? `${hh.primary_billing_parent.first_name} ${hh.primary_billing_parent.last_name}`
                                : null,
                            ]
                              .filter(Boolean)
                              .join(' · ') || 'No details'}
                          </p>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          {errors.household_id && <p className="text-xs text-danger-text">{errors.household_id}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="year_group_id">Year Group *</Label>
          <Select value={formData.year_group_id} onValueChange={(v) => set('year_group_id', v)}>
            <SelectTrigger id="year_group_id">
              <SelectValue placeholder="Select year group" />
            </SelectTrigger>
            <SelectContent>
              {yearGroups.map((yg) => (
                <SelectItem key={yg.id} value={yg.id}>
                  {yg.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.year_group_id && <p className="text-xs text-danger-text">{errors.year_group_id}</p>}
        </div>
      </div>

      {/* National ID + Status */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="national_id">National ID *</Label>
          <Input
            id="national_id"
            dir="ltr"
            value={formData.national_id}
            onChange={(e) => set('national_id', e.target.value)}
            placeholder="e.g. 1234567890"
          />
          {errors.national_id && (
            <p className="text-xs text-danger-text">{errors.national_id}</p>
          )}
        </div>
        {!isEditMode && (
          <div className="space-y-1.5">
            <Label htmlFor="status">Status</Label>
            <Select value={formData.status} onValueChange={(v) => set('status', v)}>
              <SelectTrigger id="status">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="applicant">Applicant</SelectItem>
                <SelectItem value="active">Active</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Medical */}
      <div className="space-y-1.5">
        <Label htmlFor="medical_notes">Medical Notes</Label>
        <Textarea
          id="medical_notes"
          value={formData.medical_notes}
          onChange={(e) => set('medical_notes', e.target.value)}
          placeholder="Any relevant medical information..."
          rows={3}
        />
      </div>

      {/* Allergy */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Checkbox
            id="has_allergy"
            checked={formData.has_allergy}
            onCheckedChange={(checked) => set('has_allergy', !!checked)}
          />
          <Label htmlFor="has_allergy">Student has known allergies</Label>
        </div>

        {formData.has_allergy && (
          <div className="space-y-1.5 ps-6">
            <Label htmlFor="allergy_details">Allergy Details *</Label>
            <Textarea
              id="allergy_details"
              value={formData.allergy_details}
              onChange={(e) => set('allergy_details', e.target.value)}
              placeholder="Describe the allergies and any required emergency treatment..."
              rows={3}
            />
            {errors.allergy_details && (
              <p className="text-xs text-danger-text">{errors.allergy_details}</p>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : isEditMode ? 'Save Changes' : 'Create Student'}
        </Button>
      </div>
    </form>
  );
}
