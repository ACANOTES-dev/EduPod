'use client';

import * as React from 'react';

/**
 * Auth layout — centered card with no sidebar/topbar.
 * Shows the school name derived from the subdomain (e.g., nhqs.edupod.app → "NHQS").
 * Falls back to "School OS" on the bare domain or localhost.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const [schoolName, setSchoolName] = React.useState('School OS');

  React.useEffect(() => {
    const hostname = window.location.hostname;
    const parts = hostname.split('.');
    // If subdomain exists (e.g., nhqs.edupod.app has 3+ parts), use it
    if (parts.length >= 3 && parts[0] && parts[0] !== 'www') {
      setSchoolName(parts[0].toUpperCase());
    }
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-surface to-background px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">{schoolName}</h1>
        </div>
        {children}
      </div>
    </div>
  );
}
