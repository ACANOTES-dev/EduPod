import {
  Controller,
  Get,
  Param,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import { PersonalTimetableService } from './personal-timetable.service';

/**
 * Public calendar endpoint — no auth guard.
 * Token in the URL path is the authentication mechanism (64-char random hex).
 * Returns iCalendar (.ics) format for use with webcal:// subscriptions.
 */
@Controller('v1/calendar')
export class SchedulingPublicController {
  constructor(
    private readonly personalTimetableService: PersonalTimetableService,
  ) {}

  @Get(':tenantId/:token.ics')
  async getCalendarIcs(
    @Param('tenantId') tenantId: string,
    @Param('token') token: string,
    @Res() res: Response,
  ) {
    const icsContent = await this.personalTimetableService.generateIcsCalendar(
      tenantId,
      token,
    );

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="timetable.ics"');
    res.setHeader('Cache-Control', 'no-cache, no-store');
    res.send(icsContent);
  }
}
