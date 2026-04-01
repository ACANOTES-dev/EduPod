'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { useForm } from 'react-hook-form';

import type { CreateDesSubjectCodeMappingDto } from '@school/shared';
import { createDesSubjectCodeMappingSchema, DES_SUBJECT_CODES } from '@school/shared';
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { RegulatoryNav } from '../../_components/regulatory-nav';
import { SubjectMappingTable } from '../_components/subject-mapping-table';
import type { SubjectMapping } from '../_components/subject-mapping-table';

// ─── Page ────────────────────────────────────────────────────────────────────

export default function SubjectMappingsPage() {
  const t = useTranslations('regulatory');

  const [mappings, setMappings] = React.useState<SubjectMapping[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // ─── Form setup ──────────────────────────────────────────────────────────

  const form = useForm<CreateDesSubjectCodeMappingDto>({
    resolver: zodResolver(createDesSubjectCodeMappingSchema),
    defaultValues: {
      subject_id: '',
      des_code: '',
      des_name: '',
      des_level: '',
      is_verified: false,
    },
  });

  // ─── Fetch mappings ──────────────────────────────────────────────────────

  const fetchMappings = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await apiClient<SubjectMapping[]>('/api/v1/regulatory/des/subject-mappings', {
        silent: true,
      });
      setMappings(data);
    } catch (err) {
      console.error('[SubjectMappingsPage.fetchMappings]', err);
      setMappings([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchMappings();
  }, [fetchMappings]);

  // ─── Auto-fill DES name when code is selected ────────────────────────────

  const selectedCode = form.watch('des_code');

  React.useEffect(() => {
    if (!selectedCode) return;
    const match = DES_SUBJECT_CODES.find((s) => s.code === selectedCode);
    if (match) {
      form.setValue('des_name', match.name, { shouldValidate: true });
      form.setValue('des_level', match.level ?? '', { shouldValidate: false });
    }
  }, [selectedCode, form]);

  // ─── Create mapping ──────────────────────────────────────────────────────

  async function handleCreate(values: CreateDesSubjectCodeMappingDto) {
    setIsSubmitting(true);
    try {
      await apiClient('/api/v1/regulatory/des/subject-mappings', {
        method: 'POST',
        body: JSON.stringify(values),
      });
      toast.success(t('desReturns.mappingCreated'));
      form.reset();
      setIsDialogOpen(false);
      void fetchMappings();
    } catch (err) {
      console.error('[SubjectMappingsPage.handleCreate]', err);
      toast.error(t('desReturns.mappingCreateFailed'));
    } finally {
      setIsSubmitting(false);
    }
  }

  // ─── Delete mapping ──────────────────────────────────────────────────────

  async function handleDelete(id: string) {
    try {
      await apiClient(`/api/v1/regulatory/des/subject-mappings/${id}`, {
        method: 'DELETE',
      });
      toast.success(t('desReturns.mappingDeleted'));
      void fetchMappings();
    } catch (err) {
      console.error('[SubjectMappingsPage.handleDelete]', err);
      toast.error(t('desReturns.mappingDeleteFailed'));
    }
  }

  // ─── Dialog close/reset ──────────────────────────────────────────────────

  function handleDialogOpenChange(open: boolean) {
    setIsDialogOpen(open);
    if (!open) {
      form.reset();
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('desReturns.subjectMappingsTitle')}
        description={t('desReturns.subjectMappingsDescription')}
        actions={
          <Button size="sm" onClick={() => setIsDialogOpen(true)}>
            <Plus className="me-1.5 h-4 w-4" />
            {t('desReturns.addMapping')}
          </Button>
        }
      />

      <RegulatoryNav />

      {/* ─── Mappings Table ───────────────────────────────────────────────── */}
      <SubjectMappingTable data={mappings} onDelete={handleDelete} isLoading={isLoading} />

      {/* ─── Add Mapping Dialog ───────────────────────────────────────────── */}
      <Dialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('desReturns.addMappingTitle')}</DialogTitle>
            <DialogDescription>{t('desReturns.addMappingDescription')}</DialogDescription>
          </DialogHeader>

          <form onSubmit={form.handleSubmit(handleCreate)} className="space-y-4">
            {/* Subject ID */}
            <div className="space-y-1.5">
              <Label htmlFor="subject_id">{t('desReturns.subjectId')}</Label>
              <Input
                id="subject_id"
                placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
                className="text-base"
                {...form.register('subject_id')}
              />
              {form.formState.errors.subject_id && (
                <p className="text-xs text-danger-text">
                  {form.formState.errors.subject_id.message}
                </p>
              )}
            </div>

            {/* DES Code */}
            <div className="space-y-1.5">
              <Label htmlFor="des_code">{t('desReturns.desCode')}</Label>
              <Select
                value={form.watch('des_code')}
                onValueChange={(val) => form.setValue('des_code', val, { shouldValidate: true })}
              >
                <SelectTrigger id="des_code" className="text-base">
                  <SelectValue placeholder={t('desReturns.selectDesCode')} />
                </SelectTrigger>
                <SelectContent>
                  {DES_SUBJECT_CODES.map((subj) => (
                    <SelectItem key={subj.code} value={subj.code}>
                      {subj.code} — {subj.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.des_code && (
                <p className="text-xs text-danger-text">{form.formState.errors.des_code.message}</p>
              )}
            </div>

            {/* DES Name (auto-filled) */}
            <div className="space-y-1.5">
              <Label htmlFor="des_name">{t('desReturns.desName')}</Label>
              <Input id="des_name" className="text-base" {...form.register('des_name')} />
              {form.formState.errors.des_name && (
                <p className="text-xs text-danger-text">{form.formState.errors.des_name.message}</p>
              )}
            </div>

            {/* DES Level */}
            <div className="space-y-1.5">
              <Label htmlFor="des_level">{t('desReturns.level')}</Label>
              <Input
                id="des_level"
                placeholder={t('desReturns.levelPlaceholder')}
                className="text-base"
                {...form.register('des_level')}
              />
            </div>

            {/* Is Verified */}
            <div className="flex items-center gap-2">
              <Checkbox
                id="is_verified"
                checked={form.watch('is_verified') ?? false}
                onCheckedChange={(checked) =>
                  form.setValue('is_verified', checked === true, {
                    shouldValidate: true,
                  })
                }
              />
              <Label htmlFor="is_verified" className="cursor-pointer">
                {t('desReturns.markVerified')}
              </Label>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleDialogOpenChange(false)}>
                {t('desReturns.cancel')}
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? t('desReturns.saving') : t('desReturns.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
