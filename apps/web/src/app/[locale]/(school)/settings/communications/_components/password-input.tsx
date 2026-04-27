'use client';

import { Eye, EyeOff } from 'lucide-react';
import * as React from 'react';

import { Input } from '@school/ui';

export function PasswordInput({
  id,
  value,
  onChange,
  placeholder,
  disabled,
  showLabel = 'Show',
  hideLabel = 'Hide',
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  showLabel?: string;
  hideLabel?: string;
}) {
  const [visible, setVisible] = React.useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="pe-10 font-mono text-base"
        autoComplete="off"
        spellCheck={false}
        dir="ltr"
      />
      <button
        type="button"
        className="absolute end-3 top-1/2 -translate-y-1/2 text-text-tertiary transition-colors hover:text-text-secondary"
        onClick={() => setVisible((v) => !v)}
        tabIndex={-1}
        aria-label={visible ? hideLabel : showLabel}
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
