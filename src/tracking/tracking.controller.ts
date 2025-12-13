// backend/src/tracking/tracking.controller.ts
import { Controller, Post, Body, Param, Get } from '@nestjs/common';
import { TrackingService } from './tracking.service';

@Controller('tracking')
export class TrackingController {
  constructor(private trackingService: TrackingService) {}

  @Post('open/:trackingId')
  async trackOpen(@Param('trackingId') trackingId: string) {
    return this.trackingService.trackOpen(trackingId);
  }

  @Post('click/:trackingId')
  async trackClick(
    @Param('trackingId') trackingId: string,
    @Body() body: { link: string },
  ) {
    return this.trackingService.trackingClick(trackingId, body.link);
  }

  @Post('reply')
  async trackReply(@Body() body: { email: string; campaignId: string }) {
    await this.trackingService.trackReply(body.email, body.campaignId);
    return { success: true };
  }
}