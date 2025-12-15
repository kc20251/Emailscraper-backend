import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface ScrapedEmail {
  email: string;
  source: string;
  context?: string;
  timestamp: Date;
}

export interface ScrapingResult {
  url: string;
  emails: ScrapedEmail[];
  success: boolean;
  error?: string;
  pageTitle?: string;
  method?: string; // Track which method succeeded
}

@Injectable()
export class ScrapingService {
  private readonly rateLimitDelay: number;
  private readonly scrapingBeeApiKey: string;
  private readonly scrapingDogApiKey: string;

  constructor(private readonly configService: ConfigService) {
    this.rateLimitDelay = 1000;
    this.scrapingBeeApiKey = this.configService.get<string>('SCRAPINGBEE_API_KEY') || '';
    this.scrapingDogApiKey = this.configService.get<string>('SCRAPINGDOG_API_KEY') || '';
  }

  /** MAIN PUBLIC METHOD: Intelligently chooses best scraping method */
  async scrapeUrl(url: string): Promise<ScrapingResult> {
    // Try Cheerio first (fastest, free)
    let result = await this.scrapeWithCheerio(url);
    
    // If Cheerio fails or finds no emails, try external APIs
    if (!result.success || result.emails.length === 0) {
      result = await this.scrapeWithExternalAPIs(url);
    }
    
    return result;
  }

