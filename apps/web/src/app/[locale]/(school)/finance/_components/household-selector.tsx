'use client';

import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Button,
} from '@school/ui';

import { apiClient } from '@/lib/api-client';

interface Household {
  id: string;
  household_name: string;
}

interface HouseholdSelectorProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function HouseholdSelector({
  value,
  onValueChange,
  placeholder,
  disabled = false,
}: HouseholdSelectorProps) {
  const t = useTranslations('finance');
  const tCommon = useTranslations('common');
  const [open, setOpen] = React.useState(false);
  const [households, setHouseholds] = React.useState<Household[]>([]);
  const [search, setSearch] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  // Stores the selected household name when `value` is set to an id that is
  // not in the currently-loaded `households` page (e.g. after a server
  // filter). Without this, the trigger would fall back to the placeholder
  // and the user would see no indication of what is selected.
  const [selectedFallback, setSelectedFallback] = React.useState<Household | null>(null);

  const fetchHouseholds = React.useCallback(async (query: string) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ pageSize: '50' });
      if (query) params.set('search', query);
      const res = await apiClient<{ data: Household[] }>(`/api/v1/households?${params.toString()}`);
      setHouseholds(res.data);
    } catch (err) {
      console.error('[HouseholdSelector]', err);
      setHouseholds([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (open) {
      void fetchHouseholds(search);
    }
  }, [open, search, fetchHouseholds]);

  // Resolve `value` → household when the current page doesn't contain it.
  // This fires whenever `value` changes and covers the "editing existing
  // record" case where the preloaded row's household isn't in the default
  // search results.
  React.useEffect(() => {
    if (!value) {
      setSelectedFallback(null);
      return;
    }
    if (households.some((h) => h.id === value)) {
      setSelectedFallback(null);
      return;
    }
    if (selectedFallback?.id === value) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiClient<{ data: Household }>(`/api/v1/households/${value}`);
        if (!cancelled) setSelectedFallback(res.data);
      } catch (err) {
        console.error('[HouseholdSelector]', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [value, households, selectedFallback]);

  const selectedHousehold = households.find((h) => h.id === value) ?? selectedFallback;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
          disabled={disabled}
        >
          <span className="truncate">
            {selectedHousehold
              ? selectedHousehold.household_name
              : (placeholder ?? t('selectHousehold'))}
          </span>
          <Search className="ms-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={t('searchHouseholds')}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {isLoading ? (
              <div className="px-4 py-3 text-sm text-text-tertiary">{tCommon('loading')}</div>
            ) : (
              <>
                <CommandEmpty>{t('noHouseholdsFound')}</CommandEmpty>
                <CommandGroup>
                  {households.map((h) => (
                    <CommandItem
                      key={h.id}
                      value={h.id}
                      onSelect={() => {
                        onValueChange(h.id);
                        setOpen(false);
                      }}
                    >
                      {h.household_name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
