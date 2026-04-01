# Form Migration Guide: useState to react-hook-form

New forms must use `react-hook-form` with `zodResolver`. Hand-rolled `useState` forms may be
migrated to this pattern when they are next touched.

---

## Why

| Concern       | Hand-rolled useState                                   | react-hook-form + zodResolver                 |
| ------------- | ------------------------------------------------------ | --------------------------------------------- |
| Validation    | Duplicated — once in the schema, once in the component | Single source of truth: the Zod schema        |
| Error display | Manual tracking per field                              | `form.formState.errors.fieldName.message`     |
| Submit safety | Must remember to validate before calling API           | `form.handleSubmit()` blocks on validation    |
| Type safety   | `string` fields only unless you cast                   | Types inferred from the Zod DTO type          |
| Re-renders    | Every keystroke re-renders the whole component         | Uncontrolled by default, far fewer re-renders |

---

## Before — Hand-rolled useState form

```tsx
'use client';

import * as React from 'react';
import { toast } from 'sonner';

import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@school/ui';

import { apiClient } from '@/lib/api-client';

export function CreateNoteForm({ onSuccess }: { onSuccess: () => void }) {
  const [title, setTitle] = React.useState('');
  const [body, setBody] = React.useState('');
  const [priority, setPriority] = React.useState('normal');
  const [titleError, setTitleError] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const handleSubmit = async () => {
    // Manual validation scattered through the component
    if (!title.trim()) {
      setTitleError('Title is required');
      return;
    }
    setTitleError('');
    setIsSubmitting(true);
    try {
      await apiClient('/api/v1/notes', {
        method: 'POST',
        body: JSON.stringify({ title, body, priority }),
      });
      onSuccess();
    } catch (err: unknown) {
      toast.error('Failed to save note');
      console.error('[CreateNoteForm]', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full text-base"
        />
        {titleError && <p className="text-xs text-danger-text">{titleError}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="body">Body</Label>
        <Input
          id="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="w-full text-base"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Priority</Label>
        <Select value={priority} onValueChange={setPriority}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="high">High</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Button onClick={handleSubmit} disabled={isSubmitting}>
        Save
      </Button>
    </div>
  );
}
```

---

## After — react-hook-form + zodResolver

```tsx
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import type { CreateNoteDto } from '@school/shared';
import { createNoteSchema } from '@school/shared';
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@school/ui';

import { apiClient } from '@/lib/api-client';

export function CreateNoteForm({ onSuccess }: { onSuccess: () => void }) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const form = useForm<CreateNoteDto>({
    resolver: zodResolver(createNoteSchema),
    defaultValues: {
      title: '',
      body: '',
      priority: 'normal',
    },
  });

  const handleSubmit = form.handleSubmit(async (values) => {
    setIsSubmitting(true);
    try {
      await apiClient('/api/v1/notes', {
        method: 'POST',
        body: JSON.stringify(values),
      });
      onSuccess();
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string }; message?: string };
      toast.error(ex?.error?.message ?? ex?.message ?? 'Failed to save note');
      console.error('[CreateNoteForm]', err);
    } finally {
      setIsSubmitting(false);
    }
  });

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="title">Title</Label>
        <Input id="title" className="w-full text-base" {...form.register('title')} />
        {form.formState.errors.title && (
          <p className="text-xs text-danger-text">{form.formState.errors.title.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="body">Body</Label>
        <Input id="body" className="w-full text-base" {...form.register('body')} />
      </div>

      <div className="space-y-1.5">
        <Label>Priority</Label>
        <Select
          value={form.watch('priority')}
          onValueChange={(val) =>
            form.setValue('priority', val as CreateNoteDto['priority'], { shouldValidate: true })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="high">High</SelectItem>
          </SelectContent>
        </Select>
        {form.formState.errors.priority && (
          <p className="text-xs text-danger-text">{form.formState.errors.priority.message}</p>
        )}
      </div>

      <Button onClick={handleSubmit} disabled={isSubmitting}>
        Save
      </Button>
    </div>
  );
}
```

---

## Step-by-step migration checklist

**1. Find or create a Zod schema in `@school/shared`**

