import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import {
  ScrapingService,
  ScrapingResult,
  ScrapedEmail,
} from '../scraping/scraping.service';
import {
  SearchService,
  SearchResult,
  SearchParams,
  SearchResponse,
} from '../search/search.service';
import { DataService } from '../data/data.service';
import { EmailCollection } from '../schemas/email-collection.schema';
import { getIdString } from '../common/utils';

export interface ScrapingJob {
  id: string;
  params: SearchParams;
  status: 'pending' | 'running' | 'completed' | 'failed';
  results: {
    searchResults: SearchResult[];
    scrapingResults: ScrapingResult[];
    totalEmails: number;
    uniqueEmails: number;
  };
  metrics: {
    totalWebsites: number;
    successfulScrapes: number;
    failedScrapes: number;
    totalEmailsFound: number;
    uniqueEmailsFound: number;
    executionTime: number;
    emailsPerMinute: number;
  };
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

export interface ScrapingJobResult {
  success: boolean;
  jobId: string;
  searchResults: SearchResult[];
  scrapingResults: ScrapingResult[];
  totalEmails: number;
  uniqueEmails: number;
  summary: {
    totalWebsites: number;
    successfulScrapes: number;
    failedScrapes: number;
    totalEmailsFound: number;
    uniqueEmailsFound: number;
    executionTime: number;
    emailsPerMinute: number;
    searchSource: string;
  };
}

export interface ScrapingJobWithSaveResult {
  success: boolean;
  jobId: string;
  collection: EmailCollection;
  summary: {
    totalWebsites: number;
    successfulScrapes: number;
    failedScrapes: number;
    totalEmailsFound: number;
    uniqueEmailsFound: number;
    savedEmails: number;
    duplicateEmails: number;
    executionTime: number;
    emailsPerMinute: number;
    searchSource: string;
  };
}

@Injectable()
export class JobService {
  private readonly logger = new Logger(JobService.name);
  private readonly activeJobs = new Map<string, ScrapingJob>();
  
  constructor(
    private scrapingService: ScrapingService,
    private searchService: SearchService,
    private dataService: DataService,
  ) {}

