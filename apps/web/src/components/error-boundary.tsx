'use client';

import { Button } from '@school/ui';
import { AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  className?: string;
  fallback?: React.ReactNode;
  onReset?: () => void;
  resetKeys?: unknown[];
}

interface InternalErrorBoundaryProps extends ErrorBoundaryProps {
  description: string;
  retryLabel: string;
  title: string;
}

interface InternalErrorBoundaryState {
  error: Error | null;
  hasError: boolean;
}

function haveResetKeysChanged(previous: unknown[] = [], next: unknown[] = []): boolean {
  return (
    previous.length !== next.length ||
    previous.some((value, index) => !Object.is(value, next[index]))
  );
}

class InternalErrorBoundary extends React.Component<
  InternalErrorBoundaryProps,
  InternalErrorBoundaryState
> {
  override state: InternalErrorBoundaryState = {
    error: null,
    hasError: false,
  };

  static getDerivedStateFromError(error: Error): InternalErrorBoundaryState {
    return {
      error,
      hasError: true,
    };
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  override componentDidUpdate(previousProps: InternalErrorBoundaryProps) {
    if (
      this.state.hasError &&
      haveResetKeysChanged(previousProps.resetKeys, this.props.resetKeys)
    ) {
      this.reset();
    }
  }

  private reset = () => {
    this.setState({
      error: null,
      hasError: false,
    });
    this.props.onReset?.();
  };

  override render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          className={
            this.props.className ??
            'flex min-h-[280px] flex-col items-center justify-center rounded-3xl border border-border bg-surface px-6 py-12 text-center'
          }
        >
          <AlertTriangle className="h-10 w-10 text-warning-600" />
          <h2 className="mt-4 text-lg font-semibold text-text-primary">{this.props.title}</h2>
          <p className="mt-2 max-w-md text-sm text-text-secondary">{this.props.description}</p>
          <Button className="mt-5" variant="outline" onClick={this.reset}>
            {this.props.retryLabel}
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

export function ErrorBoundary(props: ErrorBoundaryProps) {
  const t = useTranslations('common');

  return (
    <InternalErrorBoundary
      {...props}
      description={t('errorBoundaryDescription')}
      retryLabel={t('errorBoundaryRetry')}
      title={t('errorBoundaryTitle')}
    />
  );
}
