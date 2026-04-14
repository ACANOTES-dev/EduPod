'use client';

import { AlertCircle, Users } from 'lucide-react';
import * as React from 'react';

import { Badge, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@school/ui';

import type { StaffProfile, SubstituteCompetency, Subject } from './types';

export function PinMatrix({
  classId,
  subjects,
  teachers,
  isLoading,
  pinFor,
  pooledTeacherIdsForSubject,
  subjectHasAnyCompetency,
  onSet,
  t,
}: {
  classId: string;
  subjects: Subject[];
  teachers: StaffProfile[];
  isLoading: boolean;
  pinFor: (classId: string, subjectId: string) => SubstituteCompetency | undefined;
  pooledTeacherIdsForSubject: (subjectId: string) => Set<string>;
  subjectHasAnyCompetency: (subjectId: string) => boolean;
  onSet: (classId: string, subjectId: string, teacherId: string | null) => Promise<void>;
  t: {
    subject: string;
    teacher: string;
    pinned: string;
    none: string;
    pooled: string;
    others: string;
    select: string;
    missing: string;
    loading: string;
  };
}) {
  return (
    <div className="rounded-2xl border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-secondary">
              <th className="px-4 py-3 text-start text-xs font-medium text-text-tertiary uppercase min-w-[200px]">
                {t.subject}
              </th>
              <th className="px-4 py-3 text-start text-xs font-medium text-text-tertiary uppercase">
                {t.teacher}
              </th>
              <th className="px-4 py-3 text-start text-xs font-medium text-text-tertiary uppercase w-24">
                {/* status */}
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-text-tertiary">
                  {t.loading}
                </td>
              </tr>
            ) : (
              subjects.map((subject) => {
                const pin = pinFor(classId, subject.id);
                const pooledIds = pooledTeacherIdsForSubject(subject.id);
                const pooledTeachers = teachers.filter((tt) => pooledIds.has(tt.id));
                const otherTeachers = teachers.filter((tt) => !pooledIds.has(tt.id));
                const hasAny = subjectHasAnyCompetency(subject.id);
                const value = pin?.staff_profile_id ?? '__none__';
                return (
                  <tr
                    key={subject.id}
                    className="border-t border-border hover:bg-surface-secondary/50"
                  >
                    <td className="px-4 py-2 font-medium text-text-primary">{subject.name}</td>
                    <td className="px-4 py-2">
                      <Select
                        value={value}
                        onValueChange={(v) =>
                          void onSet(classId, subject.id, v === '__none__' ? null : v)
                        }
                      >
                        <SelectTrigger className="w-full sm:w-72">
                          <SelectValue placeholder={t.select} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">{t.none}</SelectItem>
                          {pooledTeachers.length > 0 && (
                            <div className="px-2 py-1 text-[10px] font-semibold uppercase text-text-tertiary">
                              {t.pooled}
                            </div>
                          )}
                          {pooledTeachers.map((tt) => (
                            <SelectItem key={`p-${tt.id}`} value={tt.id}>
                              {tt.name}
                            </SelectItem>
                          ))}
                          {otherTeachers.length > 0 && (
                            <div className="px-2 py-1 text-[10px] font-semibold uppercase text-text-tertiary">
                              {t.others}
                            </div>
                          )}
                          {otherTeachers.map((tt) => (
                            <SelectItem key={`o-${tt.id}`} value={tt.id}>
                              {tt.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-2">
                      {pin ? (
                        <Badge variant="warning" className="gap-1">
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-600" />
                          {t.pinned}
                        </Badge>
                      ) : pooledIds.size > 0 ? (
                        <Badge variant="info" className="gap-1">
                          <Users className="h-3 w-3" />
                          {pooledIds.size}
                        </Badge>
                      ) : !hasAny ? (
                        <Badge variant="warning" className="gap-1">
                          <AlertCircle className="h-3 w-3" />
                          {t.missing}
                        </Badge>
                      ) : (
                        <span className="text-text-tertiary">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
