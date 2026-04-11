import { BadRequestException } from '@nestjs/common';

import type { AttachmentInput } from '@school/shared/inbox';

import { AttachmentValidator } from './attachment-validator';

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

describe('AttachmentValidator', () => {
  const validator = new AttachmentValidator();

  it('accepts an empty attachment list', () => {
    expect(() => validator.validateBatch(TENANT_A, [])).not.toThrow();
    expect(() => validator.validateBatch(TENANT_A, undefined)).not.toThrow();
  });

  it('accepts attachments with the correct tenant prefix on storage_key', () => {
    const atts: AttachmentInput[] = [
      {
        storage_key: `${TENANT_A}/uploads/a.pdf`,
        filename: 'a.pdf',
        mime_type: 'application/pdf',
        size_bytes: 100,
      },
      {
        storage_key: `${TENANT_A}/uploads/b.png`,
        filename: 'b.png',
        mime_type: 'image/png',
        size_bytes: 200,
      },
    ];
    expect(() => validator.validateBatch(TENANT_A, atts)).not.toThrow();
  });

  it('rejects an attachment whose storage_key points at a different tenant', () => {
    const atts: AttachmentInput[] = [
      {
        storage_key: `${TENANT_B}/uploads/other.pdf`,
        filename: 'other.pdf',
        mime_type: 'application/pdf',
        size_bytes: 100,
      },
    ];
    expect(() => validator.validateBatch(TENANT_A, atts)).toThrow(BadRequestException);
    try {
      validator.validateBatch(TENANT_A, atts);
    } catch (err) {
      expect((err as BadRequestException).getResponse()).toEqual(
        expect.objectContaining({ code: 'ATTACHMENT_NOT_OWNED_BY_TENANT' }),
      );
    }
  });

  it('rejects the whole batch on the first bad attachment', () => {
    const atts: AttachmentInput[] = [
      {
        storage_key: `${TENANT_A}/uploads/ok.pdf`,
        filename: 'ok.pdf',
        mime_type: 'application/pdf',
        size_bytes: 100,
      },
      {
        storage_key: `${TENANT_B}/uploads/bad.pdf`,
        filename: 'bad.pdf',
        mime_type: 'application/pdf',
        size_bytes: 100,
      },
    ];
    expect(() => validator.validateBatch(TENANT_A, atts)).toThrow(BadRequestException);
  });
});
