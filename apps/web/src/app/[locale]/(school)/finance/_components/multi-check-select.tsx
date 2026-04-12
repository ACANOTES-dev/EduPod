'use client';

import * as React from 'react';

// ─── Multi-Check Select Component ─────────────────────────────────────────────

interface MultiCheckSelectProps {
  options: Array<{ value: string; label: string }>;
  selected: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
  allLabel: string;
}

export function MultiCheckSelect({
  options,
  selected,
  onChange,
  placeholder,
  allLabel,
}: MultiCheckSelectProps) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function toggle(value: string) {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  }

  const displayText =
    selected.length === 0
      ? allLabel
      : options
          .filter((o) => selected.includes(o.value))
          .map((o) => o.label)
          .join(', ');

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-10 w-full items-center justify-between rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
      >
        <span className="truncate">{displayText}</span>
        <svg
          className={`h-4 w-4 text-text-tertiary transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-border bg-surface shadow-lg">
          {options.length === 0 ? (
            <div className="px-3 py-2 text-sm text-text-tertiary">{placeholder}</div>
          ) : (
            options.map((option) => (
              <label
                key={option.value}
                className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-text-primary hover:bg-surface-secondary"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(option.value)}
                  onChange={() => toggle(option.value)}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                />
                {option.label}
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
}
