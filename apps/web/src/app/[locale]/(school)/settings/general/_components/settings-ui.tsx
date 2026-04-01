'use client';

import { ChevronDown, ChevronUp } from 'lucide-react';
import * as React from 'react';

import {
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
} from '@school/ui';

// ─── SectionCard ──────────────────────────────────────────────────────────────

export function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(true);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      <button
        type="button"
        className="flex w-full items-center justify-between px-6 py-4 text-start transition-colors hover:bg-surface-secondary"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div>
          <span className="text-sm font-semibold text-text-primary">{title}</span>
          {description && <p className="mt-0.5 text-xs text-text-tertiary">{description}</p>}
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-text-tertiary" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-text-tertiary" />
        )}
      </button>

      {open && <div className="space-y-4 border-t border-border px-6 py-5">{children}</div>}
    </div>
  );
}

// ─── SubSectionCard ───────────────────────────────────────────────────────────

export function SubSectionCard({
  title,
  description,
  children,
  defaultOpen = false,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface-secondary">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-start transition-colors hover:bg-surface"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div>
          <span className="text-sm font-medium text-text-primary">{title}</span>
          {description && <p className="mt-0.5 text-xs text-text-tertiary">{description}</p>}
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-text-tertiary" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-text-tertiary" />
        )}
      </button>

      {open && <div className="space-y-4 border-t border-border px-4 py-4">{children}</div>}
    </div>
  );
}

// ─── BooleanRow ───────────────────────────────────────────────────────────────

export function BooleanRow({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const id = React.useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1 space-y-0.5">
        <Label htmlFor={id} className="text-sm text-text-primary">
          {label}
        </Label>
        {description && <p className="text-xs text-text-tertiary">{description}</p>}
      </div>
      <Switch id={id} checked={value} onCheckedChange={onChange} className="shrink-0" />
    </div>
  );
}

// ─── NumberRow ────────────────────────────────────────────────────────────────

export function NumberRow({
  label,
  description,
  value,
  onChange,
  min,
  max,
  nullable,
}: {
  label: string;
  description?: string;
  value: number | null;
  onChange: (v: number | null) => void;
  min?: number;
  max?: number;
  nullable?: boolean;
}) {
  const id = React.useId();
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0 flex-1 space-y-0.5">
        <Label htmlFor={id} className="text-sm text-text-primary">
          {label}
        </Label>
        {description && <p className="text-xs text-text-tertiary">{description}</p>}
      </div>
      <Input
        id={id}
        type="number"
        value={value ?? ''}
        onChange={(e) => {
          const raw = e.target.value;
          if (nullable && raw === '') {
            onChange(null);
          } else {
            const n = parseInt(raw, 10);
            if (!isNaN(n)) onChange(n);
          }
        }}
        min={min}
        max={max}
        className="w-full shrink-0 text-end sm:w-28"
        placeholder={nullable ? '—' : undefined}
      />
    </div>
  );
}

// ─── SelectRow ────────────────────────────────────────────────────────────────

export function SelectRow({
  label,
  description,
  value,
  options,
  onChange,
}: {
  label: string;
  description?: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const id = React.useId();
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0 flex-1 space-y-0.5">
        <Label htmlFor={id} className="text-sm text-text-primary">
          {label}
        </Label>
        {description && <p className="text-xs text-text-tertiary">{description}</p>}
      </div>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full shrink-0 sm:w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ─── TextRow ─────────────────────────────────────────────────────────────────

export function TextRow({
  label,
  description,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  description?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const id = React.useId();
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0 flex-1 space-y-0.5">
        <Label htmlFor={id} className="text-sm text-text-primary">
          {label}
        </Label>
        {description && <p className="text-xs text-text-tertiary">{description}</p>}
      </div>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full shrink-0 sm:w-56"
      />
    </div>
  );
}

// ─── TextareaRow ──────────────────────────────────────────────────────────────

export function TextareaRow({
  label,
  description,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  description?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const id = React.useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm text-text-primary">
        {label}
      </Label>
      {description && <p className="text-xs text-text-tertiary">{description}</p>}
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="text-sm"
      />
    </div>
  );
}
