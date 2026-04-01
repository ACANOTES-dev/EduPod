'use client';

import * as React from 'react';

import { Button, Input, Label, Textarea } from '@school/ui';

import { apiClient } from '@/lib/api-client';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PublicContactPage() {
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [honeypot, setHoneypot] = React.useState('');

  const [submitting, setSubmitting] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Honeypot: silently discard bot submissions
    if (honeypot) return;

    if (!name.trim() || !email.trim() || !message.trim()) {
      setError('Please fill in all required fields.');
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      await apiClient('/api/v1/public/contact', {
        method: 'POST',
        skipAuth: true,
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          message: message.trim(),
        }),
      });
      setSubmitted(true);
    } catch (err: unknown) {
      if (
        typeof err === 'object' &&
        err !== null &&
        'error' in err &&
        typeof (err as { error: { code?: string; message?: string } }).error === 'object'
      ) {
        const apiError = (err as { error: { code?: string; message?: string } }).error;
        if (apiError.code === 'RATE_LIMITED') {
          setError('Too many submissions. Please wait a few minutes before trying again.');
        } else {
          setError(apiError.message ?? 'Something went wrong. Please try again.');
        }
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success-surface">
          <svg
            className="h-8 w-8 text-success-text"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-semibold text-text-primary">Message Sent</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Thank you for reaching out. We will get back to you as soon as possible.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-text-primary">Contact Us</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Fill in the form below and we will be in touch soon.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          <div className="space-y-4">
            {/* Name */}
            <div className="space-y-1.5">
              <Label htmlFor="name">
                Name <span className="text-error-text">*</span>
              </Label>
              <Input
                id="name"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Your full name"
              />
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <Label htmlFor="email">
                Email <span className="text-error-text">*</span>
              </Label>
              <Input
                id="email"
                type="email"
                dir="ltr"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
              />
            </div>

            {/* Phone (optional) */}
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone (optional)</Label>
              <Input
                id="phone"
                type="tel"
                dir="ltr"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 555 000 0000"
              />
            </div>

            {/* Message */}
            <div className="space-y-1.5">
              <Label htmlFor="message">
                Message <span className="text-error-text">*</span>
              </Label>
              <Textarea
                id="message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
                placeholder="How can we help you?"
                className="min-h-[140px]"
              />
            </div>
          </div>
        </div>

        {/* Honeypot — visually hidden, not display:none so bots still fill it */}
        <div className="absolute -start-[9999px] opacity-0" aria-hidden="true">
          <Input
            tabIndex={-1}
            autoComplete="off"
            name="website_field"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
          />
        </div>

        {/* Error message */}
        {error && (
          <div className="rounded-lg border border-error-border bg-error-surface px-4 py-3">
            <p className="text-sm text-error-text">{error}</p>
          </div>
        )}

        <div className="flex justify-end">
          <Button type="submit" disabled={submitting} className="min-w-[120px]">
            {submitting ? 'Sending...' : 'Send Message'}
          </Button>
        </div>

        <p className="text-xs leading-relaxed text-text-secondary">
          Your IP address is recorded with this submission for security purposes and will be
          automatically deleted after 90 days.
        </p>
      </form>
    </div>
  );
}
