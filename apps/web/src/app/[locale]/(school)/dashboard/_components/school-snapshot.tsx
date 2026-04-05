'use client';
import { Users, GraduationCap, Grid3X3 } from 'lucide-react';
import Link from 'next/link';

function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(' ');
}

export function SchoolSnapshot({ 
  variant = 'default', 
  data,
  customStats,
  title = 'School Snapshot'
}: { 
  variant?: 'default' | 'compact', 
  data?: Record<string, unknown>,
  customStats?: Record<string, unknown>[],
  title?: string 
}) {
  const stats = customStats || [
    { label: 'Total Students', value: data?.stats?.total_students ?? '584', icon: GraduationCap, color: 'emerald', href: '/students' },
    { label: 'Teaching Staff', value: data?.stats?.active_staff ?? '42', icon: Users, color: 'blue', href: '/staff' },
    { label: 'Active Classes', value: data?.stats?.total_classes ?? '24', icon: Grid3X3, color: 'purple', href: '/classes' },
    { label: 'Attendance', value: '96.4%', icon: GraduationCap, color: 'amber', href: '/attendance' },
  ];

  const colorStyles: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
    blue: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400',
    purple: 'bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
  };

  return (
    <div className={cn(
      "rounded-[16px] border border-border bg-surface p-5 shadow-sm space-y-4",
      variant === 'compact' ? 'grid grid-cols-2 gap-4 space-y-0 p-4' : 'flex flex-col'
    )}>
      {variant === 'default' && <h3 className="text-[16px] font-semibold text-text-primary">{title}</h3>}
      <div className={cn("flex flex-col gap-3", variant === 'compact' && 'contents')}>
        {stats.map(stat => {
          const Icon = stat.icon;
          return (
            <Link key={stat.label} href={stat.href} className={cn("flex items-center gap-3 rounded-xl hover:bg-surface-secondary transition-colors p-2 -mx-2", variant === 'compact' && 'mx-0 p-3 bg-surface-secondary flex-1')}>
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] ${colorStyles[stat.color] || ''} overflow-hidden`}>
                {typeof Icon === 'string' ? (
                  <img src={Icon} alt={stat.label} className="h-full w-full object-cover" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
              </div>
              <div className={cn("min-w-0 flex-1", variant === 'compact' && "flex flex-col")}>
                <p className="text-[12px] font-medium text-text-tertiary truncate">{stat.label}</p>
                <p className="text-[20px] font-bold text-text-primary leading-tight truncate">{stat.value}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
