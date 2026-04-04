'use client';

import { useRouter, usePathname } from 'next/navigation';
import * as React from 'react';

import { apiClient, setAccessToken } from '@/lib/api-client';

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

export interface AuthUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  preferred_locale: string | null;
  mfa_enabled: boolean;
  memberships?: Array<{
    id: string;
    tenant_id: string;
    membership_status: string;
    tenant?: { id: string; name: string; slug: string };
    roles?: Array<{ id: string; role_key: string; display_name: string }>;
  }>;
}

export interface LoginResult {
  success?: boolean;
  mfa_required?: boolean;
  mfa_session_token?: string;
  error?: string;
}

export interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string, mfaCode?: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  switchTenant: (tenantId: string) => Promise<void>;
  refreshUser: () => Promise<void>;
}

/* -------------------------------------------------------------------------- */
/*  Context                                                                   */
/* -------------------------------------------------------------------------- */

const AuthContext = React.createContext<AuthContextType | null>(null);

/* -------------------------------------------------------------------------- */
/*  Provider                                                                  */
/* -------------------------------------------------------------------------- */

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  const isAuthenticated = user !== null;

  /* ---- Fetch full user profile with memberships ---- */
  const fetchMe = React.useCallback(async (): Promise<AuthUser | null> => {
    try {
      const me = await apiClient<{
        data: {
          user: AuthUser;
          memberships: Array<{
            id: string;
            tenant_id: string;
            tenant_name: string;
            tenant_slug: string;
            membership_status: string;
            roles: Array<{ role_id: string; role_key: string; display_name: string }>;
          }>;
        };
      }>('/api/v1/auth/me');
      if (me?.data) {
        const fullUser: AuthUser = {
          ...me.data.user,
          memberships: me.data.memberships.map((m) => ({
            id: m.id,
            tenant_id: m.tenant_id,
            membership_status: m.membership_status,
            tenant: { id: m.tenant_id, name: m.tenant_name, slug: m.tenant_slug },
            roles: m.roles.map((r) => ({
              id: r.role_id,
              role_key: r.role_key,
              display_name: r.display_name,
            })),
          })),
        };
        return fullUser;
      }
      return null;
    } catch (err) {
      console.error('[AuthProvider]', err);
      return null;
    }
  }, []);

  /* ---- Bootstrap: try to restore session on mount ---- */
  React.useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      try {
        const data = await apiClient<{ data: { access_token: string } }>('/api/v1/auth/refresh', {
          method: 'POST',
          skipAuth: true,
        });
        if (!cancelled && data?.data?.access_token) {
          setAccessToken(data.data.access_token);
          const fullUser = await fetchMe();
          if (!cancelled) setUser(fullUser);
        }
      } catch (err) {
        console.error('[AuthProvider]', err);
        // No valid refresh token — user is not logged in
        setAccessToken(null);
        setUser(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [fetchMe]);

  /* ---- Login ---- */
  const login = React.useCallback(
    async (email: string, password: string, mfaCode?: string): Promise<LoginResult> => {
      try {
        const body: Record<string, string> = { email, password };
        if (mfaCode) body.mfa_code = mfaCode;

        const data = await apiClient<{
          data: {
            access_token?: string;
            user?: AuthUser;
            mfa_required?: boolean;
            mfa_session_token?: string;
          };
        }>('/api/v1/auth/login', {
          method: 'POST',
          body: JSON.stringify(body),
          skipAuth: true,
        });

        if (data?.data?.mfa_required) {
          return {
            mfa_required: true,
            mfa_session_token: data.data.mfa_session_token,
          };
        }

        if (data?.data?.access_token) {
          setAccessToken(data.data.access_token);
          // Fetch full user profile with memberships
          const fullUser = await fetchMe();
          setUser(fullUser);
          return { success: true };
        }

        return { error: 'Unknown error' };
      } catch (err: unknown) {
        const errorObj = err as { error?: { code?: string; message?: string } };
        return {
          error: errorObj?.error?.message ?? 'Login failed',
        };
      }
    },
    [fetchMe],
  );

  /* ---- Logout ---- */
  const logout = React.useCallback(async () => {
    try {
      await apiClient('/api/v1/auth/logout', { method: 'POST' });
    } catch (err) {
      console.error('[logout]', err);
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  }, []);

  /* ---- Switch tenant ---- */
  const switchTenant = React.useCallback(
    async (tenantId: string) => {
      try {
        const data = await apiClient<{ data: { access_token: string } }>(
          '/api/v1/auth/switch-tenant',
          {
            method: 'POST',
            body: JSON.stringify({ tenant_id: tenantId }),
          },
        );
        if (data?.data?.access_token) {
          setAccessToken(data.data.access_token);
          const fullUser = await fetchMe();
          setUser(fullUser);
        }
      } catch (err: unknown) {
        console.error('Failed to switch tenant:', err);
      }
    },
    [fetchMe],
  );

  /* ---- Refresh user ---- */
  const refreshUser = React.useCallback(async () => {
    try {
      const data = await apiClient<{ data: AuthUser }>('/api/v1/auth/me');
      if (data?.data) {
        setUser(data.data);
      }
    } catch (err) {
      console.error('Failed to refresh user:', err);
      // Keep current state but log for debugging
    }
  }, []);

  const value = React.useMemo<AuthContextType>(
    () => ({
      user,
      isAuthenticated,
      isLoading,
      login,
      logout,
      switchTenant,
      refreshUser,
    }),
    [user, isAuthenticated, isLoading, login, logout, switchTenant, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/* -------------------------------------------------------------------------- */
/*  Hook                                                                      */
/* -------------------------------------------------------------------------- */

export function useAuth(): AuthContextType {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

/* -------------------------------------------------------------------------- */
/*  RequireAuth wrapper — client-side redirect for protected routes           */
/* -------------------------------------------------------------------------- */

const PUBLIC_PATHS = ['/login', '/register', '/reset-password', '/mfa-verify'];

function isPublicPath(pathname: string): boolean {
  const segments = (pathname ?? '').split('/').filter(Boolean);
  // Remove locale segment
  const pathWithoutLocale = '/' + segments.slice(1).join('/');
  return PUBLIC_PATHS.some((p) => pathWithoutLocale === p || pathWithoutLocale.startsWith(p + '/'));
}

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  React.useEffect(() => {
    if (!isLoading && !isAuthenticated && !isPublicPath(pathname ?? '')) {
      // Extract locale from pathname (e.g., /en/dashboard -> en)
      const segments = (pathname ?? '').split('/').filter(Boolean);
      const locale = segments[0] ?? 'en';
      router.replace(`/${locale}/login`);
    }
  }, [isAuthenticated, isLoading, pathname, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-700" />
      </div>
    );
  }

  if (!isAuthenticated && !isPublicPath(pathname ?? '')) {
    return null;
  }

  return <>{children}</>;
}
