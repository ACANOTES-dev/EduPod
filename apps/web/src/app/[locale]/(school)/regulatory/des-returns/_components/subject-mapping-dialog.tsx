'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { useForm } from 'react-hook-form';

import {
  type CreateDesSubjectCodeMappingDto,
  createDesSubjectCodeMappingSchema,
  DES_SUBJECT_CODES,
} from '@school/shared/regulatory';
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
} from '@school/ui';

// ─── Props ──────────────────────────────────────────────────────────────────

interface SubjectMappingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: CreateDesSubjectCodeMappingDto) => Promise<void>;
  isSubmitting: boolean;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function SubjectMappingDialog({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting,
}: SubjectMappingDialogProps) {
  const t = useTranslations('regulatory.desReturns');

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

  // Auto-fill DES name + level when code is picked.
  const selectedCode = form.watch('des_code');
  React.useEffect(() => {
    if (!selectedCode) return;
    const match = DES_SUBJECT_CODES.find((s) => s.code === selectedCode);
    if (match) {
      form.setValue('des_name', match.name, { shouldValidate: true });
      form.setValue('des_level', match.level ?? '', { shouldValidate: false });
    }
  }, [selectedCode, form]);

  // Reset the form whenever the dialog closes.
  React.useEffect(() => {
    if (!open) form.reset();
  }, [open, form]);

  async function handleSubmit(values: CreateDesSubjectCodeMappingDto) {
    await onSubmit(values);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('addMappingTitle')}</DialogTitle>
          <DialogDescription>{t('addMappingDescription')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          {/* Subject ID */}
          <div className="space-y-1.5">
            <Label htmlFor="subject_id">{t('subjectId')}</Label>
            <Input
              id="subject_id"
              placeholder={t('subjectIdPlaceholder')}
              className="text-base"
              {...form.register('subject_id')}
            />
            {form.formState.errors.subject_id && (
              <p className="text-xs text-danger-text">{form.formState.errors.subject_id.message}</p>
            )}
          </div>

          {/* DES Code */}
          <div className="space-y-1.5">
            <Label htmlFor="des_code">{t('desCode')}</Label>
            <Select
              value={form.watch('des_code')}
              onValueChange={(val) => form.setValue('des_code', val, { shouldValidate: true })}
            >
              <SelectTrigger id="des_code" className="text-base">
                <SelectValue placeholder={t('selectDesCode')} />
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

          {/* DES Name */}
          <div className="space-y-1.5">
            <Label htmlFor="des_name">{t('desName')}</Label>
            <Input id="des_name" className="text-base" {...form.register('des_name')} />
            {form.formState.errors.des_name && (
              <p className="text-xs text-danger-text">{form.formState.errors.des_name.message}</p>
            )}
          </div>

          {/* DES Level */}
          <div className="space-y-1.5">
            <Label htmlFor="des_level">{t('level')}</Label>
            <Input
              id="des_level"
              placeholder={t('levelPlaceholder')}
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
                form.setValue('is_verified', checked === true, { shouldValidate: true })
              }
            />
            <Label htmlFor="is_verified" className="cursor-pointer">
              {t('markVerified')}
            </Label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-teal-600 text-white hover:bg-teal-700"
            >
              {isSubmitting ? t('saving') : t('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
