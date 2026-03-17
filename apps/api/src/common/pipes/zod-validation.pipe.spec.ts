import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

import { ZodValidationPipe } from './zod-validation.pipe';

describe('ZodValidationPipe', () => {
  const schema = z.object({
    name: z.string().min(1),
    age: z.number().int().min(0),
  });
  const pipe = new ZodValidationPipe(schema);

  it('should pass through valid data', () => {
    const input = { name: 'John', age: 25 };
    const result = pipe.transform(input, { type: 'body', metatype: Object, data: '' });
    expect(result).toEqual(input);
  });

  it('should throw BadRequestException for invalid data', () => {
    const input = { name: '', age: -1 };
    expect(() =>
      pipe.transform(input, { type: 'body', metatype: Object, data: '' }),
    ).toThrow(BadRequestException);

    try {
      pipe.transform(input, { type: 'body', metatype: Object, data: '' });
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      const response = (e as BadRequestException).getResponse() as Record<string, unknown>;
      expect(response['code']).toBe('VALIDATION_ERROR');
      expect(response['details']).toBeDefined();
    }
  });
});
