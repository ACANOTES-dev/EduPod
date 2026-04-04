'use client';

import { MoreHorizontal, Plus, Trash2, Edit } from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  Badge,
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RoomsPage() {
  const t = useTranslations('scheduling');
  const tCommon = useTranslations('common');
  const tc = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [data, setData] = React.useState<Room[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const PAGE_SIZE = 20;
  const [isLoading, setIsLoading] = React.useState(true);

  const [typeFilter, setTypeFilter] = React.useState('all');
  const [activeFilter, setActiveFilter] = React.useState('all');

  const [formOpen, setFormOpen] = React.useState(false);
  const [editRoom, setEditRoom] = React.useState<Room | null>(null);

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

  React.useEffect(() => {
    void fetchRooms(page, typeFilter, activeFilter);
  }, [page, typeFilter, activeFilter, fetchRooms]);

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
    void fetchRooms(page, typeFilter, activeFilter);
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
    void fetchRooms(page, typeFilter, activeFilter);
  };

  const handleDelete = async (room: Room) => {
    try {
      await apiClient(`/api/v1/rooms/${room.id}`, { method: 'DELETE' });
      toast.success(t('room') + ' deleted');
      void fetchRooms(page, typeFilter, activeFilter);
    } catch (err) {
      console.error('[RoomsPage]', err);
      toast.error(tc('errorGeneric'));
    }
  };

  const columns = [
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
          {row.room_type}
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
          <StatusBadge status="success" dot>{t('active')}</StatusBadge>
        ) : (
          <StatusBadge status="neutral" dot>{t('inactive')}</StatusBadge>
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
          {['classroom', 'lab', 'library', 'hall', 'gym', 'office', 'other'].map((type) => (
            <SelectItem key={type} value={type}>
              {type.charAt(0).toUpperCase() + type.slice(1)}
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
          <SelectItem value="all">{tCommon('all')}</SelectItem>
          <SelectItem value="true">{t('active')}</SelectItem>
          <SelectItem value="false">{t('inactive')}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('rooms')}
        actions={
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="me-2 h-4 w-4" />
            {t('createRoom')}
          </Button>
        }
      />
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
    </div>
  );
}
