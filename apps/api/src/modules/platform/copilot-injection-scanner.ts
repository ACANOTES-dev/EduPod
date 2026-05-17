import { inspect } from 'util';

import { Injectable } from '@nestjs/common';

import type { EvidenceItem } from './platform-evidence.service';
import { RedisPubSubService } from './redis-pubsub.service';

const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+|previous\s+|prior\s+)?(prior\s+)?(instructions|directives|rules)/gi,
  /you\s+are\s+now\s+(in\s+)?(admin|developer|debug|god)\s+mode/gi,
  /grant\s+(me\s+)?(platform_owner|admin|root|superuser)/gi,
  /system:\s*</gi,
  /<\|im_start\|>/gi,
  /\[INST\]/gi,
  /execute\s+(this|the\s+following)/gi,
  /override\s+(the\s+)?(security|safety|prior)\s+(instructions|rules|measures)/gi,
  /delete\s+from\s+(tenants|users|platform_users)/gi,
  /reveal\s+(all\s+)?(secrets|passwords|api\s*keys|platform_user\s+emails)/gi,
];

@Injectable()
export class CopilotInjectionScanner {
  constructor(private readonly redisPubSub: RedisPubSubService) {}

  async scan(evidence: EvidenceItem[]): Promise<{
    attempts: number;
    flaggedEvidenceIds: string[];
  }> {
    const flaggedEvidenceIds = new Set<string>();
    let attempts = 0;

    for (const item of evidence) {
      const haystack = `${item.snippet}\n${safeStringify(item.raw)}`;
      for (const pattern of INJECTION_PATTERNS) {
        pattern.lastIndex = 0;
        const matches = haystack.match(pattern);
        if (matches) {
          attempts += matches.length;
          flaggedEvidenceIds.add(item.id);
        }
      }
    }

    if (attempts > 0) {
      await this.redisPubSub.publish('platform:alerts', {
        type: 'copilot_prompt_injection_detected',
        severity: 'warning',
        attempts,
        evidence_ids: [...flaggedEvidenceIds],
        detected_at: new Date().toISOString(),
      });
    }

    return { attempts, flaggedEvidenceIds: [...flaggedEvidenceIds] };
  }
}

function safeStringify(value: unknown): string {
  return inspect(value, { depth: 4, maxArrayLength: 50 });
}
