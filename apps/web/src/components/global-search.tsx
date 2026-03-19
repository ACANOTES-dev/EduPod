'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { GraduationCap, Home, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { CommandPalette, type CommandPaletteGroup } from '@school/ui';

import { apiClient } from '@/lib/api-client';

interface SearchResult {
  id: string;
  entity_type: 'students' | 'parents' | 'staff' | 'households';
  primary_label: string;
  secondary_label?: string;
  status?: string;
  url: string;
}

interface SearchResponse {
  data: SearchResult[];
}

interface GlobalSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ENTITY_ICONS: Record<SearchResult['entity_type'], React.ReactNode> = {
  students: <GraduationCap className="h-4 w-4" />,
  parents: <Users className="h-4 w-4" />,
  staff: <Users className="h-4 w-4" />,
  households: <Home className="h-4 w-4" />,
};

export function GlobalSearch({ open, onOpenChange }: GlobalSearchProps) {
  const t = useTranslations('search');
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const executeSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const response = await apiClient<SearchResponse>(
        `/api/v1/search?q=${encodeURIComponent(q)}&types=students,parents,staff,households`,
      );
      setResults(response.data ?? []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      void executeSearch(query);
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, executeSearch]);

  // Reset query when palette closes
  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults([]);
    }
  }, [open]);

  // Group results by entity_type
  const grouped = results.reduce<Record<SearchResult['entity_type'], SearchResult[]>>(
    (acc, result) => {
      if (!acc[result.entity_type]) {
        acc[result.entity_type] = [];
      }
      acc[result.entity_type].push(result);
      return acc;
    },
    {} as Record<SearchResult['entity_type'], SearchResult[]>,
  );

  const entityTypes: SearchResult['entity_type'][] = ['students', 'parents', 'staff', 'households'];

  const groups: CommandPaletteGroup[] = entityTypes
    .filter((type) => grouped[type]?.length > 0)
    .map((type) => ({
      heading: t(`resultTypes.${type}`),
      items: grouped[type].map((result) => ({
        id: result.id,
        label: result.primary_label,
        description: result.secondary_label,
        icon: ENTITY_ICONS[result.entity_type],
        onSelect: () => {
          router.push(result.url);
          onOpenChange(false);
        },
      })),
    }));

  const emptyMessage = loading ? '...' : query.trim() ? t('noResults') : '';

  return (
    <CommandPalette
      open={open}
      onOpenChange={onOpenChange}
      placeholder={t('placeholder')}
      emptyMessage={emptyMessage}
      groups={groups}
      onQueryChange={setQuery}
    />
  );
}
