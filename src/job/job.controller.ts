import { Controller, Post, Body, Get, UseGuards, HttpException, HttpStatus, Param } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { JobService } from './job.service';
import type { SearchParams } from '../search/search.service';

@Controller('job')
@UseGuards(AuthGuard('jwt'))
export class JobController {
  constructor(private readonly jobService: JobService) {}

  /**
   * Run a new scraping job based on the search query and parameters
   */
  @Post('run-scraping')
  async runJob(@Body() params: SearchParams){
    const result = await this.jobService.runScrapingJob(params);
    return result
  }

  @Post('quick-test')
  async quickTest(@Body() body: {query: string}) {
    const result = await this.jobService.runScrapingJob({
        query: body.query,
        numResults: 3.
    })
    return result;
  }
    @Get('active')
  async getActiveJobs() {
    return this.jobService.getActiveJobs();
  }

  @Get(':id')
  async getJobStatus(@Param('id') jobId: string) {
    return this.jobService.getJobStatus(jobId);
  }

  @Post(':id/cancel')
  async cancelJob(@Param('id') jobId: string) {
    const success = await this.jobService.cancelJob(jobId);
    return { success };
  }

  @Get('statistics')
  async getJobStatistics() {
    return this.jobService.getJobStatistics();
  }

  @Post('cleanup')
  async cleanupOldJobs() {
    const cleanedCount = await this.jobService.cleanupOldJobs();
    return { cleanedCount };
  }
}
