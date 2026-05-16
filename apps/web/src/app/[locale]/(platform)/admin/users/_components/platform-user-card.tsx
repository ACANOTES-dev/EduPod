import { ShieldCheck } from 'lucide-react';
import Link from 'next/link';

import { Badge, cn } from '@school/ui';

import type { PlatformUser } from './platform-user-types';

interface PlatformUserCardProps {
  locale: string;
  user: PlatformUser;
}

export function PlatformUserCard({ locale, user }: PlatformUserCardProps) {
  const revoked = Boolean(user.revoked_at);

  return (
    <Link
      href={`/${locale}/admin/users/${user.id}`}
      className="block rounded-lg border border-border bg-surface p-4 transition-colors hover:border-border-strong hover:bg-surface-secondary"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary-700" />
            <h2 className="truncate text-sm font-semibold text-text-primary">
              {user.user.first_name} {user.user.last_name}
            </h2>
          </div>
          <p className="mt-1 break-all text-sm text-text-secondary">{user.user.email}</p>
        </div>
        <Badge
          className={cn(
            revoked ? 'bg-danger-bg text-danger-text' : 'bg-success-bg text-success-text',
          )}
        >
          {revoked ? 'Revoked' : 'Active'}
        </Badge>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {user.roles.map((role) => (
          <Badge key={role.role_id} className="bg-primary-50 text-primary-700">
            {role.role.display_name}
          </Badge>
        ))}
      </div>
    </Link>
  );
}
