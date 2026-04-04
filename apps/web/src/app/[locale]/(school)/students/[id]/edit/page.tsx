'use client';

import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Skeleton, toast } from '@school/ui';


import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { StudentForm, type StudentFormData } from '../../_components/student-form';


interface StudentDetail {
  id: string;
  first_name: string;
  last_name: string;
  date_of_birth?: string | null;
  gender?: string | null;
  household_id?: string | null;
  year_group_id?: string | null;
  status: string;
  national_id?: string | null;
  nationality?: string | null;
  city_of_birth?: string | null;
  medical_notes?: string | null;
  has_allergy: boolean;
  allergy_details?: string | null;
}

export default function EditStudentPage() {
  const _params = useParams<{ id: string }>();
  const id = _params?.id ?? '';
  const t = useTranslations('students');
  const router = useRouter();

  const [student, setStudent] = React.useState<StudentDetail | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    const fetch = async () => {
      setIsLoading(true);
      try {
        const res = await apiClient<{ data: StudentDetail }>(`/api/v1/students/${id}`);
        setStudent(res.data);
      } catch (err) {
        console.error('[StudentsEditPage]', err);
        toast.error('Failed to load student');
      } finally {
        setIsLoading(false);
      }
    };
    void fetch();
  }, [id]);

  const handleSubmit = async (data: StudentFormData) => {
    await apiClient<{ data: StudentDetail }>(`/api/v1/students/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    toast.success('Student updated successfully');
    router.push(`/students/${id}`);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full max-w-2xl" />
      </div>
    );
  }

  if (!student) {
    return (
      <div className="flex h-64 items-center justify-center text-text-tertiary">{t('studentNotFound')}</div>
    );
  }

  const initialData: Partial<StudentFormData> = {
    first_name: student.first_name,
    last_name: student.last_name,
    date_of_birth: student.date_of_birth
      ? new Date(student.date_of_birth).toISOString().split('T')[0]
      : '',
    gender: student.gender ?? '',
    household_id: student.household_id ?? '',
    year_group_id: student.year_group_id ?? '',
    national_id: student.national_id ?? '',
    nationality: student.nationality ?? '',
    city_of_birth: student.city_of_birth ?? '',
    medical_notes: student.medical_notes ?? '',
    has_allergy: student.has_allergy,
    allergy_details: student.allergy_details ?? '',
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('edit')}
        description={`Editing record for ${student.first_name} ${student.last_name}`}
      />
      <StudentForm initialData={initialData} onSubmit={handleSubmit} isEditMode />
    </div>
  );
}