  /**
   * Runs a full scraping job with comprehensive metrics and error handling
   */
  async runScrapingJob(params: SearchParams): Promise<ScrapingJobResult> {
    const jobId = this.generateJobId();
    const startTime = Date.now();
    
    const job: ScrapingJob = {
      id: jobId,
      params,
      status: 'running',
      results: {
        searchResults: [],
        scrapingResults: [],
        totalEmails: 0,
        uniqueEmails: 0,
      },
      metrics: {
        totalWebsites: 0,
        successfulScrapes: 0,
        failedScrapes: 0,
        totalEmailsFound: 0,
        uniqueEmailsFound: 0,
        executionTime: 0,
        emailsPerMinute: 0,
      },
      createdAt: new Date(),
      startedAt: new Date(),
    };

    this.activeJobs.set(jobId, job);
    this.logger.log(`Starting scraping job ${jobId} with params:`, params);

    try {
      // Step 1: Run search with enhanced error handling
      this.logger.log(`Job ${jobId}: Starting search for "${params.query}"`);
      const searchResponse = await this.searchService.search(params);
      
      if (!searchResponse.success || searchResponse.results.length === 0) {
        throw new HttpException(
          `No search results found for "${params.query}"`,
          HttpStatus.NOT_FOUND,
        );
      }

      job.results.searchResults = searchResponse.results;
      this.logger.log(`Job ${jobId}: Found ${searchResponse.results.length} search results from ${searchResponse.source}`);

      // Step 2: Extract and validate URLs
      const urls = this.extractAndValidateUrls(searchResponse.results);
      job.metrics.totalWebsites = urls.length;
      
      if (urls.length === 0) {
        throw new HttpException(
          'No valid URLs found in search results',
          HttpStatus.NOT_FOUND,
        );
      }

      // Step 3: Run scraping with progress tracking
      this.logger.log(`Job ${jobId}: Scraping ${urls.length} URLs for emails`);
      const scrapingResults = await this.scrapingService.scrapeMultipleUrls(urls);
      job.results.scrapingResults = scrapingResults;

      // Step 4: Process and deduplicate emails
      const { allEmails, uniqueEmails } = this.processScrapingResults(scrapingResults);
      job.results.totalEmails = allEmails.length;
      job.results.uniqueEmails = uniqueEmails.length;

      // Step 5: Calculate comprehensive metrics
      const executionTime = Date.now() - startTime;
      const successfulScrapes = scrapingResults.filter(r => r.success).length;
      const failedScrapes = scrapingResults.filter(r => !r.success).length;
      
      job.metrics = {
        totalWebsites: urls.length,
        successfulScrapes,
        failedScrapes,
        totalEmailsFound: allEmails.length,
        uniqueEmailsFound: uniqueEmails.length,
        executionTime,
        emailsPerMinute: executionTime > 0 ? (uniqueEmails.length / (executionTime / 60000)) : 0,
      };

      // Step 6: Update job status
      job.status = 'completed';
      job.completedAt = new Date();
      this.activeJobs.set(jobId, job);

      this.logger.log(`Job ${jobId}: Completed successfully - ${uniqueEmails.length} unique emails found in ${executionTime}ms`);

      return {
        success: true,
        jobId,
        searchResults: searchResponse.results,
        scrapingResults,
        totalEmails: allEmails.length,
        uniqueEmails: uniqueEmails.length,
        summary: {
          totalWebsites: urls.length,
          successfulScrapes,
          failedScrapes,
          totalEmailsFound: allEmails.length,
          uniqueEmailsFound: uniqueEmails.length,
          executionTime,
          emailsPerMinute: job.metrics.emailsPerMinute,
          searchSource: searchResponse.source,
        },
      };

    } catch (error) {
      // Handle job failure
      job.status = 'failed';
      job.error = error.message;
      job.completedAt = new Date();
      this.activeJobs.set(jobId, job);

      this.logger.error(`Job ${jobId} failed: ${error.message}`, error.stack);

      throw new HttpException(
        `Scraping job failed: ${error.message}`,
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Runs scraping job and automatically saves results to a collection
   */
  async runScrapingJobAndSave(
    params: SearchParams,
    collectionName: string,
    userId: string,
  ): Promise<ScrapingJobWithSaveResult> {
    const jobId = this.generateJobId();
    const startTime = Date.now();

    this.logger.log(`Starting scraping job with save ${jobId} for user ${userId}`);

    try {
      // Step 1: Create collection with validation
      const collection = await this.dataService.createCollection(userId, {
        name: collectionName,
        description: `Automatically created from search: "${params.query}"`,
        searchParams: params,
      });

      this.logger.log(`Job ${jobId}: Created collection "${collectionName}" with ID ${collection._id}`);

      // Step 2: Run the scraping job
      const scrapingResult = await this.runScrapingJob(params);
      
      // Step 3: Save emails to collection with enhanced metadata
      if (scrapingResult.uniqueEmails > 0) {
        const saveStartTime = Date.now();
        
        await this.dataService.addEmailsToCollection(
          getIdString(collection._id),
          userId,
          {
            emails: scrapingResult.scrapingResults.flatMap(result => result.emails),
            metadata: {
              industry: params.industry,
              region: params.region,
              searchQuery: params.query,
              source: scrapingResult.summary.searchSource,
              jobId: jobId,
            },
          },
        );

        const saveTime = Date.now() - saveStartTime;
        this.logger.log(`Job ${jobId}: Saved ${scrapingResult.uniqueEmails} emails in ${saveTime}ms`);
      }

      // Step 4: Refresh collection to get updated counts
      const updatedCollection = await this.dataService.getCollection(
       getIdString(collection._id),
        userId,
      );

      // Step 5: Calculate save-specific metrics
      const executionTime = Date.now() - startTime;
      const duplicateEmails = scrapingResult.totalEmails - scrapingResult.uniqueEmails;

      const summary = {
        ...scrapingResult.summary,
        savedEmails: updatedCollection.totalEmails,
        duplicateEmails,
        executionTime,
        emailsPerMinute: executionTime > 0 ? (scrapingResult.uniqueEmails / (executionTime / 60000)) : 0,
      };

      this.logger.log(`Job ${jobId}: Save completed - ${updatedCollection.totalEmails} emails saved to collection`);

      return {
        success: true,
        jobId,
        collection: updatedCollection,
        summary,
      };

    } catch (error) {
      this.logger.error(`Job ${jobId} with save failed: ${error.message}`, error.stack);
      
      throw new HttpException(
        `Scraping job with save failed: ${error.message}`,
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get job status by ID
   */
  async getJobStatus(jobId: string): Promise<ScrapingJob | null> {
    return this.activeJobs.get(jobId) || null;
  }

  /**
   * Get all active jobs
   */
  async getActiveJobs(): Promise<ScrapingJob[]> {
    return Array.from(this.activeJobs.values());
  }

  /**
   * Cancel a running job
   */
  async cancelJob(jobId: string): Promise<boolean> {
    const job = this.activeJobs.get(jobId);
    if (job && job.status === 'running') {
      job.status = 'failed';
      job.error = 'Job cancelled by user';
      job.completedAt = new Date();
      this.activeJobs.set(jobId, job);
      
      this.logger.log(`Job ${jobId} cancelled by user`);
      return true;
    }
    return false;
  }

  /**
   * Clean up completed jobs older than specified age
   */
  async cleanupOldJobs(maxAgeHours: number = 24): Promise<number> {
    const cutoffTime = Date.now() - (maxAgeHours * 60 * 60 * 1000);
    let cleanedCount = 0;

    for (const [jobId, job] of this.activeJobs.entries()) {
      if (job.completedAt && job.completedAt.getTime() < cutoffTime) {
        this.activeJobs.delete(jobId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.log(`Cleaned up ${cleanedCount} old jobs`);
    }

    return cleanedCount;
  }

  /**
   * Get job statistics
   */
  async getJobStatistics(): Promise<{
    totalJobs: number;
    runningJobs: number;
    completedJobs: number;
    failedJobs: number;
    averageExecutionTime: number;
    totalEmailsProcessed: number;
  }> {
    const jobs = Array.from(this.activeJobs.values());
    
    const completedJobs = jobs.filter(job => job.status === 'completed');
    const averageExecutionTime = completedJobs.length > 0 
      ? completedJobs.reduce((sum, job) => sum + job.metrics.executionTime, 0) / completedJobs.length 
      : 0;

    const totalEmailsProcessed = completedJobs.reduce(
      (sum, job) => sum + job.metrics.uniqueEmailsFound, 
      0
    );

    return {
      totalJobs: jobs.length,
      runningJobs: jobs.filter(job => job.status === 'running').length,
      completedJobs: completedJobs.length,
      failedJobs: jobs.filter(job => job.status === 'failed').length,
      averageExecutionTime,
      totalEmailsProcessed,
    };
  }

  // Private helper methods

  private generateJobId(): string {
    return `job_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private extractAndValidateUrls(searchResults: SearchResult[]): string[] {
    const urls: string[] = [];
    const seenUrls = new Set<string>();

    for (const result of searchResults) {
      try {
        const url = new URL(result.link);
        const normalizedUrl = url.origin + url.pathname; // Normalize URL
        
        if (!seenUrls.has(normalizedUrl)) {
          seenUrls.add(normalizedUrl);
          urls.push(result.link);
        }
      } catch (error) {
        this.logger.warn(`Invalid URL in search results: ${result.link}`);
      }
    }

    return urls;
  }

  private processScrapingResults(scrapingResults: ScrapingResult[]): {
    allEmails: ScrapedEmail[];
    uniqueEmails: ScrapedEmail[];
  } {
    const allEmails = scrapingResults.flatMap(result => result.emails);
    const uniqueEmailsMap = new Map<string, ScrapedEmail>();

    // Deduplicate emails while preserving the first occurrence
    for (const email of allEmails) {
      const normalizedEmail = email.email.toLowerCase().trim();
      if (!uniqueEmailsMap.has(normalizedEmail)) {
        uniqueEmailsMap.set(normalizedEmail, email);
      }
    }

    return {
      allEmails,
      uniqueEmails: Array.from(uniqueEmailsMap.values()),
    };
  }

  extractAllEmails(scrapingResults: ScrapingResult[]): ScrapedEmail[] {
    return this.processScrapingResults(scrapingResults).allEmails;
  }

  /**
   * Quick test method for development and debugging
   */
  async quickTest(query: string, maxResults: number = 3): Promise<ScrapingJobResult> {
    return this.runScrapingJob({
      query,
      numResults: maxResults,
    });
  }

  /**
   * Batch process multiple search queries
   */
  async batchProcessQueries(
    queries: string[],
    commonParams: Partial<SearchParams> = {},
  ): Promise<ScrapingJobResult[]> {
    const results: ScrapingJobResult[] = [];

    for (const query of queries) {
      try {
        const result = await this.runScrapingJob({
          ...commonParams,
          query,
        });
        results.push(result);
      } catch (error) {
        this.logger.error(`Batch processing failed for query "${query}": ${error.message}`);
        // Continue with other queries even if one fails
      }
    }

    return results;
  }
}