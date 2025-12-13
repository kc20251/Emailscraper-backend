import { Injectable, HttpException, HttpStatus, Logger, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Campaign, CampaignEmail } from '../schemas/campaign.schema';
import { EmailService } from '../email/email.service';
import { SMTPConfig } from '../schemas/smtp-config.schema';
import { EmailTemplate } from '../schemas/email-template.schema';
import { CampaignResponseDto } from './dto/campaign-response.dto';
import { getIdString } from '../common/utils';

export interface CreateCampaignDto {
  name: string;
  description?: string;
  smtpConfigId: string;
  templateId?: string;
  emails: Array<{
    email: string;
    name?: string;
    variables?: Record<string, string>;
  }>;
  settings?: {
    delayBetweenEmails?: number;
    maxEmailsPerHour?: number;
    timezone?: string;
  };
}

@Injectable()
export class CampaignService {
  private readonly logger = new Logger(CampaignService.name);
  private activeCampaigns = new Map<string, NodeJS.Timeout>();

  constructor(
    @InjectModel(Campaign.name)
    private campaignModel: Model<Campaign>,

    @InjectModel(SMTPConfig.name)
    private smtpConfigModel: Model<SMTPConfig>,

    @InjectModel(EmailTemplate.name)
    private emailTemplateModel: Model<EmailTemplate>,

    private emailService: EmailService,
  ) {}

