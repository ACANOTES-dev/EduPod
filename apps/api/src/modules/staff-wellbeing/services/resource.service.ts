import { Injectable } from '@nestjs/common';

import { ConfigurationReadFacade } from '../../configuration/configuration-read.facade';
import { PrismaService } from '../../prisma/prisma.service';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface EapInfo {
  provider_name: string | null;
  phone: string | null;
  website: string | null;
  hours: string | null;
  management_body: string | null;
  last_verified_date: string | null;
}

export interface ExternalResource {
  name: string;
  phone?: string;
  website?: string;
}

export interface ResourcesResult {
  eap: EapInfo;
  resources: ExternalResource[];
}

const DEFAULT_RESULT: ResourcesResult = {
  eap: {
    provider_name: null,
    phone: null,
    website: null,
    hours: null,
    management_body: null,
    last_verified_date: null,
  },
  resources: [],
};

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class ResourceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configurationReadFacade: ConfigurationReadFacade,
  ) {}

  async getResources(tenantId: string): Promise<ResourcesResult> {
    const record = await this.configurationReadFacade.findSettings(tenantId);

    if (!record) {
      return DEFAULT_RESULT;
    }

    const settings = (record.settings as Record<string, unknown>) ?? {};
    const wellbeing = settings['staff_wellbeing'] as Record<string, unknown> | undefined;

    if (!wellbeing) {
      return DEFAULT_RESULT;
    }

    const nullIfEmpty = (val: unknown): string | null => {
      if (typeof val === 'string' && val.length > 0) return val;
      return null;
    };

    return {
      eap: {
        provider_name: nullIfEmpty(wellbeing['eap_provider_name']),
        phone: nullIfEmpty(wellbeing['eap_phone']),
        website: nullIfEmpty(wellbeing['eap_website']),
        hours: nullIfEmpty(wellbeing['eap_hours']),
        management_body: nullIfEmpty(wellbeing['eap_management_body']),
        last_verified_date: nullIfEmpty(wellbeing['eap_last_verified_date']),
      },
      resources: Array.isArray(wellbeing['external_resources'])
        ? (wellbeing['external_resources'] as ExternalResource[])
        : [],
    };
  }
}
