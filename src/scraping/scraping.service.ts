import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import * as puppeteer from 'puppeteer';
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
}

@Injectable()
export class ScrapingService {
  private readonly rateLimitDelay: number;

  constructor(private readonly configService: ConfigService) {
    // Default delay between requests: 1 second
    this.rateLimitDelay = 1000;
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

      return { url, emails, success: true, pageTitle };
    } catch (error: any) {
      return {
        url,
        emails: [],
        success: false,
        error: error.message || 'Unknown error',
      };
    }
  }

  /** Scrape dynamic pages using Puppeteer (for JS-rendered content) */
  async scrapeWithPuppeteer(url: string): Promise<ScrapingResult> {
    let browser: puppeteer.Browser | null = null;

    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      const page = await browser.newPage();
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0 Safari/537.3',
      );

      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

      const pageTitle = await page.title();
      const content = await page.evaluate(() => document.body.innerText);

      const emails = this.extractEmailsFromText(content, url);

      // Collect mailto links too
      const emailElements = await page.$$eval('a[href*="mailto:"]', (elements) =>
        elements.map((el) => ({
          email: el.getAttribute('href')?.replace('mailto:', '').trim() || '',
          text: el.textContent?.trim() || '',
        })),
      );

      for (const elem of emailElements) {
        if (elem.email && this.isValidEmail(elem.email)) {
          emails.push({
            email: elem.email,
            source: url,
            context: elem.text,
            timestamp: new Date(),
          });
        }
      }

      return { url, emails: this.deduplicateEmails(emails), success: true, pageTitle };
    } catch (error: any) {
      return {
        url,
        emails: [],
        success: false,
        error: error.message || 'Unknown error',
      };
    } finally {
      if (browser) await browser.close();
    }
  }

  /** Extracts emails from plain text using regex */
  private extractEmailsFromText(text: string, source: string): ScrapedEmail[] {
    const emailRegex =
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

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

    return this.deduplicateEmails(emails);
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

  /** Sequentially scrapes multiple URLs */
  async scrapeMultipleUrls(urls: string[]): Promise<ScrapingResult[]> {
    const results: ScrapingResult[] = [];

    for (const url of urls) {
      
      let result = await this.scrapeWithCheerio(url);

      // fallback to puppeteer if cheerio fails or finds no emails
      if (!result.success || result.emails.length === 0) {
        result = await this.scrapeWithPuppeteer(url);
      }

      results.push(result);

      // avoid rate limit violations
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
