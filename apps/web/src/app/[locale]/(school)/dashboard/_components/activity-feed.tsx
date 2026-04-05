'use client';
import { UserPlus, Settings, BookOpen } from 'lucide-react';
import Link from 'next/link';

export function ActivityFeed() {
  const activities = [
    {
      id: 1,
      icon: UserPlus,
      iconBg: 'bg-emerald-100 dark:bg-emerald-500/20',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
      title: 'New student admission',
      description: 'Sarah Jenkins (Year 1) application approved',
      time: '12m ago',
    },
    {
      id: 2,
      icon: BookOpen,
      iconBg: 'bg-purple-100 dark:bg-purple-500/20',
      iconColor: 'text-purple-600 dark:text-purple-400',
      title: 'Term grades published',
      description: 'Mr. Davis published Year 10 Maths grades',
      time: '2h ago',
    },
    {
      id: 3,
      icon: Settings,
      iconBg: 'bg-gray-100 dark:bg-gray-500/20',
      iconColor: 'text-gray-600 dark:text-gray-400',
      title: 'System settings updated',
      description: 'Fee collection cutoff date modified',
      time: '4h ago',
    },
  ];

  return (
    <div className="rounded-[16px] border border-border bg-surface p-5 shadow-sm flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[16px] font-semibold text-text-primary">Today&apos;s Activity</h3>
        <Link href="/reports/audit" className="text-[12px] font-medium text-primary-600 hover:text-primary-700 transition-colors">
          View all log &rarr;
        </Link>
      </div>
      
      <div className="flex flex-col gap-3">
        {activities.map(item => {
          const Icon = item.icon;
          return (
            <div key={item.id} className="flex items-center gap-3 rounded-xl p-2 hover:bg-surface-secondary transition-colors">
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] ${item.iconBg}`}>
                <Icon className={`h-4 w-4 ${item.iconColor}`} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-medium text-text-primary truncate">{item.title}</p>
                <p className="text-[12px] text-text-tertiary truncate">{item.description}</p>
              </div>
              <span className="shrink-0 text-[12px] text-text-tertiary">{item.time}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
