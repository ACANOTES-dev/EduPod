'use client';

import {
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  toast,
  Input,
} from '@school/ui';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CreateInquiryPayload {
  subject: string;
  message: string;
  student_id?: string;
}

interface LinkedStudent {
  student_id: string;
  first_name: string;
  last_name: string;
}

interface ParentDashboardData {
  students: LinkedStudent[];
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NewInquiryPage() {
  const t = useTranslations('communications');
  const tc = useTranslations('common');
  const router = useRouter();

  const [subject, setSubject] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [studentId, setStudentId] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [linkedStudents, setLinkedStudents] = React.useState<LinkedStudent[]>([]);

  React.useEffect(() => {
    apiClient<{ data: ParentDashboardData }>('/api/v1/dashboard/parent')
      .then((res) => {
        if (res.data?.students) {
          setLinkedStudents(res.data.students);
        }
      })
      .catch(() => undefined);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) {
      toast.error('Subject and message are required');
      return;
    }
    setIsSubmitting(true);
    try {
      const payload: CreateInquiryPayload = {
        subject: subject.trim(),
        message: message.trim(),
      };
      if (studentId) {
        payload.student_id = studentId;
      }
      const res = await apiClient<{ id: string }>('/api/v1/inquiries', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      toast.success(t('inquiry.submitSuccess'));
      router.push(`/inquiries/${res.id}`);
    } catch {
      toast.error(t('inquiry.submitError'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('inquiry.newInquiry')}
        actions={
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" />
            {tc('back')}
          </Button>
        }
      />

      <form onSubmit={handleSubmit}>
        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm space-y-6">
          {/* Subject */}
          <div className="space-y-2">
            <Label htmlFor="subject">{t('inquiry.subjectLabel')}</Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={t('inquiry.subjectPlaceholder')}
              maxLength={200}
              required
            />
          </div>

          {/* Message */}
          <div className="space-y-2">
            <Label htmlFor="message">{t('inquiry.messageLabel')}</Label>
            <Textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t('inquiry.messagePlaceholder')}
              rows={6}
              required
            />
          </div>

          {/* Optional student — dropdown of linked children */}
          <div className="space-y-2">
            <Label htmlFor="student-select">{t('inquiry.studentLabel')}</Label>
            {linkedStudents.length > 0 ? (
              <Select value={studentId} onValueChange={setStudentId}>
                <SelectTrigger id="student-select" className="w-full">
                  <SelectValue placeholder={t('inquiry.studentPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('inquiry.noStudent')}</SelectItem>
                  {linkedStudents.map((s) => (
                    <SelectItem key={s.student_id} value={s.student_id}>
                      {s.first_name} {s.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-text-tertiary">{tc('loading')}</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
            <Button variant="ghost" type="button" onClick={() => router.back()}>
              {tc('cancel')}
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !subject.trim() || !message.trim()}
            >
              {isSubmitting ? tc('loading') : tc('submit')}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
