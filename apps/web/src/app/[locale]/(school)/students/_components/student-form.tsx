'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Check, ChevronsUpDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';

import { createStudentSchema, updateStudentSchema } from '@school/shared';
import type { CreateStudentDto } from '@school/shared';
import {
  Button,
  Checkbox,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Input,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@school/ui';

import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

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

// StudentFormData kept for backward-compat with parent components that pass initialData
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
  nationality: string;
  city_of_birth: string;
  medical_notes?: string;
  has_allergy: boolean;
  allergy_details?: string;
}

interface StudentFormProps {
  initialData?: Partial<StudentFormData>;
  onSubmit: (data: StudentFormData) => Promise<void>;
  isEditMode?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function StudentForm({ initialData, onSubmit, isEditMode = false }: StudentFormProps) {
  const t = useTranslations('students');
  const [yearGroups, setYearGroups] = React.useState<YearGroup[]>([]);
  const [households, setHouseholds] = React.useState<Household[]>([]);
  const [householdOpen, setHouseholdOpen] = React.useState(false);

  // ─── Form setup ─────────────────────────────────────────────────────────────

  // Edit mode uses updateStudentSchema (all fields optional).
  // Create mode uses createStudentSchema (required fields enforced).
  const schema = isEditMode ? updateStudentSchema : createStudentSchema;

  const form = useForm<CreateStudentDto>({
    resolver: zodResolver(schema),
    defaultValues: {
      first_name: initialData?.first_name ?? '',
      middle_name: initialData?.middle_name ?? '',
      last_name: initialData?.last_name ?? '',
      date_of_birth: initialData?.date_of_birth ?? '',
      gender: (initialData?.gender as CreateStudentDto['gender']) ?? undefined,
      household_id: initialData?.household_id ?? '',
      year_group_id: initialData?.year_group_id ?? '',
      status: (initialData?.status as 'applicant' | 'active') ?? 'applicant',
      national_id: initialData?.national_id ?? '',
      nationality: initialData?.nationality ?? '',
      city_of_birth: initialData?.city_of_birth ?? '',
      medical_notes: initialData?.medical_notes ?? '',
      has_allergy: initialData?.has_allergy ?? false,
      allergy_details: initialData?.allergy_details ?? '',
    },
  });

  const watchHasAllergy = form.watch('has_allergy');
  const watchHouseholdId = form.watch('household_id');

  // ─── Data fetching ───────────────────────────────────────────────────────────

  React.useEffect(() => {
    const fetchOptions = async () => {
      try {
        const [ygRes, hhRes] = await Promise.all([
          apiClient<{ data: YearGroup[] }>('/api/v1/year-groups?pageSize=100'),
          apiClient<{ data: Household[] }>('/api/v1/households?pageSize=100&status=active'),
        ]);
        setYearGroups(ygRes.data);
        setHouseholds(hhRes.data);
      } catch (err) {
        console.error('[StudentForm fetchOptions]', err);
      }
    };
    void fetchOptions();
  }, []);

  // ─── Submit ──────────────────────────────────────────────────────────────────

  const handleSubmit = form.handleSubmit(async (values) => {
    // Cast to StudentFormData so the parent's onSubmit signature is satisfied
    await onSubmit(values as unknown as StudentFormData);
  });

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6 max-w-2xl">
      {/* Name */}
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="first_name">{t('firstName3')}</Label>
          <Input
            id="first_name"
            {...form.register('first_name')}
            placeholder={t('firstName2')}
            className="text-base"
          />
          {form.formState.errors.first_name && (
            <p className="text-xs text-danger-text">{form.formState.errors.first_name.message}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="middle_name">{t('middleName2')}</Label>
          <Input
            id="middle_name"
            {...form.register('middle_name')}
            placeholder={t('middleName')}
            className="text-base"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="last_name">{t('lastName3')}</Label>
          <Input
            id="last_name"
            {...form.register('last_name')}
            placeholder={t('lastName2')}
            className="text-base"
          />
          {form.formState.errors.last_name && (
            <p className="text-xs text-danger-text">{form.formState.errors.last_name.message}</p>
          )}
        </div>
      </div>

      {/* DOB + Gender */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="date_of_birth">{t('dateOfBirth2')}</Label>
          <Input
            id="date_of_birth"
            type="date"
            dir="ltr"
            {...form.register('date_of_birth')}
            className="text-base"
          />
          {form.formState.errors.date_of_birth && (
            <p className="text-xs text-danger-text">
              {form.formState.errors.date_of_birth.message}
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="gender">{t('gender2')}</Label>
          <Controller
            control={form.control}
            name="gender"
            render={({ field }) => (
              <Select value={field.value ?? ''} onValueChange={field.onChange}>
                <SelectTrigger id="gender" className="text-base">
                  <SelectValue placeholder={t('selectGender')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">{t('male')}</SelectItem>
                  <SelectItem value="female">{t('female')}</SelectItem>
                  <SelectItem value="other">{t('other')}</SelectItem>
                  <SelectItem value="prefer_not_to_say">{t('preferNotToSay')}</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
          {form.formState.errors.gender && (
            <p className="text-xs text-danger-text">{form.formState.errors.gender.message}</p>
          )}
        </div>
      </div>

      {/* Household + Year Group */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="household_id">{t('household2')}</Label>
          <Controller
            control={form.control}
            name="household_id"
            render={({ field }) => (
              <Popover open={householdOpen} onOpenChange={setHouseholdOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={householdOpen}
                    className="w-full justify-between font-normal text-base"
                  >
                    {watchHouseholdId
                      ? (households.find((h) => h.id === watchHouseholdId)?.household_name ??
                        households.find((h) => h.id === watchHouseholdId)?.name ??
                        'Select household')
                      : 'Select household'}
                    <ChevronsUpDown className="ms-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder={t('searchHouseholds')} />
                    <CommandList>
                      <CommandEmpty>{t('noHouseholdFound')}</CommandEmpty>
                      <CommandGroup>
                        {households.map((hh) => (
                          <CommandItem
                            key={hh.id}
                            value={`${hh.household_name ?? hh.name ?? ''} ${hh.household_number ?? ''} ${hh.primary_billing_parent ? `${hh.primary_billing_parent.first_name} ${hh.primary_billing_parent.last_name}` : ''}`}
                            onSelect={() => {
                              field.onChange(hh.id);
                              setHouseholdOpen(false);
                            }}
                          >
                            <Check
                              className={`me-2 h-4 w-4 ${field.value === hh.id ? 'opacity-100' : 'opacity-0'}`}
                            />
                            <div>
                              <p className="text-sm font-medium">
                                {hh.household_name ?? hh.name ?? 'Unnamed'}
                              </p>
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
            )}
          />
          {form.formState.errors.household_id && (
            <p className="text-xs text-danger-text">{form.formState.errors.household_id.message}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="year_group_id">{t('yearGroup2')}</Label>
          <Controller
            control={form.control}
            name="year_group_id"
            render={({ field }) => (
              <Select value={field.value ?? ''} onValueChange={field.onChange}>
                <SelectTrigger id="year_group_id" className="text-base">
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
            )}
          />
          {form.formState.errors.year_group_id && (
            <p className="text-xs text-danger-text">
              {form.formState.errors.year_group_id.message}
            </p>
          )}
        </div>
      </div>

      {/* National ID + Status */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="national_id">{t('nationalId')}</Label>
          <Input
            id="national_id"
            dir="ltr"
            {...form.register('national_id')}
            placeholder={t('eG1234567890')}
            className="text-base"
          />
          {form.formState.errors.national_id && (
            <p className="text-xs text-danger-text">{form.formState.errors.national_id.message}</p>
          )}
        </div>
        {!isEditMode && (
          <div className="space-y-1.5">
            <Label htmlFor="status">{t('status')}</Label>
            <Controller
              control={form.control}
              name="status"
              render={({ field }) => (
                <Select value={field.value ?? 'applicant'} onValueChange={field.onChange}>
                  <SelectTrigger id="status" className="text-base">
                    <SelectValue placeholder={t('selectStatus')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="applicant">{t('applicant')}</SelectItem>
                    <SelectItem value="active">{t('active')}</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>
        )}
      </div>

      {/* Nationality + City of Birth */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="nationality">{t('nationality2')}</Label>
          <Input
            id="nationality"
            {...form.register('nationality')}
            placeholder={t('eGIrishBritishEmirati')}
            className="text-base"
          />
          {form.formState.errors.nationality && (
            <p className="text-xs text-danger-text">{form.formState.errors.nationality.message}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="city_of_birth">{t('cityOfBirth')}</Label>
          <Input
            id="city_of_birth"
            {...form.register('city_of_birth')}
            placeholder={t('eGDublinLondon')}
            className="text-base"
          />
        </div>
      </div>

      {/* Medical */}
      <div className="space-y-1.5">
        <Label htmlFor="medical_notes">{t('medicalNotes')}</Label>
        <Textarea
          id="medical_notes"
          {...form.register('medical_notes')}
          placeholder={t('anyRelevantMedicalInformation')}
          rows={3}
          className="text-base"
        />
      </div>

      {/* Allergy */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Controller
            control={form.control}
            name="has_allergy"
            render={({ field }) => (
              <Checkbox
                id="has_allergy"
                checked={field.value ?? false}
                onCheckedChange={(checked) => field.onChange(!!checked)}
              />
            )}
          />
          <Label htmlFor="has_allergy">{t('studentHasKnownAllergies')}</Label>
        </div>

        {watchHasAllergy && (
          <div className="space-y-1.5 ps-6">
            <Label htmlFor="allergy_details">{t('allergyDetails2')}</Label>
            <Textarea
              id="allergy_details"
              {...form.register('allergy_details')}
              placeholder={t('describeTheAllergiesAndAny')}
              rows={3}
              className="text-base"
            />
            {form.formState.errors.allergy_details && (
              <p className="text-xs text-danger-text">
                {form.formState.errors.allergy_details.message}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting
            ? 'Saving...'
            : isEditMode
              ? 'Save Changes'
              : 'Create Student'}
        </Button>
      </div>
    </form>
  );
}
