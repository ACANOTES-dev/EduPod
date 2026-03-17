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
  const [open, setOpen] = React.useState(false);
  const [households, setHouseholds] = React.useState<Household[]>([]);
  const [search, setSearch] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);

  const fetchHouseholds = React.useCallback(async (query: string) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ pageSize: '50' });
      if (query) params.set('search', query);
      const res = await apiClient<{ data: Household[] }>(
        `/api/v1/households?${params.toString()}`,
      );
      setHouseholds(res.data);
    } catch {
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

  const selectedHousehold = households.find((h) => h.id === value);

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
              <div className="px-4 py-3 text-sm text-text-tertiary">Loading...</div>
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
