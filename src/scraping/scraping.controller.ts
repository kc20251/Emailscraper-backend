import { Controller, Post, Body, UseGuards, Get } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ScrapingService, ScrapingResult } from './scraping.service';

@Controller('scraping')
@UseGuards(AuthGuard('jwt'))
export class ScrapingController {
  constructor(private scrapingService: ScrapingService) {}

  @Post('scrape-url')
  async scrapeUrl(
    @Body() body: { url: string },
  ): Promise<{ success: boolean; result: ScrapingResult }> {
    const result = await this.scrapingService.scrapeUrl(body.url);
    return { success: result.success, result };
  }

  @Post('scrape-multiple-urls')
  async scrapeMultipleUrls(
    @Body() body: { urls: string[] },
  ): Promise<{
    success: boolean;
    results: ScrapingResult[];
    totalEmails: number;
    summary: {
      cheerio: number;
      scrapingbee: number;
      scrapingdog: number;
      failed: number;
    };
  }> {
    const results = await this.scrapingService.scrapeMultipleUrls(body.urls);
    
    const totalEmails = results.reduce(
      (sum, result) => sum + result.emails.length,
      0,
    );

    // Generate statistics
    const summary = {
      cheerio: results.filter(r => r.method === 'cheerio' && r.success).length,
      scrapingbee: results.filter(r => r.method === 'scrapingbee' && r.success).length,
      scrapingdog: results.filter(r => r.method === 'scrapingdog' && r.success).length,
      failed: results.filter(r => !r.success).length,
    };

    return { 
      success: true, 
      results, 
      totalEmails,
      summary
    };
  }

  @Get('api-status')
  async checkAPIStatus(): Promise<{
    scrapingBee: boolean;
    scrapingDog: boolean;
    message: string;
  }> {
    // Test both APIs with a simple request
    const testUrl = 'https://httpbin.org/html';
    
    let scrapingBeeOk = false;
    let scrapingDogOk = false;
    
    try {
      const scrapingBeeResult = await this.scrapingService['scrapeWithScrapingBee'](testUrl);
      scrapingBeeOk = scrapingBeeResult.success;
    } catch (error) {
      scrapingBeeOk = false;
    }
    
    try {
      const scrapingDogResult = await this.scrapingService['scrapeWithScrapingDog'](testUrl);
      scrapingDogOk = scrapingDogResult.success;
    } catch (error) {
      scrapingDogOk = false;
    }
    
    return {
      scrapingBee: scrapingBeeOk,
      scrapingDog: scrapingDogOk,
      message: 'API status checked'
    };
  }
}