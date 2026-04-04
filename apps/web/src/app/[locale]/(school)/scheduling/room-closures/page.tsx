'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@school/ui';

import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Room {
  id: string;
  name: string;
}

interface RoomClosureRow {
  id: string;
  room_id: string;
  room_name: string;
  date_from: string;
  date_to: string;
  reason: string;
  created_by_name: string;
  created_at: string;
}

interface FormState {
  room_id: string;
  date_from: string;
  date_to: string;
  reason: string;
}

const EMPTY_FORM: FormState = {
  room_id: '',
  date_from: '',
  date_to: '',
  reason: '',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RoomClosuresPage() {
  const tv = useTranslations('scheduling.v2');
  const tc = useTranslations('common');

  const [rooms, setRooms] = React.useState<Room[]>([]);
  const [data, setData] = React.useState<RoomClosureRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const PAGE_SIZE = 20;
  const [isLoading, setIsLoading] = React.useState(true);

  const [roomFilter, setRoomFilter] = React.useState('all');
  const [formOpen, setFormOpen] = React.useState(false);
  const [form, setForm] = React.useState<FormState>(EMPTY_FORM);
  const [isSaving, setIsSaving] = React.useState(false);

  // Load rooms
  React.useEffect(() => {
    apiClient<{ data: Room[] }>('/api/v1/rooms?pageSize=100')
      .then((res) => setRooms(res.data))
      .catch((err) => { console.error('[SchedulingRoomClosuresPage]', err); });
  }, []);

  // Fetch closures
  const fetchData = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (roomFilter !== 'all') params.set('room_id', roomFilter);
      const res = await apiClient<{
        data: RoomClosureRow[];
        meta: { total: number };
      }>(`/api/v1/scheduling/room-closures?${params.toString()}`);
      setData(res.data);
      setTotal(res.meta.total);
    } catch (err) {
      console.error('[SchedulingRoomClosuresPage]', err);
      setData([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [page, roomFilter]);

  React.useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleSave = async () => {
    if (!form.room_id || !form.date_from || !form.date_to || !form.reason.trim()) return;
    setIsSaving(true);
    try {
      await apiClient('/api/v1/scheduling/room-closures', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setFormOpen(false);
      setForm(EMPTY_FORM);
      toast.success(tc('save'));
      void fetchData();
    } catch (err) {
      console.error('[SchedulingRoomClosuresPage]', err);
      toast.error(tc('errorGeneric'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiClient(`/api/v1/scheduling/room-closures/${id}`, { method: 'DELETE' });
      toast.success(tc('delete'));
      void fetchData();
    } catch (err) {
      console.error('[SchedulingRoomClosuresPage]', err);
      toast.error(tc('errorGeneric'));
    }
  };

  const columns = [
    {
      key: 'room',
      header: tv('rcRoom'),
      render: (row: RoomClosureRow) => (
        <span className="font-medium text-text-primary">{row.room_name}</span>
      ),
    },
    {
      key: 'date_from',
      header: tv('rcDateFrom'),
      render: (row: RoomClosureRow) => <span className="text-text-secondary">{row.date_from}</span>,
    },
    {
      key: 'date_to',
      header: tv('rcDateTo'),
      render: (row: RoomClosureRow) => <span className="text-text-secondary">{row.date_to}</span>,
    },
    {
      key: 'reason',
      header: tv('rcReason'),
      render: (row: RoomClosureRow) => <span className="text-text-secondary">{row.reason}</span>,
    },
    {
      key: 'created_by',
      header: tv('rcCreatedBy'),
      render: (row: RoomClosureRow) => (
        <span className="text-text-tertiary text-xs">{row.created_by_name}</span>
      ),
    },
    {
      key: 'actions',
      header: tc('actions'),
      render: (row: RoomClosureRow) => (
        <Button variant="ghost" size="sm" onClick={() => void handleDelete(row.id)}>
          <Trash2 className="h-3.5 w-3.5 text-red-500" />
        </Button>
      ),
    },
  ];

  const toolbar = (
    <div className="flex flex-wrap items-center gap-3">
      <Select
        value={roomFilter}
        onValueChange={(v) => {
          setRoomFilter(v);
          setPage(1);
        }}
      >
        <SelectTrigger className="w-full sm:w-48">
          <SelectValue placeholder={tv('rcFilterRoom')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{tc('all')}</SelectItem>
          {rooms.map((r) => (
            <SelectItem key={r.id} value={r.id}>
              {r.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={tv('roomClosures')}
        description={tv('roomClosuresDesc')}
        actions={
          <Button
            size="sm"
            onClick={() => {
              setForm(EMPTY_FORM);
              setFormOpen(true);
            }}
          >
            <Plus className="me-1.5 h-3.5 w-3.5" />
            {tv('addClosure')}
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
      />

      {/* Create Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{tv('addClosure')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>{tv('rcRoom')}</Label>
              <Select
                value={form.room_id}
                onValueChange={(v) => setForm((f) => ({ ...f, room_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={tv('rcSelectRoom')} />
                </SelectTrigger>
                <SelectContent>
                  {rooms.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{tv('rcDateFrom')}</Label>
                <Input
                  type="date"
                  value={form.date_from}
                  onChange={(e) => setForm((f) => ({ ...f, date_from: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{tv('rcDateTo')}</Label>
                <Input
                  type="date"
                  value={form.date_to}
                  onChange={(e) => setForm((f) => ({ ...f, date_to: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{tv('rcReason')}</Label>
              <Input
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                placeholder={tv('rcReasonPlaceholder')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button
              onClick={() => void handleSave()}
              disabled={
                isSaving || !form.room_id || !form.date_from || !form.date_to || !form.reason.trim()
              }
            >
              {isSaving ? '...' : tc('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
