import { 
  Controller, 
  Post, 
  Get, 
  Delete, 
  Body, 
  Param, 
  UseGuards, 
  Req,
  Query,
  Put
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { DataService } from './data.service';
import { getIdString } from '../common/utils';

@Controller('data')
@UseGuards(AuthGuard('jwt'))
export class DataController {
  constructor(private dataService: DataService) {}

  @Post('collections')
  async createCollection(@Req() req, @Body() createDto: {
    name: string;
    description?: string;
    searchParams: {
      query: string;
      industry?: string;
      region?: string;
      numResults?: number;
    };
  }) {
    return await this.dataService.createCollection(req.user.userId, createDto);
  }

  @Post('collections/:id/emails')
  async addEmails(
    @Req() req,
    @Param('id') collectionId: string,
    @Body() addEmailsDto: {
      emails: Array<{
        email: string;
        source: string;
        context?: string;
        timestamp: Date;
      }>;
      metadata?: {
        industry?: string;
        region?: string;
        company?: string;
        website?: string;
        searchQuery?: string;
        source?: string;
        jobId?: string;
      };
    },
  ) {
    return await this.dataService.addEmailsToCollection(
      collectionId,
      req.user.userId,
      addEmailsDto,
    );
  }

  @Get('collections')
  async getUserCollections(@Req() req) {
    return await this.dataService.getUserCollections(req.user.userId);
  }

  @Get('collections/:id')
  async getCollection(@Req() req, @Param('id') collectionId: string) {
    return await this.dataService.getCollection(collectionId, req.user.userId);
  }

  @Put('collections/:id')
  async updateCollection(
    @Req() req,
    @Param('id') collectionId: string,
    @Body() updates: { name?: string; description?: string }
  ) {
    return await this.dataService.updateCollection(
      collectionId,
      req.user.userId,
      updates
    );
  }

  @Delete('collections/:id')
  async deleteCollection(@Req() req, @Param('id') collectionId: string) {
    await this.dataService.deleteCollection(collectionId, req.user.userId);
    return { success: true, message: 'Collection deleted' };
  }

  @Post('collections/:id/emails/:email/status')
  async updateEmailStatus(
    @Req() req,
    @Param('id') collectionId: string,
    @Param('email') email: string,
    @Body() body: { status: 'pending' | 'verified' | 'invalid' },
  ) {
    return await this.dataService.updateEmailStatus(
      collectionId,
      req.user.userId,
      email,
      body.status,
    );
  }

  @Get('search')
  async searchEmails(
    @Req() req,
    @Query() query: {
      collectionId?: string;
      status?: string;
      industry?: string;
      region?: string;
      searchTerm?: string;
    },
  ) {
    return await this.dataService.searchEmails(req.user.userId, query);
  }

  @Get('collections/:id/stats')
  async getCollectionStats(@Req() req, @Param('id') collectionId: string) {
    return await this.dataService.getCollectionStats(collectionId, req.user.userId);
  }

  @Get('collections/:id/emails')
  async getCollectionEmails(
    @Req() req,
    @Param('id') collectionId: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 50
  ) {
    return await this.dataService.getEmailsWithPagination(
      collectionId,
      req.user.userId,
      page,
      limit
    );
  }

  @Delete('collections/:id/emails')
  async deleteEmailsFromCollection(
    @Req() req,
    @Param('id') collectionId: string,
    @Body() body: { emails: string[] }
  ) {
    return await this.dataService.deleteEmailsFromCollection(
      collectionId,
      req.user.userId,
      body.emails
    );
  }

  @Get('stats/overview')
  async getOverviewStats(@Req() req) {
    const collections = await this.dataService.getUserCollections(req.user.userId);
    
    const totalEmails = collections.reduce((sum, col) => sum + col.totalEmails, 0);
    const totalCollections = collections.length;
    const verifiedEmails = collections.reduce((sum, col) => sum + col.verifiedEmails, 0);

    return {
      totalCollections,
      totalEmails,
      verifiedEmails,
      invalidEmails: totalEmails - verifiedEmails,
      recentCollections: collections.slice(0, 5).map(col => ({
        id: getIdString(col._id),
        name: col.name,
        emailCount: col.totalEmails,
        createdAt: new Date(), // Use current date as fallback
      })),
    };
  }
}