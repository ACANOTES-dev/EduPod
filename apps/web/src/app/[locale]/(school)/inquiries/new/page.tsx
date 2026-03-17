'use client';

import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, Input, Label, Textarea, toast } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CreateInquiryPayload {
  subject: string;
  message: string;
  student_id?: string;
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
      if (studentId.trim()) {
        payload.student_id = studentId.trim();
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
            <ArrowLeft className="me-2 h-4 w-4" />
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

          {/* Optional student */}
          <div className="space-y-2">
            <Label htmlFor="student-id">{t('inquiry.studentLabel')}</Label>
            <Input
              id="student-id"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              placeholder={t('inquiry.studentPlaceholder')}
            />
            <p className="text-xs text-text-tertiary">
              If this inquiry is about a specific student, enter their ID here.
            </p>
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
              {isSubmitting ? 'Submitting...' : tc('submit')}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