```ts
// packages/shared/src/schemas/notes.schema.ts
import { z } from 'zod';

export const createNoteSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  body: z.string().optional(),
  priority: z.enum(['low', 'normal', 'high']),
});

export type CreateNoteDto = z.infer<typeof createNoteSchema>;
```

Export both the schema and the inferred type from `packages/shared/src/index.ts`.

**2. Replace individual `useState` fields with `useForm`**

```tsx
// Remove:
const [title, setTitle] = React.useState('');
const [body, setBody] = React.useState('');
const [priority, setPriority] = React.useState('normal');

// Add:
const form = useForm<CreateNoteDto>({
  resolver: zodResolver(createNoteSchema),
  defaultValues: { title: '', body: '', priority: 'normal' },
});
```

Keep the `isSubmitting` state — it is separate from form state and controls the button.

**3. Replace `onChange` handlers with `form.register()`**

```tsx
// Before:
<Input value={title} onChange={(e) => setTitle(e.target.value)} />

// After:
<Input {...form.register('title')} />
```

For number inputs, pass `{ valueAsNumber: true }`:

```tsx
<Input type="number" {...form.register('hours', { valueAsNumber: true })} />
```

**4. Replace manual error state with `form.formState.errors`**

```tsx
// Before:
const [titleError, setTitleError] = React.useState('');
{
  titleError && <p>{titleError}</p>;
}

// After:
{
  form.formState.errors.title && (
    <p className="text-xs text-danger-text">{form.formState.errors.title.message}</p>
  );
}
```

**5. Replace the manual `onSubmit` with `form.handleSubmit()`**

```tsx
// Before — validates manually, then calls API:
const handleSubmit = async () => {
  if (!title.trim()) { setTitleError('...'); return; }
  await apiClient(...);
};

// After — validation happens inside handleSubmit; callback only runs when valid:
const handleSubmit = form.handleSubmit(async (values) => {
  await apiClient('/api/v1/notes', { method: 'POST', body: JSON.stringify(values) });
});
```

---

## Common patterns

### Select / Radix UI components

Radix `Select` does not forward ref, so `form.register()` does not work directly. Use `form.watch` + `form.setValue` instead:

```tsx
<Select
  value={form.watch('priority')}
  onValueChange={(val) =>
    form.setValue('priority', val as CreateNoteDto['priority'], { shouldValidate: true })
  }
>
```

### Checkbox / Radix Checkbox

```tsx
<Checkbox
  checked={form.watch('is_active') ?? false}
  onCheckedChange={(checked) =>
    form.setValue('is_active', checked === true, { shouldValidate: true })
  }
/>
```

### Date inputs (native `<input type="date">`)

Use `form.register()` directly — the value is a string in `YYYY-MM-DD` format which matches what the API expects:

```tsx
<Input type="date" {...form.register('start_date')} />
```

### Nullable / clearable fields

For fields that can be cleared to `null`, declare the schema field as `.nullable().optional()` and register normally. The API will receive `null` or `undefined` when the input is empty.

### Edit forms — pre-populating from server data

Pass the existing record into `defaultValues`:

```tsx
const form = useForm<UpdateNoteDto>({
  resolver: zodResolver(updateNoteSchema),
  defaultValues: {
    title: initialData.title,
    body: initialData.body ?? '',
    priority: initialData.priority,
  },
});
```

---

## Do's and Don'ts

| Do                                                                       | Don't                                                                       |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Define the Zod schema in `@school/shared`                                | Define validation logic inline in the component                             |
| Use `form.handleSubmit(async (values) => { ... })`                       | Call the API without running validation first                               |
| Show `form.formState.errors.field.message` under each field              | Show a single error banner for all fields                                   |
| Use `form.register('field', { valueAsNumber: true })` for numeric inputs | Parse `Number(e.target.value)` in an `onChange` handler                     |
| Use `form.watch('field')` + `form.setValue(...)` for Radix components    | Maintain a parallel `useState` alongside `useForm`                          |
| Keep `isSubmitting` as a separate `React.useState`                       | Use `form.formState.isSubmitting` (it resets on re-render in some patterns) |
| Call `form.reset()` after a successful create                            | Leave stale values in the form after submission                             |
