import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

interface RedactionRule {
  name: string;
  pattern: string;
  pattern_flags: string;
  replacement: string;
}

export interface RedactionResult {
  redacted: string;
  rules_applied: string[];
}

@Injectable()
export class ErrorRedactorService {
  private static readonly BUILT_IN_RULES: RedactionRule[] = [
    {
      name: 'email',
      pattern: '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}',
      pattern_flags: 'g',
      replacement: '[EMAIL]',
    },
    {
      name: 'jwt',
      pattern: 'eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}',
      pattern_flags: 'g',
      replacement: '[JWT]',
    },
    {
      name: 'stripe_key',
      pattern: 'sk_(live|test)_[A-Za-z0-9]{24,}',
      pattern_flags: 'g',
      replacement: '[STRIPE_SK]',
    },
    {
      name: 'aws_access_key',
      pattern: 'AKIA[0-9A-Z]{16}',
      pattern_flags: 'g',
      replacement: '[AWS_KEY]',
    },
    {
      name: 'irish_pps',
      pattern: '\\b\\d{7}[A-Za-z]{1,2}\\b',
      pattern_flags: 'g',
      replacement: '[PPS]',
    },
    {
      name: 'iban_ie',
      pattern: '\\bIE\\d{2}[A-Z0-9]{4}\\d{14}\\b',
      pattern_flags: 'g',
      replacement: '[IBAN]',
    },
    {
      name: 'phone',
      pattern: '\\+?[0-9][0-9\\s-]{8,15}',
      pattern_flags: 'g',
      replacement: '[PHONE]',
    },
  ];

  constructor(private readonly prisma: PrismaService) {}

  async redact(input: string): Promise<RedactionResult> {
    const customRules = await this.prisma.platformErrorRedactionRule.findMany({
      where: { is_enabled: true },
      orderBy: { created_at: 'asc' },
      select: {
        name: true,
        pattern: true,
        pattern_flags: true,
        replacement: true,
      },
    });

    return this.applyRules(input, [...ErrorRedactorService.BUILT_IN_RULES, ...customRules]);
  }

  builtInRules(): RedactionRule[] {
    return ErrorRedactorService.BUILT_IN_RULES;
  }

  applyPreview(input: string, rule: RedactionRule): RedactionResult {
    return this.applyRules(input, [rule]);
  }

  private applyRules(input: string, rules: RedactionRule[]): RedactionResult {
    let redacted = input;
    const rulesApplied: string[] = [];

    for (const rule of rules) {
      let regex: RegExp;
      try {
        regex = new RegExp(rule.pattern, rule.pattern_flags);
      } catch {
        throw new BadRequestException({
          code: 'INVALID_REDACTION_REGEX',
          message: `Redaction rule "${rule.name}" is not a valid regular expression.`,
        });
      }

      if (regex.test(redacted)) {
        regex.lastIndex = 0;
        redacted = redacted.replace(regex, rule.replacement);
        rulesApplied.push(rule.name);
      }
    }

    return { redacted, rules_applied: rulesApplied };
  }
}
