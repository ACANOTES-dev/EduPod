'use client';

import type { CreateAlertRuleDto } from '@school/shared';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@school/ui';

import { AlertRuleForm } from './alert-rule-form';
import type { PlatformAlertRule } from './alert-rule-list';

interface RuleFormDialogProps {
  initialData?: PlatformAlertRule | null;
  loading: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: CreateAlertRuleDto) => void;
  open: boolean;
}

export function RuleFormDialog({
  initialData = null,
  loading,
  onOpenChange,
  onSubmit,
  open,
}: RuleFormDialogProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="end" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader className="pe-8">
          <SheetTitle>{initialData ? 'Edit Alert Rule' : 'Create Alert Rule'}</SheetTitle>
        </SheetHeader>
        <div className="mt-5">
          <AlertRuleForm
            initialData={initialData}
            loading={loading}
            onCancel={() => onOpenChange(false)}
            onSubmit={onSubmit}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
