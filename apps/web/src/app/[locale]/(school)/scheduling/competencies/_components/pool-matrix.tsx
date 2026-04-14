'use client';

import * as React from 'react';

import { Checkbox } from '@school/ui';

import type { StaffProfile, Subject } from './types';

export function PoolMatrix({
  subjects,
  teachers,
  isLoading,
  isTicked,
  onToggle,
  subjectHasAnyCompetency,
  t,
}: {
  subjects: Subject[];
  teachers: StaffProfile[];
  isLoading: boolean;
  isTicked: (teacherId: string, subjectId: string) => boolean;
  onToggle: (teacherId: string, subjectId: string) => Promise<void>;
  subjectHasAnyCompetency: (subjectId: string) => boolean;
  t: { teacherName: string; missing: string; loading: string };
}) {
  return (
    <div className="rounded-2xl border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-surface-secondary">
              <th className="px-4 py-3 text-start text-xs font-medium text-text-tertiary uppercase sticky start-0 bg-surface-secondary z-10 min-w-[180px]">
                {t.teacherName}
              </th>
              {subjects.map((subject) => (
                <th
                  key={subject.id}
                  className="px-3 py-3 text-center text-xs font-medium text-text-tertiary uppercase"
                >
                  <div className="flex flex-col items-center gap-0.5">
                    <span>{subject.name}</span>
                    {!subjectHasAnyCompetency(subject.id) && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500" />
                        {t.missing}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td
                  colSpan={subjects.length + 1}
                  className="px-4 py-8 text-center text-text-tertiary"
                >
                  {t.loading}
                </td>
              </tr>
            ) : (
              teachers.map((teacher) => (
                <tr
                  key={teacher.id}
                  className="border-t border-border hover:bg-surface-secondary/50"
                >
                  <td className="px-4 py-2 font-medium text-text-primary sticky start-0 bg-surface z-10">
                    {teacher.name}
                  </td>
                  {subjects.map((subject) => {
                    const ticked = isTicked(teacher.id, subject.id);
                    return (
                      <td key={subject.id} className="px-3 py-2 text-center">
                        <Checkbox
                          checked={ticked}
                          onCheckedChange={() => void onToggle(teacher.id, subject.id)}
                          className={
                            ticked
                              ? 'border-blue-500 bg-blue-500 data-[state=checked]:bg-blue-500'
                              : ''
                          }
                        />
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