  /** Scrape static pages using Axios + Cheerio */
  async scrapeWithCheerio(url: string): Promise<ScrapingResult> {
    try {
      const response = await axios.get(url, {
        timeout: 15000,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0 Safari/537.3',
        },
      });

      const $ = cheerio.load(response.data);
      const pageTitle = $('title').text() || url;
      const textContent = $('body').text();

      const emails = this.extractEmailsFromText(textContent, url);

      return { 
        url, 
        emails, 
        success: true, 
        pageTitle,
        method: 'cheerio'
      };
    } catch (error: any) {
      return {
        url,
        emails: [],
        success: false,
        error: `Cheerio: ${error.message}`,
        method: 'cheerio'
      };
    }
  }

  /** External API Scraping - tries multiple services */
  async scrapeWithExternalAPIs(url: string): Promise<ScrapingResult> {
    const apiResults: ScrapingResult[] = [];
    
    // Try ScrapingBee first
    if (this.scrapingBeeApiKey) {
      try {
        const result = await this.scrapeWithScrapingBee(url);
        if (result.success && result.emails.length > 0) {
          return result;
        }
        apiResults.push(result);
      } catch (error) {
        console.log('ScrapingBee failed:', error.message);
      }
    }

    // Try ScrapingDog next
    if (this.scrapingDogApiKey) {
      try {
        const result = await this.scrapeWithScrapingDog(url);
        if (result.success && result.emails.length > 0) {
          return result;
        }
        apiResults.push(result);
      } catch (error) {
        console.log('ScrapingDog failed:', error.message);
      }
    }

    // All APIs failed, return the best result or error
    const bestResult = apiResults.find(r => r.success) || 
      { url, emails: [], success: false, error: 'All external APIs failed' };
    
    return bestResult;
  }

  /** Scrape using ScrapingBee API */
  async scrapeWithScrapingBee(url: string): Promise<ScrapingResult> {
    try {
      const response = await axios.get('https://app.scrapingbee.com/api/v1', {
        params: {
          api_key: this.scrapingBeeApiKey,
          url: encodeURIComponent(url),
          render_js: true, // ✅ Critical: JavaScript rendering
          premium_proxy: true, // Better success rate
          country_code: 'us',
          wait: 2000, // Wait for JS to execute
          timeout: 15000,
        },
        timeout: 30000,
      });

      const $ = cheerio.load(response.data);
      const pageTitle = $('title').text() || url;
      const textContent = $('body').text();
      const emails = this.extractEmailsFromText(textContent, url);

      // Extract mailto links from rendered HTML
      const mailtoEmails = this.extractMailtoLinks($, url);
      const allEmails = [...emails, ...mailtoEmails];

      return {
        url,
        emails: this.deduplicateEmails(allEmails),
        success: true,
        pageTitle,
        method: 'scrapingbee'
      };
    } catch (error: any) {
      return {
        url,
        emails: [],
        success: false,
        error: `ScrapingBee: ${error.message}`,
        method: 'scrapingbee'
      };
    }
  }

  /** Scrape using ScrapingDog API */
  async scrapeWithScrapingDog(url: string): Promise<ScrapingResult> {
    try {
      const response = await axios.get('https://api.scrapingdog.com/scrape', {
        params: {
          api_key: this.scrapingDogApiKey,
          url: encodeURIComponent(url),
          render: true, // ✅ JavaScript rendering
          country: 'us',
        },
        timeout: 30000,
      });

      // ScrapingDog returns JSON with HTML content
      const html = response.data?.html || response.data;
      if (!html || typeof html !== 'string') {
        throw new Error('Invalid response from ScrapingDog');
      }

      const $ = cheerio.load(html);
      const pageTitle = $('title').text() || url;
      const textContent = $('body').text();
      const emails = this.extractEmailsFromText(textContent, url);
      
      // Extract mailto links
      const mailtoEmails = this.extractMailtoLinks($, url);
      const allEmails = [...emails, ...mailtoEmails];

      return {
        url,
        emails: this.deduplicateEmails(allEmails),
        success: true,
        pageTitle,
        method: 'scrapingdog'
      };
    } catch (error: any) {
      return {
        url,
        emails: [],
        success: false,
        error: `ScrapingDog: ${error.message}`,
        method: 'scrapingdog'
      };
    }
  }

  /** Helper: Extract mailto links from Cheerio object */
  private extractMailtoLinks($: cheerio.Root, source: string): ScrapedEmail[] {
    const emails: ScrapedEmail[] = [];
    
    $('a[href^="mailto:"]').each((_, element) => {
      const href = $(element).attr('href');
      if (href) {
        const email = href.replace('mailto:', '').trim();
        if (this.isValidEmail(email)) {
          const context = $(element).text().trim();
          emails.push({
            email: email.toLowerCase(),
            source,
            context: context || undefined,
            timestamp: new Date(),
          });
        }
      }
    });

    return emails;
  }

  /** Extracts emails from plain text using regex */
  private extractEmailsFromText(text: string, source: string): ScrapedEmail[] {
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const emails: ScrapedEmail[] = [];
    let match: RegExpExecArray | null;

    while ((match = emailRegex.exec(text)) !== null) {
      const email = match[0].toLowerCase();
      if (this.isValidEmail(email)) {
        const start = Math.max(0, match.index - 50);
        const end = Math.min(text.length, match.index + email.length + 50);
        const context = text.substring(start, end).replace(/\s+/g, ' ').trim();

        emails.push({
          email,
          source,
          context,
          timestamp: new Date(),
        });
      }
    }

    return emails;
  }

  /** Validates email format and excludes dummy/test patterns */
  private isValidEmail(email: string): boolean {
    const invalidPatterns = [
      /example\./i,
      /test\./i,
      /domain\./i,
      /your-email\./i,
      /@.*@/, // multiple @ signs
      /\.{2,}/, // consecutive dots
    ];
    return !invalidPatterns.some((pattern) => pattern.test(email));
  }

  /** Deduplicates emails by their address */
  private deduplicateEmails(emails: ScrapedEmail[]): ScrapedEmail[] {
    const seen = new Set<string>();
    return emails.filter((e) => {
      if (seen.has(e.email)) return false;
      seen.add(e.email);
      return true;
    });
  }

  /** Sequentially scrapes multiple URLs with fallback logic */
  async scrapeMultipleUrls(urls: string[]): Promise<ScrapingResult[]> {
    const results: ScrapingResult[] = [];

    for (const url of urls) {
      // Use the main scrape method that tries all options
      const result = await this.scrapeUrl(url);
      results.push(result);

      // Rate limiting between requests
      if (urls.length > 1) {
        await this.delay(this.rateLimitDelay);
      }
    }

    return results;
  }

  /** Simple async delay utility */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}