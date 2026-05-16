import { BadRequestException } from '@nestjs/common';

import { ErrorRedactorService } from './error-redactor.service';

describe('ErrorRedactorService', () => {
  const prisma = {
    platformErrorRedactionRule: {
      findMany: jest.fn(),
    },
  };

  let service: ErrorRedactorService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.platformErrorRedactionRule.findMany.mockResolvedValue([]);
    service = new ErrorRedactorService(prisma as never);
  });

  it('redacts the standard platform PII and secret corpus', async () => {
    const stripeSecret = ['sk', 'live', '123456789012345678901234'].join('_');
    const input = [
      'Email parent@example.com',
      'Phone +353 85 123 4567',
      'JWT eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signatureblock',
      `Stripe ${stripeSecret}`,
      'AWS AKIAABCDEFGHIJKLMNOP',
      'PPS 1234567T',
      'IBAN IE29AIBK93115212345678',
    ].join('\n');

    const result = await service.redact(input);

    expect(result.redacted).not.toContain('parent@example.com');
    expect(result.redacted).not.toContain('+353 85 123 4567');
    expect(result.redacted).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    expect(result.redacted).not.toContain(stripeSecret);
    expect(result.redacted).not.toContain('AKIAABCDEFGHIJKLMNOP');
    expect(result.redacted).not.toContain('1234567T');
    expect(result.redacted).not.toContain('IE29AIBK93115212345678');
    expect(result.rules_applied).toEqual(
      expect.arrayContaining([
        'email',
        'phone',
        'jwt',
        'stripe_key',
        'aws_access_key',
        'irish_pps',
        'iban_ie',
      ]),
    );
  });

  it('applies enabled custom rules after built-ins', async () => {
    prisma.platformErrorRedactionRule.findMany.mockResolvedValue([
      {
        name: 'student_number',
        pattern: 'STU-[0-9]{4}',
        pattern_flags: 'g',
        replacement: '[STUDENT_NUMBER]',
      },
    ]);

    const result = await service.redact('Student STU-1234 emailed child@example.com');

    expect(result.redacted).toBe('Student [STUDENT_NUMBER] emailed [EMAIL]');
    expect(result.rules_applied).toEqual(['email', 'student_number']);
  });

  it('throws a structured error for invalid custom regex', async () => {
    prisma.platformErrorRedactionRule.findMany.mockResolvedValue([
      {
        name: 'broken',
        pattern: '[',
        pattern_flags: 'g',
        replacement: '[BROKEN]',
      },
    ]);

    await expect(service.redact('anything')).rejects.toBeInstanceOf(BadRequestException);
  });
});
