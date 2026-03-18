'use client';

import { useCallback, useState } from 'react';

interface TipTapEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

type FormatTag = 'b' | 'i' | 'u' | 's' | 'h2' | 'h3' | 'ul' | 'ol' | 'blockquote';

function wrapSelection(textarea: HTMLTextAreaElement, tag: FormatTag): string {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const value = textarea.value;
  const selected = value.substring(start, end);

  let wrapped: string;
  if (tag === 'ul') {
    const lines = selected ? selected.split('\n').map((l) => `<li>${l}</li>`).join('\n') : '<li></li>';
    wrapped = `<ul>\n${lines}\n</ul>`;
  } else if (tag === 'ol') {
    const lines = selected ? selected.split('\n').map((l) => `<li>${l}</li>`).join('\n') : '<li></li>';
    wrapped = `<ol>\n${lines}\n</ol>`;
  } else {
    wrapped = `<${tag}>${selected}</${tag}>`;
  }

  return value.substring(0, start) + wrapped + value.substring(end);
}

export function TipTapEditor({ value, onChange, placeholder, disabled }: TipTapEditorProps) {
  const [isPreview, setIsPreview] = useState(false);
  const [textareaRef, setTextareaRef] = useState<HTMLTextAreaElement | null>(null);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value);
    },
    [onChange],
  );

  const handleFormat = useCallback(
    (tag: FormatTag) => {
      if (!textareaRef || disabled) return;
      const newValue = wrapSelection(textareaRef, tag);
      onChange(newValue);
      // Restore focus after state update
      setTimeout(() => textareaRef.focus(), 0);
    },
    [textareaRef, onChange, disabled],
  );

  const toolbarButtons: { tag: FormatTag; label: string; title: string }[] = [
    { tag: 'b', label: 'B', title: 'Bold' },
    { tag: 'i', label: 'I', title: 'Italic' },
    { tag: 'u', label: 'U', title: 'Underline' },
    { tag: 's', label: 'S', title: 'Strikethrough' },
    { tag: 'h2', label: 'H2', title: 'Heading 2' },
    { tag: 'h3', label: 'H3', title: 'Heading 3' },
    { tag: 'ul', label: '•—', title: 'Unordered list' },
    { tag: 'ol', label: '1—', title: 'Ordered list' },
    { tag: 'blockquote', label: '❝', title: 'Blockquote' },
  ];

  return (
    <div className="rounded-lg border border-border bg-surface overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-1 border-b border-border bg-surface-secondary px-3 py-1.5 flex-wrap">
        {/* Format buttons */}
        {!isPreview &&
          toolbarButtons.map(({ tag, label, title }) => (
            <button
              key={tag}
              type="button"
              title={title}
              onMouseDown={(e) => {
                // Prevent textarea blur before we read selection
                e.preventDefault();
                handleFormat(tag);
              }}
              disabled={disabled}
              className="rounded px-2 py-1 text-xs font-medium text-text-secondary transition-colors hover:bg-surface hover:text-text-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {label}
            </button>
          ))}

        <div className="flex-1" />

        {/* Edit / Preview toggle */}
        <div className="flex items-center rounded-md border border-border overflow-hidden">
          <button
            type="button"
            onClick={() => setIsPreview(false)}
            className={`px-2.5 py-1 text-xs font-medium transition-colors ${
              !isPreview
                ? 'bg-primary-600 text-white'
                : 'text-text-secondary hover:bg-surface hover:text-text-primary'
            }`}
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => setIsPreview(true)}
            className={`px-2.5 py-1 text-xs font-medium transition-colors ${
              isPreview
                ? 'bg-primary-600 text-white'
                : 'text-text-secondary hover:bg-surface hover:text-text-primary'
            }`}
          >
            Preview
          </button>
        </div>
      </div>

      {/* Content area */}
      {isPreview ? (
        <div
          className="prose prose-sm max-w-none min-h-[200px] p-4 text-text-primary"
          // HTML content is authored by the authenticated user themselves (not untrusted input)
          dangerouslySetInnerHTML={{ __html: value || '<p class="text-text-tertiary">Nothing to preview</p>' }}
          dir="auto"
        />
      ) : (
        <textarea
          ref={setTextareaRef}
          value={value}
          onChange={handleChange}
          placeholder={placeholder ?? 'Write your content here… (HTML supported)'}
          disabled={disabled}
          className="w-full min-h-[200px] p-4 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary resize-y focus:outline-none font-mono disabled:opacity-60 disabled:cursor-not-allowed"
          dir="auto"
        />
      )}
    </div>
  );
}
