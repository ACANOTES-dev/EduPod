'use client';

type DashboardSnapshotData = {
  stats?: {
    total_students?: number | string;
    active_staff?: number | string;
    total_classes?: number | string;
    attendance_rate?: number | string | null;
  };
};

type SnapshotStat = {
  label: string;
  value: number | string;
};

function buildStats(data?: DashboardSnapshotData | null): SnapshotStat[] {
  const stats = data?.stats;
  return [
    {
      label: 'Total Students',
      value: stats?.total_students ?? '—',
    },
    {
      label: 'Teaching Staff',
      value: stats?.active_staff ?? '—',
    },
    {
      label: 'Active Classes',
      value: stats?.total_classes ?? '—',
    },
    {
      label: 'Attendance',
      value:
        stats?.attendance_rate != null
          ? typeof stats.attendance_rate === 'number'
            ? `${stats.attendance_rate}%`
            : stats.attendance_rate
          : '—',
    },
  ];
}

export function SchoolSnapshot({
  variant = 'default',
  data,
  customStats,
  title = 'School Snapshot',
}: {
  variant?: 'default' | 'compact';
  data?: DashboardSnapshotData | null;
  customStats?: SnapshotStat[];
  title?: string;
}) {
  const stats = customStats ?? buildStats(data);

  if (variant === 'compact') {
    return (
      <div className="grid grid-cols-2 gap-4 rounded-[16px] border border-border bg-surface p-4 shadow-sm">
        {stats.map((stat) => (
          <div key={stat.label} className="flex flex-col rounded-xl bg-surface-secondary p-3">
            <p className="text-[12px] font-medium text-text-tertiary truncate">{stat.label}</p>
            <p className="text-[20px] font-bold text-text-primary leading-tight truncate">
              {stat.value}
            </p>
          </div>
        ))}
      </div>
    );
  }

  // Default variant — 2x2 grid, no trends
  const s0 = stats[0];
  const s1 = stats[1];
  const s2 = stats[2];
  const s3 = stats[3];

  if (!s0 || !s1 || !s2 || !s3) return null;

  return (
    <div className="rounded-[16px] border border-border bg-surface p-5 shadow-sm">
      <h3 className="text-[16px] font-semibold text-text-primary mb-4">{title}</h3>

      <div className="grid grid-cols-2 gap-x-6 gap-y-1">
        {/* Row 1 */}
        <div className="flex flex-col py-3">
          <p className="text-[12px] font-medium text-text-tertiary">{s0.label}</p>
          <p className="text-[32px] font-bold text-text-primary leading-tight">{s0.value}</p>
        </div>
        <div className="flex flex-col py-3">
          <p className="text-[12px] font-medium text-text-tertiary">{s1.label}</p>
          <p className="text-[32px] font-bold text-text-primary leading-tight">{s1.value}</p>
        </div>

        {/* Divider */}
        <div className="col-span-2 border-t border-border" />

        {/* Row 2 */}
        <div className="flex flex-col py-3">
          <p className="text-[12px] font-medium text-text-tertiary">{s2.label}</p>
          <p className="text-[32px] font-bold text-text-primary leading-tight">{s2.value}</p>
        </div>
        <div className="flex flex-col py-3">
          <p className="text-[12px] font-medium text-text-tertiary">{s3.label}</p>
          <p className="text-[32px] font-bold text-text-primary leading-tight">{s3.value}</p>
        </div>
      </div>
    </div>
  );
}
