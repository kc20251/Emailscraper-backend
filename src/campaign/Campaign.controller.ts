import { 
  Controller, 
  Post, 
  Get, 
  Body, 
  Param, 
  UseGuards, 
  Req, 
  Delete,
  Put,
  Query 
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
// Remove or comment out Swagger imports if not needed
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import type { CreateCampaignDto } from './campaign.service';
import { CampaignService } from './campaign.service';

@Controller('campaigns')
@UseGuards(AuthGuard('jwt'))
@ApiTags('campaigns')
@ApiBearerAuth()
export class CampaignController {
  constructor(private campaignService: CampaignService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new campaign' })
  @ApiResponse({ status: 201, description: 'Campaign created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async createCampaign(@Req() req, @Body() createDto: CreateCampaignDto) {
    const campaign = await this.campaignService.createCampaign(req.user.userId, createDto);
    return { success: true, campaign };
  }

  @Get()
  @ApiOperation({ summary: 'Get all campaigns for user' })
  async getCampaigns(@Req() req, @Query('status') status?: string) {
    const campaigns = await this.campaignService.getUserCampaigns(req.user.userId, status);
    return campaigns;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get campaign by ID' })
  async getCampaign(@Req() req, @Param('id') campaignId: string) {
    const campaign = await this.campaignService.getCampaign(campaignId, req.user.userId);
    return campaign;
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update campaign' })
  async updateCampaign(
    @Req() req,
    @Param('id') campaignId: string,
    @Body() updateData: any
  ) {
    const campaign = await this.campaignService.updateCampaign(campaignId, req.user.userId, updateData);
    return { success: true, campaign };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete campaign' })
  async deleteCampaign(@Req() req, @Param('id') campaignId: string) {
    await this.campaignService.deleteCampaign(campaignId, req.user.userId);
    return { success: true, message: 'Campaign deleted successfully' };
  }

  @Post(':id/start')
  @ApiOperation({ summary: 'Start campaign' })
  async startCampaign(@Req() req, @Param('id') campaignId: string) {
    await this.campaignService.startCampaign(campaignId, req.user.userId);
    return { success: true, message: 'Campaign started' };
  }

  @Post(':id/pause')
  @ApiOperation({ summary: 'Pause campaign' })
  async pauseCampaign(@Req() req, @Param('id') campaignId: string) {
    await this.campaignService.pauseCampaign(campaignId, req.user.userId);
    return { success: true, message: 'Campaign paused' };
  }

  @Post(':id/resume')
  @ApiOperation({ summary: 'Resume campaign' })
  async resumeCampaign(@Req() req, @Param('id') campaignId: string) {
    await this.campaignService.resumeCampaign(campaignId, req.user.userId);
    return { success: true, message: 'Campaign resumed' };
  }

  @Get(':id/analytics')
  @ApiOperation({ summary: 'Get campaign analytics' })
  async getAnalytics(@Req() req, @Param('id') campaignId: string) {
    const analytics = await this.campaignService.getCampaignAnalytics(campaignId, req.user.userId);
    return analytics;
  }
}