'use client';

import { GraduationCap, Home, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';

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
      setResults(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      console.error('[GlobalSearch]', err);
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
  const grouped: Record<SearchResult['entity_type'], SearchResult[]> = {
    students: [],
    parents: [],
    staff: [],
    households: [],
  };
  for (const result of results) {
    if (result?.entity_type && grouped[result.entity_type]) {
      grouped[result.entity_type].push(result);
    }
  }

  const entityTypes: SearchResult['entity_type'][] = ['students', 'parents', 'staff', 'households'];

  let groups: CommandPaletteGroup[] = [];
  
  if (query.trim() && results.length > 0) {
    groups = entityTypes
      .filter((type) => grouped[type]?.length > 0)
      .map((type) => ({
        heading: t(`resultTypes.${type}`),
        items: grouped[type].slice(0, 3).map((result) => ({
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
  } else if (!query.trim()) {
    // Show empty state shortcuts natively if input is empty
    const quickActions = [
      { id: 'new-student', label: 'New Student', url: '/students/new', icon: ENTITY_ICONS['students'] },
      { id: 'new-invoice', label: 'New Invoice', url: '/finance/invoices/new', icon: ENTITY_ICONS['households'] },
      { id: 'new-staff', label: 'New Staff', url: '/staff/new', icon: ENTITY_ICONS['staff'] },
    ];
    
    // Only add if there are valid roles to display (assuming if they can search they can see, backend scopes form submission anyway)
    groups = [
      {
        heading: 'Create new...',
        items: quickActions.map(action => ({
          id: action.id,
          label: action.label,
          icon: action.icon,
          onSelect: () => {
            router.push(action.url);
            onOpenChange(false);
          }
        }))
      }
    ];
  }

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
