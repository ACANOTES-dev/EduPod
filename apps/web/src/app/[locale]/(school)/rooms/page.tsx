'use client';

import {
  Building2,
  CheckSquare,
  DoorOpen,
  MoreHorizontal,
  Plus,
  Sparkles,
  Trash2,
  Edit,
  Users,
  XSquare,
} from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Badge,
  Button,
  Checkbox,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusBadge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  toast,
} from '@school/ui';

import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { RoomForm } from './_components/room-form';
import { RoomWizard } from './_components/room-wizard';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Room {
  id: string;
  name: string;
  room_type: string;
  capacity: number | null;
  is_exclusive: boolean;
  active: boolean;
}

interface RoomsResponse {
  data: Room[];
  meta: { page: number; pageSize: number; total: number };
}

interface RoomStats {
  total_rooms: number;
  active_rooms: number;
  inactive_rooms: number;
  total_capacity: number;
  type_breakdown: Array<{ room_type: string; count: number }>;
}

// ─── Room type labels for filter dropdown ─────────────────────────────────────

const ALL_ROOM_TYPES = [
  'classroom',
  'lab',
  'science_lab',
  'computer_lab',
  'art_room',
  'music_room',
  'library',
  'gym',
  'auditorium',
  'wood_workshop',
  'outdoor_yard',
  'indoor_yard',
  'outdoor',
  'other',
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RoomsPage() {
  const t = useTranslations('scheduling');
  const tc = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  // ─── Data state ───────────────────────────────────────────────────────────

  const [data, setData] = React.useState<Room[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const PAGE_SIZE = 20;
  const [isLoading, setIsLoading] = React.useState(true);

  const [typeFilter, setTypeFilter] = React.useState('all');
  const [activeFilter, setActiveFilter] = React.useState('all');

  const [formOpen, setFormOpen] = React.useState(false);
  const [editRoom, setEditRoom] = React.useState<Room | null>(null);
  const [wizardOpen, setWizardOpen] = React.useState(false);

  // ─── Stats state ──────────────────────────────────────────────────────────

  const [stats, setStats] = React.useState<RoomStats | null>(null);

  // ─── Selection state ──────────────────────────────────────────────────────

  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = React.useState(false);

  // ─── Fetchers ─────────────────────────────────────────────────────────────

  const fetchRooms = React.useCallback(async (p: number, type: string, active: string) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) });
      if (type !== 'all') params.set('room_type', type);
      if (active !== 'all') params.set('active', active);
      const res = await apiClient<RoomsResponse>(`/api/v1/rooms?${params.toString()}`);
      setData(res.data);
      setTotal(res.meta.total);
    } catch (err) {
      console.error('[RoomsPage]', err);
      setData([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchStats = React.useCallback(async () => {
    try {
      const res = await apiClient<{ data: RoomStats }>('/api/v1/rooms/stats', { silent: true });
      setStats(res.data);
    } catch (err) {
      console.error('[RoomsPage.stats]', err);
    }
  }, []);

  const refreshAll = React.useCallback(() => {
    void fetchRooms(page, typeFilter, activeFilter);
    void fetchStats();
    setSelectedIds(new Set());
  }, [page, typeFilter, activeFilter, fetchRooms, fetchStats]);

  React.useEffect(() => {
    void fetchRooms(page, typeFilter, activeFilter);
  }, [page, typeFilter, activeFilter, fetchRooms]);

  React.useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  // ─── CRUD handlers ────────────────────────────────────────────────────────

  const handleCreate = async (formData: {
    name: string;
    room_type: string;
    capacity: number | null;
    is_exclusive: boolean;
  }) => {
    await apiClient('/api/v1/rooms', {
      method: 'POST',
      body: JSON.stringify(formData),
    });
    toast.success(t('room') + ' created');
    refreshAll();
  };

  const handleEdit = async (formData: {
    name: string;
    room_type: string;
    capacity: number | null;
    is_exclusive: boolean;
  }) => {
    if (!editRoom) return;
    await apiClient(`/api/v1/rooms/${editRoom.id}`, {
      method: 'PATCH',
      body: JSON.stringify(formData),
    });
    toast.success(t('room') + ' updated');
    setEditRoom(null);
    refreshAll();
  };

  const handleDelete = async (room: Room) => {
    try {
      await apiClient(`/api/v1/rooms/${room.id}`, { method: 'DELETE' });
      toast.success(t('room') + ' deleted');
      refreshAll();
    } catch (err) {
      console.error('[RoomsPage]', err);
      toast.error(tc('errorGeneric'));
    }
  };

  // ─── Bulk delete ──────────────────────────────────────────────────────────

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(t('bulkDeleteConfirm', { count: selectedIds.size }))) return;

    setBulkDeleting(true);
    try {
      const res = await apiClient<{
        data: {
          deleted: number;
          skipped_in_use: number;
        };
      }>('/api/v1/rooms/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });

      if (res.data.skipped_in_use > 0) {
        toast.success(
          t('bulkDeletePartial', { deleted: res.data.deleted, skipped: res.data.skipped_in_use }),
        );
      } else {
        toast.success(t('bulkDeleteSuccess', { count: res.data.deleted }));
      }
      refreshAll();
    } catch (err) {
      console.error('[RoomsPage.bulkDelete]', err);
      toast.error(tc('errorGeneric'));
    } finally {
      setBulkDeleting(false);
    }
  };

  // ─── Selection helpers ────────────────────────────────────────────────────

  const isAllSelected = data.length > 0 && data.every((r) => selectedIds.has(r.id));

  const toggleAll = () => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(data.map((r) => r.id)));
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Clear selection when page/filter changes
  React.useEffect(() => {
    setSelectedIds(new Set());
  }, [page, typeFilter, activeFilter]);

  // ─── Columns ──────────────────────────────────────────────────────────────

  const columns = [
    {
      key: 'select',
      header: (
        <Checkbox checked={isAllSelected} onCheckedChange={toggleAll} aria-label={t('selectAll')} />
      ),
      render: (row: Room) => (
        <Checkbox
          checked={selectedIds.has(row.id)}
          onCheckedChange={() => toggleOne(row.id)}
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
          aria-label={row.name}
        />
      ),
      className: 'w-10',
    },
    {
      key: 'name',
      header: t('roomName'),
      render: (row: Room) => <span className="font-medium text-text-primary">{row.name}</span>,
    },
    {
      key: 'room_type',
      header: t('roomType'),
      render: (row: Room) => (
        <Badge variant="secondary" className="capitalize">
          {t(`roomTypeLabels.${row.room_type}`)}
        </Badge>
      ),
    },
    {
      key: 'capacity',
      header: t('capacity'),
      render: (row: Room) => <span className="text-text-secondary">{row.capacity ?? '—'}</span>,
    },
    {
      key: 'is_exclusive',
      header: t('exclusive'),
      render: (row: Room) => (
        <span className="text-text-secondary">{row.is_exclusive ? 'Yes' : 'No'}</span>
      ),
    },
    {
      key: 'is_active',
      header: t('active'),
      render: (row: Room) =>
        row.active ? (
          <StatusBadge status="success" dot>
            {t('active')}
          </StatusBadge>
        ) : (
          <StatusBadge status="neutral" dot>
            {t('inactive')}
          </StatusBadge>
        ),
    },
    {
      key: 'actions',
      header: tc('actions'),
      render: (row: Room) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" onClick={(e) => e.stopPropagation()}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                setEditRoom(row);
              }}
            >
              <Edit className="me-2 h-4 w-4" />
              {tc('edit')}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-red-600"
              onClick={(e) => {
                e.stopPropagation();
                void handleDelete(row);
              }}
            >
              <Trash2 className="me-2 h-4 w-4" />
              {tc('delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  // ─── Toolbar ──────────────────────────────────────────────────────────────

  const toolbar = (
    <div className="flex flex-wrap items-center gap-3">
      <Select
        value={typeFilter}
        onValueChange={(v) => {
          setTypeFilter(v);
          setPage(1);
        }}
      >
        <SelectTrigger className="w-40">
          <SelectValue placeholder={t('roomType')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('allTypes')}</SelectItem>
          {ALL_ROOM_TYPES.map((type) => (
            <SelectItem key={type} value={type}>
              {t(`roomTypeLabels.${type}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={activeFilter}
        onValueChange={(v) => {
          setActiveFilter(v);
          setPage(1);
        }}
      >
        <SelectTrigger className="w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{tc('all')}</SelectItem>
          <SelectItem value="true">{t('active')}</SelectItem>
          <SelectItem value="false">{t('inactive')}</SelectItem>
        </SelectContent>
      </Select>

      {/* Bulk delete */}
      {selectedIds.size > 0 && (
        <Button
          variant="outline"
          size="sm"
          className="border-danger-border text-danger-text hover:bg-danger-bg"
          onClick={handleBulkDelete}
          disabled={bulkDeleting}
        >
          <Trash2 className="me-2 h-4 w-4" />
          {t('bulkDelete')} ({selectedIds.size})
        </Button>
      )}
    </div>
  );

  // ─── Stats cards ──────────────────────────────────────────────────────────

  const topRoomTypes = stats?.type_breakdown.slice(0, 3) ?? [];

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('rooms')}
        description={t('roomsDescription')}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setWizardOpen(true)}>
              <Sparkles className="me-2 h-4 w-4" />
              {t('roomWizard')}
            </Button>
            <Button onClick={() => setFormOpen(true)}>
              <Plus className="me-2 h-4 w-4" />
              {t('createRoom')}
            </Button>
          </div>
        }
      />

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {/* Total rooms */}
          <div className="relative overflow-hidden rounded-2xl border border-border bg-surface p-4 shadow-sm">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-indigo-400 via-indigo-500 to-indigo-600" />
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
                <DoorOpen className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                  {t('totalRooms')}
                </p>
                <p className="text-2xl font-bold text-text-primary">{stats.total_rooms}</p>
              </div>
            </div>
          </div>

          {/* Active rooms */}
          <div className="relative overflow-hidden rounded-2xl border border-border bg-surface p-4 shadow-sm">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-400 via-emerald-500 to-emerald-600" />
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                <CheckSquare className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                  {t('activeRooms')}
                </p>
                <p className="text-2xl font-bold text-text-primary">{stats.active_rooms}</p>
              </div>
            </div>
          </div>

          {/* Total capacity */}
          <div className="relative overflow-hidden rounded-2xl border border-border bg-surface p-4 shadow-sm">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600" />
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                  {t('totalCapacity')}
                </p>
                <p className="text-2xl font-bold text-text-primary">{stats.total_capacity}</p>
              </div>
            </div>
          </div>

          {/* Room types breakdown */}
          <div className="relative overflow-hidden rounded-2xl border border-border bg-surface p-4 shadow-sm">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-violet-400 via-violet-500 to-violet-600" />
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
                <Building2 className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                  {t('roomTypeBreakdown')}
                </p>
                <div className="mt-0.5 flex flex-wrap gap-1">
                  {topRoomTypes.map((tb) => (
                    <Badge key={tb.room_type} variant="secondary" className="text-[10px]">
                      {t(`roomTypeLabels.${tb.room_type}`)} {tb.count}
                    </Badge>
                  ))}
                  {stats.type_breakdown.length > 3 && (
                    <Badge variant="secondary" className="text-[10px]">
                      +{stats.type_breakdown.length - 3}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Selection bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-primary-200 bg-primary-50 px-4 py-2">
          <span className="text-sm font-medium text-primary-700">
            {t('selected', { count: selectedIds.size })}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-text-secondary"
            onClick={() => setSelectedIds(new Set())}
          >
            <XSquare className="me-1 h-3.5 w-3.5" />
            {tc('cancel')}
          </Button>
        </div>
      )}

      <DataTable
        columns={columns}
        data={data}
        toolbar={toolbar}
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        onPageChange={setPage}
        keyExtractor={(row) => row.id}
        isLoading={isLoading}
        onRowClick={(row) => router.push(`/${locale}/rooms/${row.id}`)}
      />

      <RoomForm open={formOpen} onOpenChange={setFormOpen} onSubmit={handleCreate} />

      {editRoom && (
        <RoomForm
          open={!!editRoom}
          onOpenChange={(open) => {
            if (!open) setEditRoom(null);
          }}
          onSubmit={handleEdit}
          initialData={{
            name: editRoom.name,
            room_type: editRoom.room_type,
            capacity: editRoom.capacity,
            is_exclusive: editRoom.is_exclusive,
          }}
          isEdit
        />
      )}

      <RoomWizard open={wizardOpen} onOpenChange={setWizardOpen} onComplete={refreshAll} />
    </div>
  );
}
