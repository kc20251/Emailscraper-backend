import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { AxiosResponse } from 'axios';
import { catchError, firstValueFrom, timeout } from 'rxjs';

export interface SearchResult {
  title: string;
  link: string;
  snippet: string;
  displayLink: string;
  position?: number;
}

export interface SearchParams {
  query: string;
  industry?: string;
  region?: string;
  numResults?: number;
  language?: string;
  site?: string; // Specific site to search
}

export interface SearchResponse {
  success: boolean;
  results: SearchResult[];
  total: number;
  source: 'google' | 'serpapi' | 'mock' | 'cache';
  executionTime: number;
  query: string;
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);
  private readonly googleApiKey: string;
  private readonly googleSearchEngineId: string;
  private readonly serpApiKey: string;
  private readonly cache = new Map<string, { results: SearchResult[]; timestamp: number }>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache

  constructor(
    private configService: ConfigService,
    private httpService: HttpService,
  ) {
    this.googleApiKey = this.configService.get<string>('GOOGLE_SEARCH_API_KEY') || '';
    this.googleSearchEngineId = this.configService.get<string>('GOOGLE_SEARCH_ENGINE_ID') || '';
    this.serpApiKey = this.configService.get<string>('SERP_API_KEY') || '';

    this.logger.log(`Search Service initialized - Google API: ${this.googleApiKey ? 'Configured' : 'Not configured'}`);
  }

  /**
   * Main search method with fallback strategy
   */
  async search(params: SearchParams): Promise<SearchResponse> {
    const startTime = Date.now();
    const cacheKey = this.generateCacheKey(params);

    // Check cache first
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      this.logger.log(`Returning cached results for: ${params.query}`);
      return {
        success: true,
        results: cached,
        total: cached.length,
        source: 'cache',
        executionTime: Date.now() - startTime,
        query: params.query,
      };
    }

    try {
      let results: SearchResult[];
      let source: 'google' | 'serpapi' | 'mock' = 'mock';

      // Strategy: Google → SerpAPI → Mock
      if (this.isGoogleConfigured()) {
        try {
          results = await this.googleSearch(params);
          source = 'google';
          this.logger.log(`Google search successful for: ${params.query}`);
        } catch (googleError) {
          this.logger.warn(`Google search failed: ${googleError.message}`);

          if (this.isSerpApiConfigured()) {
            try {
              results = await this.serpApiSearch(params);
              source = 'serpapi';
              this.logger.log(`SerpAPI search successful for: ${params.query}`);
            } catch (serpError) {
              this.logger.warn(`SerpAPI search failed: ${serpError.message}`);
              results = this.getMockSearchResults(params);
              this.logger.log(`Using mock data for: ${params.query}`);
            }
          } else {
            results = this.getMockSearchResults(params);
            this.logger.log(`Using mock data for: ${params.query}`);
          }
        }
      } else if (this.isSerpApiConfigured()) {
        try {
          results = await this.serpApiSearch(params);
          source = 'serpapi';
        } catch (serpError) {
          this.logger.warn(`SerpAPI search failed: ${serpError.message}`);
          results = this.getMockSearchResults(params);
        }
      } else {
        results = this.getMockSearchResults(params);
        this.logger.log(`No APIs configured, using mock data for: ${params.query}`);
      }

      // Cache successful results (excluding mock data)
      if (source !== 'mock' && results.length > 0) {
        this.setCache(cacheKey, results);
      }

      const executionTime = Date.now() - startTime;

      return {
        success: true,
        results,
        total: results.length,
        source,
        executionTime,
        query: params.query,
      };

    } catch (error) {
      this.logger.error(`All search methods failed for: ${params.query}`, error.stack);

      const executionTime = Date.now() - startTime;
      const mockResults = this.getMockSearchResults(params);

      return {
        success: false,
        results: mockResults,
        total: mockResults.length,
        source: 'mock',
        executionTime,
        query: params.query,
      };
    }
  }

  /**
   * Google Custom Search API
   */
  private async googleSearch(params: SearchParams): Promise<SearchResult[]> {
    const enhancedQuery = this.buildEnhancedQuery(params);
    const url = 'https://www.googleapis.com/customsearch/v1';

    const requestParams = {
      key: this.googleApiKey,
      cx: this.googleSearchEngineId,
      q: enhancedQuery,
      num: Math.min(params.numResults || 10, 10), // Google max is 10
      lr: params.language ? `lang_${params.language}` : undefined,
      siteSearch: params.site,
    };

    try {
      const response: AxiosResponse = await firstValueFrom(
        this.httpService.get(url, { params: requestParams }).pipe(
          timeout(10000), // 10 second timeout
          catchError((error) => {
            const errorMessage = error.response?.data?.error?.message || error.message;
            this.logger.error(`Google API error: ${errorMessage}`);
            throw new HttpException(
              `Google Search API error: ${errorMessage}`,
              HttpStatus.BAD_GATEWAY,
            );
          }),
        ),
      );

      const items = response.data.items || [];

      return items.map((item: any, index: number) => ({
        title: item.title || 'No title',
        link: item.link,
        snippet: item.snippet || 'No description available',
        displayLink: item.displayLink || new URL(item.link).hostname,
        position: index + 1,
      }));

    } catch (error) {
      this.logger.error(`Google search request failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * SerpAPI Search (Fallback)
   */
  private async serpApiSearch(params: SearchParams): Promise<SearchResult[]> {
    const enhancedQuery = this.buildEnhancedQuery(params);
    const url = 'https://serpapi.com/search';

    const requestParams = {
      api_key: this.serpApiKey,
      engine: 'google',
      q: enhancedQuery,
      num: params.numResults || 10,
      hl: params.language || 'en',
      gl: params.region ? this.getCountryCode(params.region) : undefined,
    };

    try {
      const response: AxiosResponse = await firstValueFrom(
        this.httpService.get(url, { params: requestParams }).pipe(
          timeout(15000), // 15 second timeout
          catchError((error) => {
            const errorMessage = error.response?.data?.error || error.message;
            this.logger.error(`SerpAPI error: ${errorMessage}`);
            throw new HttpException(
              `SerpAPI error: ${errorMessage}`,
              HttpStatus.BAD_GATEWAY,
            );
          }),
        ),
      );

      const results = response.data.organic_results || [];

      return results.map((result: any, index: number) => ({
        title: result.title || 'No title',
        link: result.link,
        snippet: result.snippet || 'No description available',
        displayLink: result.displayed_link || new URL(result.link).hostname,
        position: result.position || index + 1,
      }));

    } catch (error) {
      this.logger.error(`SerpAPI search request failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Build enhanced search query with industry and region
   */
  private buildEnhancedQuery(params: SearchParams): string {
    let query = params.query.trim();

    // Add industry context
    if (params.industry) {
      query += ` ${params.industry} industry`;
    }

    // Add region context
    if (params.region) {
      query += ` ${params.region}`;
    }

    // Add site-specific search
    if (params.site) {
      query += ` site:${params.site}`;
    }

    return query;
  }

  /**
   * Get mock data for testing and fallback
   */
  private getMockSearchResults(params: SearchParams): SearchResult[] {
    const baseResults = [
      {
        title: `${params.industry || 'Tech'} Company in ${params.region || 'California'}`,
        link: 'https://example-company.com/contact',
        snippet: `Leading ${params.industry || 'technology'} company specializing in ${params.query}. Contact us at info@example-company.com for services.`,
        displayLink: 'example-company.com',
        position: 1,
      },
      {
        title: `Best ${params.query} Services | ${params.region || 'Global'}`,
        link: 'https://test-business.org/about',
        snippet: `We provide excellent ${params.query} services across ${params.region || 'multiple regions'}. Email us at contact@test-business.org for quotes.`,
        displayLink: 'test-business.org',
        position: 2,
      },
      {
        title: `${params.industry || 'Business'} Solutions - Contact Us`,
        link: 'https://demo-corp.net/contact-us',
        snippet: `Get in touch with our team at hello@demo-corp.net for ${params.query} solutions. Serving ${params.region || 'clients worldwide'}.`,
        displayLink: 'demo-corp.net',
        position: 3,
      },
      {
        title: `Professional ${params.query} Services ${params.region ? `in ${params.region}` : ''}`,
        link: 'https://services-example.com',
        snippet: `Expert ${params.query} services ${params.region ? `in ${params.region}` : ''}. Reach us at support@services-example.com for consultation.`,
        displayLink: 'services-example.com',
        position: 4,
      },
      {
        title: `${params.industry || 'Innovative'} ${params.query} Company`,
        link: 'https://innovate-tech.io',
        snippet: `Cutting-edge ${params.query} solutions. Contact our team at info@innovate-tech.io to discuss your project needs.`,
        displayLink: 'innovate-tech.io',
        position: 5,
      },
    ];

    return baseResults.slice(0, params.numResults || 5);
  }

  /**
   * Cache management
   */
  private generateCacheKey(params: SearchParams): string {
    return `${params.query}-${params.industry}-${params.region}-${params.numResults}-${params.language}`;
  }

  private getFromCache(key: string): SearchResult[] | null {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.results;
    }
    this.cache.delete(key); // Remove expired cache
    return null;
  }

  private setCache(key: string, results: SearchResult[]): void {
    this.cache.set(key, {
      results,
      timestamp: Date.now(),
    });
  }

  /**
   * API configuration checks
   */
  private isGoogleConfigured(): boolean {
    return !!this.googleApiKey &&
      this.googleApiKey !== 'test-key' &&
      this.googleApiKey !== 'your_google_api_key_here' &&
      !!this.googleSearchEngineId &&
      this.googleSearchEngineId !== 'test-engine' &&
      this.googleSearchEngineId !== 'your_search_engine_id_here';
  }

  private isSerpApiConfigured(): boolean {
    return !!this.serpApiKey &&
      this.serpApiKey !== 'your_serpapi_key_optional' &&
      this.serpApiKey.length > 10; // Basic validation
  }

  /**
   * Utility methods
   */
  private getCountryCode(region: string): string {
    const countryMap: { [key: string]: string } = {
      'united states': 'us',
      'usa': 'us',
      'canada': 'ca',
      'united kingdom': 'uk',
      'uk': 'uk',
      'australia': 'au',
      'germany': 'de',
      'france': 'fr',
      'spain': 'es',
      'italy': 'it',
      'japan': 'jp',
      'india': 'in',
      'brazil': 'br',
    };

    return countryMap[region.toLowerCase()] || 'us';
  }

  /**
   * Get API status for monitoring
   */
  getApiStatus(): {
    google: { configured: boolean; status: string };
    serpapi: { configured: boolean; status: string };
    overall: string;
  } {
    const googleConfigured = this.isGoogleConfigured();
    const serpapiConfigured = this.isSerpApiConfigured();

    return {
      google: {
        configured: googleConfigured,
        status: googleConfigured ? 'Operational' : 'Not configured',
      },
      serpapi: {
        configured: serpapiConfigured,
        status: serpapiConfigured ? 'Operational' : 'Not configured',
      },
      overall: googleConfigured || serpapiConfigured ? 'Operational' : 'Using mock data',
    };
  }

  /**
   * Clear cache (useful for testing)
   */
  clearCache(): void {
    this.cache.clear();
    this.logger.log('Search cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}