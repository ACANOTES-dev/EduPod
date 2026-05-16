'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import * as React from 'react';
import { useForm } from 'react-hook-form';

import { invitePlatformUserSchema, type InvitePlatformUserDto } from '@school/shared';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  Textarea,
} from '@school/ui';

import { RoleSelector } from './role-selector';

interface InvitePlatformUserDialogProps {
  loading: boolean;
  onSubmit: (dto: InvitePlatformUserDto) => Promise<void>;
}

export function InvitePlatformUserDialog({ loading, onSubmit }: InvitePlatformUserDialogProps) {
  const [open, setOpen] = React.useState(false);
  const form = useForm<InvitePlatformUserDto>({
    resolver: zodResolver(invitePlatformUserSchema),
    defaultValues: {
      email: '',
      first_name: '',
      last_name: '',
      role_keys: ['platform_support'],
      notes: '',
    },
  });

  const submit = form.handleSubmit(async (values) => {
    await onSubmit(values);
    form.reset();
    setOpen(false);
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Invite</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite platform user</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="platform-first-name">First name</Label>
              <Input id="platform-first-name" {...form.register('first_name')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="platform-last-name">Last name</Label>
              <Input id="platform-last-name" {...form.register('last_name')} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="platform-email">Email</Label>
            <Input id="platform-email" type="email" {...form.register('email')} />
          </div>
          <RoleSelector
            value={form.watch('role_keys')}
            onChange={(roleKeys) =>
              form.setValue('role_keys', roleKeys, { shouldDirty: true, shouldValidate: true })
            }
          />
          <div className="space-y-2">
            <Label htmlFor="platform-notes">Notes</Label>
            <Textarea id="platform-notes" rows={3} {...form.register('notes')} />
          </div>
          {Object.values(form.formState.errors).length > 0 ? (
            <p className="text-sm text-danger-text">Check the invite details and try again.</p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Inviting...' : 'Send invite'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
