'use client';

import { toast } from '@school/ui';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { StudentForm, type StudentFormData } from '../_components/student-form';

export default function NewStudentPage() {
  const router = useRouter();

  const handleSubmit = async (data: StudentFormData) => {
    const res = await apiClient<{ data: { id: string } }>('/api/v1/students', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    toast.success('Student created successfully');
    router.push(`/students/${res.data.id}`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="New Student"
        description="Add a new student record"
      />
      <StudentForm onSubmit={handleSubmit} />
    </div>
  );
}
