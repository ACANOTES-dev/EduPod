import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import type { UpdateUiPreferencesDto } from '@school/shared';

import { withRls } from '../../common/helpers/with-rls';
import { AuthReadFacade } from '../auth/auth-read.facade';
import { PrismaService } from '../prisma/prisma.service';
import { TenantReadFacade } from '../tenants/tenant-read.facade';

const MAX_PREFERENCES_SIZE_BYTES = 500 * 1024; // 500 KB

/**
 * Deep merge utility for preferences objects.
 * Recursively merges `source` into `target`, creating a new object.
 * Arrays are replaced, not merged.
 */
function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...target };

  for (const key of Object.keys(source)) {
    const sourceVal = source[key];
    const targetVal = target[key];

    if (
      sourceVal !== null &&
      typeof sourceVal === 'object' &&
      !Array.isArray(sourceVal) &&
      targetVal !== null &&
      typeof targetVal === 'object' &&
      !Array.isArray(targetVal)
    ) {
      result[key] = deepMerge(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>,
      );
    } else {
      result[key] = sourceVal;
    }
  }

  return result;
}

@Injectable()
export class PreferencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authReadFacade: AuthReadFacade,
    private readonly tenantReadFacade: TenantReadFacade,
  ) {}

  /**
   * Get UI preferences for a user at a specific tenant.
   * Returns empty object if no preferences have been saved.
   */
  async getPreferences(tenantId: string, userId: string): Promise<Record<string, unknown>> {
    const record = (await withRls(this.prisma, { tenant_id: tenantId }, async (tx) => {
      return tx.userUiPreference.findUnique({
        where: {
          tenant_id_user_id: {
            tenant_id: tenantId,
            user_id: userId,
          },
        },
      });
    })) as { preferences: unknown } | null;

    if (!record) {
      return {};
    }

    return record.preferences as Record<string, unknown>;
  }

  /**
   * Deep merge update into existing JSONB preferences.
   * Validates that resulting size does not exceed 500 KB.
   */
  async updatePreferences(
    tenantId: string,
    userId: string,
    data: UpdateUiPreferencesDto,
  ): Promise<Record<string, unknown>> {
    await this.updateUserProfileFields(tenantId, userId, data as Record<string, unknown>);

    // Get existing preferences
    const existing = await this.getPreferences(tenantId, userId);

    // Deep merge
    const merged = deepMerge(existing, data as Record<string, unknown>);

    // Validate size
    const serialised = JSON.stringify(merged);
    if (Buffer.byteLength(serialised, 'utf8') > MAX_PREFERENCES_SIZE_BYTES) {
      throw new BadRequestException({
        code: 'PREFERENCES_TOO_LARGE',
        message: `UI preferences cannot exceed ${MAX_PREFERENCES_SIZE_BYTES / 1024} KB`,
      });
    }

    // Upsert with RLS
    const jsonValue = merged as unknown as Prisma.InputJsonValue;

    const record = (await withRls(this.prisma, { tenant_id: tenantId }, async (tx) => {
      return tx.userUiPreference.upsert({
        where: {
          tenant_id_user_id: {
            tenant_id: tenantId,
            user_id: userId,
          },
        },
        update: {
          preferences: jsonValue,
        },
        create: {
          tenant_id: tenantId,
          user_id: userId,
          preferences: jsonValue,
        },
      });
    })) as { preferences: unknown };

    return record.preferences as Record<string, unknown>;
  }

  private async updateUserProfileFields(
    tenantId: string,
    userId: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    const firstName = data.first_name;
    const lastName = data.last_name;
    const preferredLocale = data.preferred_locale;

    const update: {
      first_name?: string;
      last_name?: string;
      preferred_locale?: string;
    } = {};
    if (typeof firstName === 'string') {
      update.first_name = firstName;
    }
    if (typeof lastName === 'string') {
      update.last_name = lastName;
    }
    if (typeof preferredLocale === 'string') {
      const tenant = await this.tenantReadFacade.findById(tenantId);
      if (!tenant || !tenant.supported_locales.includes(preferredLocale)) {
        throw new BadRequestException({
          code: 'LOCALE_NOT_SUPPORTED',
          message: `Locale "${preferredLocale}" is not enabled for this tenant.`,
        });
      }
      update.preferred_locale = preferredLocale;
    }

    if (Object.keys(update).length === 0) {
      return;
    }

    await this.authReadFacade.updateUserProfile(userId, update);
  }
}
