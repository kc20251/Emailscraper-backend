import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  Query,
  Logger
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SearchService, SearchParams } from './search.service';

@Controller('search')
@UseGuards(AuthGuard('jwt'))
export class SearchController {
  private readonly logger = new Logger(SearchController.name);

  constructor(private searchService: SearchService) { }

  @Post('query')
  async search(@Body() params: {
    query: string;
    industry?: string;
    region?: string;
    numResults?: number;
    language?: string;
    site?: string;
  }) {
    try {
      const result = await this.searchService.search(params);

      this.logger.log(`Search completed: ${params.query} - ${result.total} results from ${result.source}`);

      return {
        success: result.success,
        results: result.results,
        total: result.total,
        source: result.source,
        executionTime: result.executionTime,
        query: result.query,
      };
    } catch (error) {
      this.logger.error(`Search failed for: ${params.query}`, error.stack);

      return {
        success: false,
        results: [],
        total: 0,
        source: 'error',
        executionTime: 0,
        query: params.query,
        error: error.message,
      };
    }
  }

  @Post('test')
  async testSearch(@Body() body: { query: string }) {
    try {
      const result = await this.searchService.search({
        query: body.query,
        numResults: 5,
      });

      return {
        success: result.success,
        message: 'Search test completed',
        results: result.results,
        total: result.total,
        source: result.source,
        executionTime: result.executionTime,
      };
    } catch (error) {
      return {
        success: false,
        message: `Search test failed: ${error.message}`,
        results: [],
        total: 0,
        source: 'error',
      };
    }
  }

  @Get('suggestions')
  async getSearchSuggestions(@Query('query') query: string) {
    if (!query || query.length < 2) {
      return { suggestions: [] };
    }

    const mockSuggestions = [
      `${query} companies`,
      `${query} services`,
      `${query} businesses`,
      `best ${query}`,
      `${query} near me`,
      `${query} startups`,
      `${query} agencies`,
      `${query} consultants`,
      `${query} firms`,
    ];

    return {
      suggestions: mockSuggestions.slice(0, 8),
    };
  }

  @Get('industries')
  async getIndustrySuggestions() {
    const industries = [
      'Technology',
      'Healthcare',
      'Finance',
      'Education',
      'Real Estate',
      'Marketing',
      'E-commerce',
      'Manufacturing',
      'Consulting',
      'Legal',
      'Hospitality',
      'Construction',
      'Transportation',
      'Energy',
      'Agriculture',
      'Media',
      'Entertainment',
      'Non-profit',
      'Government',
      'Retail',
    ];

    return {
      industries,
      total: industries.length
    };
  }

  @Get('regions')
  async getRegionSuggestions() {
    const regions = [
      'United States',
      'Canada',
      'United Kingdom',
      'Australia',
      'Germany',
      'France',
      'Japan',
      'India',
      'Brazil',
      'Mexico',
      'Spain',
      'Italy',
      'Netherlands',
      'Sweden',
      'Singapore',
      'California',
      'New York',
      'Texas',
      'Florida',
      'Illinois',
      'Washington',
      'Massachusetts',
      'Colorado',
      'Georgia',
      'North Carolina',
      'London',
      'Toronto',
      'Sydney',
      'Berlin',
      'Paris',
      'Tokyo',
      'Mumbai',
      'São Paulo',
      'Amsterdam',
      'Stockholm',
    ];

    return {
      regions,
      total: regions.length
    };
  }

  @Post('validate-query')
  async validateSearchQuery(@Body() body: { query: string }) {
    // FIX: Explicitly type the issues array
    const issues: string[] = [];

    if (!body.query || body.query.trim().length === 0) {
      issues.push('Search query cannot be empty');
    }

    if (body.query.length < 2) {
      issues.push('Search query must be at least 2 characters long');
    }

    if (body.query.length > 100) {
      issues.push('Search query is too long (max 100 characters)');
    }

    // FIX: Explicitly type commonIssues
    const commonIssues: Record<string, string[]> = {
      'too generic': ['company', 'business', 'service', 'list', 'things'],
      'needs context': ['find', 'get', 'search for', 'looking for', 'need'],
      'too vague': ['it', 'something', 'stuff', 'help'],
    };

    const queryLower = body.query.toLowerCase();

    for (const [issue, keywords] of Object.entries(commonIssues)) {
      if (keywords.some(keyword => queryLower.includes(keyword))) {
        issues.push(`Query is ${issue}. Try being more specific.`);
        break;
      }
    }

    const words = body.query.trim().split(/\s+/).length;
    if (words < 2) {
      issues.push('Query is too short. Add more context for better results.');
    }

    return {
      valid: issues.length === 0,
      issues,
      suggestions: issues.length > 0 ? [
        'Try adding an industry (e.g., "tech companies")',
        'Specify a location (e.g., "in California")',
        'Be specific about what you\'re looking for',
        'Include service types (e.g., "web development agencies")',
      ] : [],
      wordCount: words,
    };
  }

  @Get('api-status')
  async getAPIStatus() {
    const status = this.searchService.getApiStatus();

    return {
      apis: status,
      cache: this.searchService.getCacheStats(),
      message: status.overall === 'Operational'
        ? 'Search APIs are operational'
        : 'Using mock data - configure API keys for real search results',
      recommendations: !status.google.configured && !status.serpapi.configured ? [
        'Add GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_ENGINE_ID for Google Search',
        'Add SERP_API_KEY for SerpAPI fallback',
        'Currently using mock data for testing',
      ] : [],
    };
  }

  @Post('clear-cache')
  async clearCache() {
    this.searchService.clearCache();

    return {
      success: true,
      message: 'Search cache cleared successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('stats')
  async getSearchStats() {
    const cacheStats = this.searchService.getCacheStats();
    const apiStatus = this.searchService.getApiStatus();

    return {
      cache: {
        size: cacheStats.size,
        cachedQueries: cacheStats.keys.length,
      },
      apis: apiStatus,
      features: {
        caching: true,
        fallbacks: true,
        mockData: true,
        validation: true,
        suggestions: true,
      },
    };
  }

  @Get('quick-tips')
  async getSearchTips() {
    return {
      tips: [
        'Be specific with your search terms',
        'Include industry and location for better results',
        'Use 3-5 word queries for optimal results',
        'Try different combinations if first search fails',
        'Use the validation endpoint to check your query',
      ],
      examples: [
        'web development companies california',
        'healthcare startups new york',
        'ecommerce agencies united kingdom',
        'marketing consultants london',
        'saas companies toronto',
      ],
    };
  }
}