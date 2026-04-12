'use client';

import { Send, XCircle, Ban, FileX, FileText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import type { InvoiceStatus } from '@school/shared';
import { Button, Modal, Textarea, toast } from '@school/ui';

import { apiClient } from '@/lib/api-client';

import { PdfPreviewModal } from '../../../_components/pdf-preview-modal';

interface InvoiceForActions {
  id: string;
  status: InvoiceStatus;
  total_amount: number;
  balance_amount: number;
}

interface InvoiceActionsProps {
  invoice: InvoiceForActions;
  onActionComplete: () => void;
}

export function InvoiceActions({ invoice, onActionComplete }: InvoiceActionsProps) {
  const t = useTranslations('finance');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [showWriteOff, setShowWriteOff] = React.useState(false);
  const [writeOffReason, setWriteOffReason] = React.useState('');
  const [showVoidConfirm, setShowVoidConfirm] = React.useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = React.useState(false);
  const [showPdf, setShowPdf] = React.useState(false);

  const canIssue = invoice.status === 'draft';
  const canVoid =
    ['issued', 'overdue'].includes(invoice.status) &&
    invoice.balance_amount === invoice.total_amount;
  const canCancel = ['draft', 'pending_approval'].includes(invoice.status);
  const canWriteOff = ['issued', 'partially_paid', 'overdue'].includes(invoice.status);
  const canPrint = !['draft', 'cancelled'].includes(invoice.status);

  const handleIssue = async () => {
    setIsSubmitting(true);
    try {
      await apiClient(`/api/v1/finance/invoices/${invoice.id}/issue`, {
        method: 'POST',
      });
      toast.success(t('issueSuccess'));
      onActionComplete();
    } catch (err) {
      console.error('[InvoiceActions]', err);
      toast.error(t('issueFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVoid = async () => {
    setIsSubmitting(true);
    try {
      await apiClient(`/api/v1/finance/invoices/${invoice.id}/void`, {
        method: 'POST',
      });
      toast.success(t('voidSuccess'));
      setShowVoidConfirm(false);
      onActionComplete();
    } catch (err) {
      console.error('[InvoiceActions]', err);
      toast.error(t('voidFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = async () => {
    setIsSubmitting(true);
    try {
      await apiClient(`/api/v1/finance/invoices/${invoice.id}/cancel`, {
        method: 'POST',
      });
      toast.success(t('cancelSuccess'));
      setShowCancelConfirm(false);
      onActionComplete();
    } catch (err) {
      console.error('[InvoiceActions]', err);
      toast.error(t('cancelFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleWriteOff = async () => {
    if (!writeOffReason.trim()) {
      toast.error(t('writeOffRequiresReason'));
      return;
    }
    setIsSubmitting(true);
    try {
      await apiClient(`/api/v1/finance/invoices/${invoice.id}/write-off`, {
        method: 'POST',
        body: JSON.stringify({ write_off_reason: writeOffReason }),
      });
      toast.success(t('writeOffSuccess'));
      setShowWriteOff(false);
      setWriteOffReason('');
      onActionComplete();
    } catch (err) {
      console.error('[InvoiceActions]', err);
      toast.error(t('writeOffFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {canIssue && (
          <Button onClick={() => void handleIssue()} disabled={isSubmitting}>
            <Send className="me-2 h-4 w-4" />
            {t('issue2')}
          </Button>
        )}

        {canVoid && (
          <Button
            variant="outline"
            onClick={() => setShowVoidConfirm(true)}
            disabled={isSubmitting}
          >
            <Ban className="me-2 h-4 w-4" />
            {t('void')}
          </Button>
        )}

        {canCancel && (
          <Button
            variant="outline"
            onClick={() => setShowCancelConfirm(true)}
            disabled={isSubmitting}
          >
            <XCircle className="me-2 h-4 w-4" />
            {t('cancel')}
          </Button>
        )}

        {canWriteOff && (
          <Button variant="outline" onClick={() => setShowWriteOff(true)} disabled={isSubmitting}>
            <FileX className="me-2 h-4 w-4" />
            {t('writeOff')}
          </Button>
        )}

        {canPrint && (
          <Button variant="outline" onClick={() => setShowPdf(true)}>
            <FileText className="me-2 h-4 w-4" />
            {t('previewPdf')}
          </Button>
        )}
      </div>

      {/* PDF Preview Modal */}
      <PdfPreviewModal
        open={showPdf}
        onOpenChange={setShowPdf}
        title={t('invoicePdf')}
        pdfUrl={`/api/v1/finance/invoices/${invoice.id}/pdf`}
      />

      {/* Void confirmation */}
      <Modal
        open={showVoidConfirm}
        onOpenChange={setShowVoidConfirm}
        title={t('voidInvoice')}
        description={t('voidConfirmDescription')}
        confirmLabel={t('voidInvoiceAction')}
        variant="destructive"
        isLoading={isSubmitting}
        onConfirm={() => void handleVoid()}
      />

      {/* Cancel confirmation */}
      <Modal
        open={showCancelConfirm}
        onOpenChange={setShowCancelConfirm}
        title={t('cancelInvoice')}
        description={t('cancelConfirmDescription')}
        confirmLabel={t('cancelInvoiceAction')}
        variant="destructive"
        isLoading={isSubmitting}
        onConfirm={() => void handleCancel()}
      />

      {/* Write-off dialog */}
      <Modal
        open={showWriteOff}
        onOpenChange={(open) => {
          setShowWriteOff(open);
          if (!open) setWriteOffReason('');
        }}
        title={t('writeOffInvoice')}
        description={t('writeOffConfirmDescription')}
        confirmLabel={t('writeOffAction')}
        variant="destructive"
        isLoading={isSubmitting}
        onConfirm={() => void handleWriteOff()}
      >
        <div className="space-y-2">
          <Textarea
            placeholder={t('enterWriteOffReason')}
            value={writeOffReason}
            onChange={(e) => setWriteOffReason(e.target.value)}
            rows={3}
          />
        </div>
      </Modal>
    </>
  );
}
