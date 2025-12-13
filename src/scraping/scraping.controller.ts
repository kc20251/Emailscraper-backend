import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ScrapingService, ScrapingResult } from './scraping.service';

@Controller('scraping')
@UseGuards(AuthGuard('jwt'))
export class ScrapingController {
  constructor(private scrapingService: ScrapingService) {}

  @Post('scrape-url')
  async scrapeUrl(
    @Body() body: { url: string },
  ): Promise<{ success: boolean; results: ScrapingResult }> {
    const result = await this.scrapingService.scrapeWithPuppeteer(body.url);
    return { success: result.success, results: result };
  }

  @Post('scrape-multiple-urls')
  async scrapeMultipleUrls(
    @Body() body: { urls: string[] },
  ): Promise<{
    success: boolean;
    results: ScrapingResult[];
    totalEmails: number;
  }> {
    const results = await this.scrapingService.scrapeMultipleUrls(body.urls);

    const totalEmails = results.reduce(
      (sum, result) => sum + result.emails.length,
      0,
    );

    return { success: true, results, totalEmails };
  }
}