  async createCampaign(userId: string, createDto: CreateCampaignDto): Promise<CampaignResponseDto> {
    try {
      // Validate SMTP config exists and belongs to user
      const smtpConfig = await this.smtpConfigModel.findOne({
        _id: new Types.ObjectId(createDto.smtpConfigId),
        userId: new Types.ObjectId(userId),
      });

      if (!smtpConfig) {
        throw new BadRequestException('SMTP configuration not found or access denied');
      }

      if (!smtpConfig.isActive) {
        throw new BadRequestException('SMTP configuration is not active');
      }

      // Validate template if provided
      if (createDto.templateId) {
        const template = await this.emailTemplateModel.findOne({
          _id: new Types.ObjectId(createDto.templateId),
          userId: new Types.ObjectId(userId),
        });

        if (!template) {
          throw new BadRequestException('Email template not found or access denied');
        }
      }

      // Validate emails
      if (!createDto.emails || createDto.emails.length === 0) {
        throw new BadRequestException('At least one email is required');
      }

      // Create campaign
      const campaignData = {
        _id: new Types.ObjectId(),
        userId: new Types.ObjectId(userId),
        name: createDto.name,
        description: createDto.description,
        smtpConfigId: new Types.ObjectId(createDto.smtpConfigId),
        templateId: createDto.templateId ? new Types.ObjectId(createDto.templateId) : undefined,
        emails: createDto.emails.map(email => ({
          email: email.email,
          name: email.name || '',
          variables: email.variables || {},
          status: 'pending',
          openCount: 0,
          clickCount: 0,
        })),
        totalEmails: createDto.emails.length,
        status: 'draft',
        settings: createDto.settings || {},
      };

      const campaign = new this.campaignModel(campaignData);
      const savedCampaign = await campaign.save();
      this.logger.log(`Campaign created: ${savedCampaign.name} for user ${userId}`);
      
      return CampaignResponseDto.fromDocument(savedCampaign);
    } catch (error) {
      this.logger.error(`Failed to create campaign: ${error.message}`);
      throw new HttpException(
        `Campaign creation failed: ${error.message}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private async sendCampaignEmail(
    campaignId: string,
    emailData: CampaignEmail,
    template: EmailTemplate,
    smtpConfig: SMTPConfig,
  ) {
    try {
      const result = await this.emailService.sendEmail(getIdString(smtpConfig._id), {
        to: emailData.email,
        subject: template.subject,
        html: template.body,
        trackingId: `${campaignId}_${emailData.email}_${Date.now()}`,
      });

      return result;
    } catch (error) {
      this.logger.error(`Failed to send campaign email: ${error.message}`);
      throw error;
    }
  }

  async startCampaign(campaignId: string, userId: string): Promise<void> {
    const campaign = await this.campaignModel.findOne({
      _id: new Types.ObjectId(campaignId),
      userId: new Types.ObjectId(userId),
    });

    if (!campaign) {
      throw new HttpException('Campaign not found', HttpStatus.NOT_FOUND);
    }

    if (campaign.status !== 'draft' && campaign.status !== 'paused') {
      throw new BadRequestException(`Campaign cannot be started from ${campaign.status} status`);
    }

    // Update campaign status
    const updatedCampaign = await this.campaignModel.findByIdAndUpdate(
      campaignId,
      {
        status: 'running',
        startedAt: new Date(),
      },
      { new: true },
    );

    if (!updatedCampaign) {
      throw new HttpException('Campaign not found after update', HttpStatus.NOT_FOUND);
    }

    // Start sending emails
    await this.processCampaignEmails(updatedCampaign);
  }

  private async processCampaignEmails(campaign: Campaign): Promise<void> {
    // Get pending emails
    const pendingEmails = campaign.emails.filter(email => email.status === 'pending');
    
    if (pendingEmails.length === 0) {
      await this.campaignModel.findByIdAndUpdate(campaign._id, {
        status: 'completed',
        completedAt: new Date(),
      });
      return;
    }

    // Get template and SMTP config
    const [template, smtpConfig] = await Promise.all([
      campaign.templateId 
        ? this.emailTemplateModel.findById(campaign.templateId)
        : null,
      this.smtpConfigModel.findById(campaign.smtpConfigId),
    ]);

    if (!smtpConfig) {
      throw new BadRequestException('SMTP configuration not found');
    }

    // Process emails with rate limiting
    const settings = campaign.settings || {};
    const delay = settings.delayBetweenEmails || 1000; // Default 1 second
    const maxPerHour = settings.maxEmailsPerHour || 100; // Default 100 per hour

    let emailsSentThisHour = 0;
    const startOfHour = new Date();
    startOfHour.setMinutes(0, 0, 0);

    for (const email of pendingEmails) {
      // Check hourly limit
      if (emailsSentThisHour >= maxPerHour) {
        // Schedule next batch for next hour
        const now = new Date();
        const nextHour = new Date(now);
        nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
        const delayMs = nextHour.getTime() - now.getTime();

        setTimeout(() => this.processCampaignEmails(campaign), delayMs);
        break;
      }

      try {
        let subject = '';
        let body = '';

        if (template) {
          // Personalize template
          subject = this.personalizeTemplate(template.subject, email.variables || {});
          body = this.personalizeTemplate(template.body, email.variables || {});
        } else {
          subject = 'Default Subject';
          body = 'Default email body';
        }

        const result = await this.emailService.sendEmail(getIdString(smtpConfig._id), {
          to: email.email,
          subject,
          html: body,
          trackingId: `${getIdString(campaign._id)}_${email.email}_${Date.now()}`,
        });

        // Update email status
        await this.campaignModel.updateOne(
          { _id: campaign._id, 'emails.email': email.email },
          {
            $set: {
              'emails.$.status': result.success ? 'sent' : 'failed',
              'emails.$.sentAt': new Date(),
              'emails.$.messageId': result.messageId,
              'emails.$.error': result.error,
            },
            $inc: {
              emailsSent: 1,
              ...(result.success ? { emailsDelivered: 1 } : { emailsFailed: 1 }),
            },
            lastEmailSentAt: new Date(),
          },
        );

        emailsSentThisHour++;

        // Rate limiting delay
        if (delay > 0) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }

      } catch (error) {
        this.logger.error(`Failed to process email ${email.email}: ${error.message}`);
        
        await this.campaignModel.updateOne(
          { _id: campaign._id, 'emails.email': email.email },
          {
            $set: {
              'emails.$.status': 'failed',
              'emails.$.error': error.message,
            },
            $inc: {
              emailsFailed: 1,
            },
          },
        );
      }
    }

    // Check if all emails are processed
    const updatedCampaign = await this.campaignModel.findById(campaign._id);
    if (updatedCampaign) {
      const remainingPending = updatedCampaign.emails.filter(email => 
        email.status === 'pending'
      ).length;

      if (remainingPending === 0) {
        await this.campaignModel.findByIdAndUpdate(campaign._id, {
          status: 'completed',
          completedAt: new Date(),
        });
      }
    }
  }

  private personalizeTemplate(template: string, variables: Record<string, string>): string {
    let result = template;
    Object.entries(variables).forEach(([key, value]) => {
      const placeholder = `{{${key}}}`;
      const regex = new RegExp(this.escapeRegExp(placeholder), 'g');
      result = result.replace(regex, value || '');
    });
    return result;
  }

  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  async getUserCampaigns(userId: string, status?: string): Promise<CampaignResponseDto[]> {
    const query: any = { userId: new Types.ObjectId(userId) };
    
    if (status) {
      query.status = status;
    }

    const campaigns = await this.campaignModel
      .find(query)
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    return campaigns.map(campaign => CampaignResponseDto.fromDocument(campaign));
  }

  async getCampaign(campaignId: string, userId: string): Promise<CampaignResponseDto> {
    const campaign = await this.campaignModel
      .findOne({
        _id: new Types.ObjectId(campaignId),
        userId: new Types.ObjectId(userId),
      })
      .lean()
      .exec();

    if (!campaign) {
      throw new HttpException('Campaign not found', HttpStatus.NOT_FOUND);
    }

    return CampaignResponseDto.fromDocument(campaign);
  }

  async updateCampaign(campaignId: string, userId: string, updates: any): Promise<CampaignResponseDto> {
    // Don't allow updates to running campaigns
    const current = await this.campaignModel.findOne({
      _id: new Types.ObjectId(campaignId),
      userId: new Types.ObjectId(userId),
    });

    if (!current) {
      throw new HttpException('Campaign not found', HttpStatus.NOT_FOUND);
    }

    if (current.status === 'running') {
      throw new BadRequestException('Cannot update a running campaign');
    }

    const campaign = await this.campaignModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(campaignId),
          userId: new Types.ObjectId(userId),
        },
        { $set: updates },
        { new: true },
      )
      .lean()
      .exec();

    if (!campaign) {
      throw new HttpException('Campaign not found', HttpStatus.NOT_FOUND);
    }

    return CampaignResponseDto.fromDocument(campaign);
  }

  async deleteCampaign(campaignId: string, userId: string): Promise<void> {
    const result = await this.campaignModel.deleteOne({
      _id: new Types.ObjectId(campaignId),
      userId: new Types.ObjectId(userId),
    });

    if (result.deletedCount === 0) {
      throw new HttpException('Campaign not found', HttpStatus.NOT_FOUND);
    }
  }

  async pauseCampaign(campaignId: string, userId: string): Promise<void> {
    const campaign = await this.campaignModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(campaignId),
        userId: new Types.ObjectId(userId),
        status: 'running',
      },
      { status: 'paused' },
      { new: true },
    );

    if (!campaign) {
      throw new HttpException('Campaign not found or not running', HttpStatus.NOT_FOUND);
    }
  }

  async resumeCampaign(campaignId: string, userId: string): Promise<void> {
    const campaign = await this.campaignModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(campaignId),
        userId: new Types.ObjectId(userId),
        status: 'paused',
      },
      { status: 'running' },
      { new: true },
    );

    if (!campaign) {
      throw new HttpException('Campaign not found or not paused', HttpStatus.NOT_FOUND);
    }

    // Resume processing
    await this.processCampaignEmails(campaign);
  }

  async getCampaignAnalytics(campaignId: string, userId: string): Promise<any> {
    const campaign = await this.campaignModel.findOne({
      _id: new Types.ObjectId(campaignId),
      userId: new Types.ObjectId(userId),
    });

    if (!campaign) {
      throw new HttpException('Campaign not found', HttpStatus.NOT_FOUND);
    }

    const total = campaign.totalEmails;
    const sent = campaign.emailsSent;
    const delivered = campaign.emailsDelivered;
    const opened = campaign.emailsOpened;
    const clicked = campaign.emailsClicked;
    const bounced = campaign.emailsBounced;
    const failed = campaign.emailsFailed;

    const deliveryRate = total > 0 ? (sent / total) * 100 : 0;
    const openRate = delivered > 0 ? (opened / delivered) * 100 : 0;
    const clickRate = delivered > 0 ? (clicked / delivered) * 100 : 0;
    const bounceRate = total > 0 ? (bounced / total) * 100 : 0;
    const failureRate = total > 0 ? (failed / total) * 100 : 0;

    const overallScore = (
      deliveryRate * 0.3 +
      openRate * 0.3 +
      clickRate * 0.2 +
      (100 - bounceRate) * 0.1 +
      (100 - failureRate) * 0.1
    );

    return {
      campaignId: getIdString(campaign._id),
      name: campaign.name,
      status: campaign.status,
      totals: {
        total,
        sent,
        delivered,
        opened,
        clicked,
        bounced,
        failed,
      },
      rates: {
        deliveryRate: Math.round(deliveryRate * 100) / 100,
        openRate: Math.round(openRate * 100) / 100,
        clickRate: Math.round(clickRate * 100) / 100,
        bounceRate: Math.round(bounceRate * 100) / 100,
        failureRate: Math.round(failureRate * 100) / 100,
      },
      score: {
        overall: Math.round(overallScore * 100) / 100,
        engagement: Math.round((openRate * 0.5 + clickRate * 0.5) * 100) / 100,
        deliverability: Math.round((100 - bounceRate - failureRate) * 100) / 100,
      },
      timeline: {
        startedAt: campaign.startedAt,
        completedAt: campaign.completedAt,
        lastEmailSentAt: campaign.lastEmailSentAt,
      },
    };
  }
}