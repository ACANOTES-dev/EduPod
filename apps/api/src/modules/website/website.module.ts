import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { ContactFormService } from './contact-form.service';
import { ContactSubmissionsController } from './contact-submissions.controller';
import { PublicContactController } from './public-contact.controller';
import { PublicWebsiteController } from './public-website.controller';
import { PublicWebsiteService } from './public-website.service';
import { WebsitePagesController } from './website-pages.controller';
import { WebsitePagesService } from './website-pages.service';

@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [
    WebsitePagesController,
    PublicWebsiteController,
    PublicContactController,
    ContactSubmissionsController,
  ],
  providers: [
    WebsitePagesService,
    PublicWebsiteService,
    ContactFormService,
  ],
  exports: [WebsitePagesService, PublicWebsiteService],
})
export class WebsiteModule {}
