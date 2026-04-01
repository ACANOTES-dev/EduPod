import { Body, Controller, Ip, Post } from '@nestjs/common';

import { contactFormSchema } from '@school/shared';
import type { ContactFormDto, TenantContext } from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { ContactFormService } from './contact-form.service';

@Controller('v1/public')
export class PublicContactController {
  constructor(private readonly service: ContactFormService) {}

  @Post('contact')
  async submit(
    @CurrentTenant() tenant: TenantContext,
    @Ip() ip: string,
    @Body(new ZodValidationPipe(contactFormSchema))
    dto: ContactFormDto,
  ) {
    return this.service.submit(tenant.tenant_id, dto, ip);
  }
}
