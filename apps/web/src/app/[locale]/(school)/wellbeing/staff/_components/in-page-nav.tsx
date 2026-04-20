'use client';

import * as React from 'react';

export interface NavSection {
  id: string;
  label: string;
}

interface InPageNavProps {
  sections: NavSection[];
}

export function InPageNav({ sections }: InPageNavProps) {
  const [activeId, setActiveId] = React.useState<string | null>(sections[0]?.id ?? null);

  React.useEffect(() => {
    if (sections.length === 0) return;

    const elements = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el !== null);

    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible.length > 0) {
          setActiveId(visible[0]!.target.id);
        }
      },
      { rootMargin: '-100px 0px -60% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] },
    );

    for (const el of elements) observer.observe(el);

    return () => observer.disconnect();
  }, [sections]);

  const handleClick = React.useCallback((e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveId(id);
      if (typeof window !== 'undefined') {
        window.history.replaceState(null, '', `#${id}`);
      }
    }
  }, []);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash.slice(1);
    if (hash && sections.some((s) => s.id === hash)) {
      const el = document.getElementById(hash);
      if (el) {
        setTimeout(() => {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 150);
        setActiveId(hash);
      }
    }
  }, [sections]);

  if (sections.length === 0) return null;

  return (
    <nav
      aria-label="Section navigation"
      className="sticky top-0 z-10 -mx-4 border-b border-border bg-surface/95 px-4 py-2 backdrop-blur md:-mx-6 md:px-6"
    >
      <div className="flex items-center gap-1 overflow-x-auto">
        {sections.map((s) => {
          const isActive = activeId === s.id;
          return (
            <a
              key={s.id}
              href={`#${s.id}`}
              onClick={(e) => handleClick(e, s.id)}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-brand text-white'
                  : 'text-text-secondary hover:bg-surface-secondary hover:text-text-primary'
              }`}
              aria-current={isActive ? 'true' : undefined}
            >
              {s.label}
            </a>
          );
        })}
      </div>
    </nav>
  );
}
