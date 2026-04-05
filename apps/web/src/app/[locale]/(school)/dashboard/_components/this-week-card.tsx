'use client';
import { useEffect, useState } from 'react';

function ProgressBar({ label, percentage, colorClass }: { label: string, percentage: number, colorClass: string }) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => setWidth(percentage), 100);
    return () => clearTimeout(timer);
  }, [percentage]);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between items-end">
        <span className="text-[12px] font-medium text-text-secondary">{label}</span>
        <span className="text-[12px] font-bold text-text-primary">{percentage}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-surface-secondary overflow-hidden">
        <div 
          className={`h-full rounded-full ${colorClass}`} 
          style={{ width: `${width}%`, transition: 'width 0.6s ease-out' }}
        />
      </div>
    </div>
  );
}

export function ThisWeekCard() {
  return (
    <div className="rounded-[16px] border border-border bg-surface p-5 shadow-sm flex flex-col gap-4">
      <h3 className="text-[16px] font-semibold text-text-primary">This Week</h3>
      <div className="space-y-4">
        <ProgressBar label="Avg. Attendance" percentage={96} colorClass="bg-success-text" />
        <ProgressBar label="Wellbeing Surveys" percentage={74} colorClass="bg-amber-500" />
        <ProgressBar label="Term Fees Collected" percentage={82} colorClass="bg-info-text" />
      </div>
    </div>
  );
}
