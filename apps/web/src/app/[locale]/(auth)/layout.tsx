import * as React from 'react';

/**
 * Auth layout — centered card with no sidebar/topbar.
 * Used for login, registration, password reset, MFA, and school selection.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-surface to-background px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">School OS</h1>
        </div>
        {children}
      </div>
    </div>
  );
}
