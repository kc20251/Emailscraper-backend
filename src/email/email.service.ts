import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as nodemailer from 'nodemailer';
import { createHash } from 'crypto';
import { getIdString } from '../common/utils';
import { SMTPConfig } from '../schemas/smtp-config.schema';
import { Campaign, CampaignEmail } from '../schemas/campaign.schema';
import { EmailTemplate } from '../schemas/email-template.schema';

export interface EmailOptions {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  from?: string;
  replyTo?: string;
  trackingId?: string;
  attachments?: Array<{
    filename: string;
    content?: Buffer;
    path?: string;
    contentType?: string;
  }>;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  status: 'sent' | 'delivered' | 'failed' | 'bounced';
  response?: string;
}

export interface CampaignAnalytics {
  deliveryRate: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
  bounceRate: number;
  overallScore: number;
  engagementScore: number;
  spamScore: number;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transportCache = new Map<string, nodemailer.Transporter>();
  private readonly dailyStats = new Map<string, { sent: number; failed: number }>();

  constructor(
    @InjectModel(SMTPConfig.name)
    private smtpConfigModel: Model<SMTPConfig>,

    @InjectModel(Campaign.name)
    private campaignModel: Model<Campaign>,

    @InjectModel(EmailTemplate.name)
    private emailTemplateModel: Model<EmailTemplate>,
  ) {
    // Reset daily stats at midnight
    this.scheduleDailyReset();
  }

  // -------------------------------
  // TRANSPORTER MANAGEMENT
  // -------------------------------
  private async getTransporter(config: SMTPConfig): Promise<nodemailer.Transporter> {
    const cacheKey = `${config.host}:${config.port}:${config.username}`;
    
    if (this.transportCache.has(cacheKey)) {
      return this.transportCache.get(cacheKey)!;
    }

    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.username,
        pass: config.password,
      },
      pool: true, // Use connection pooling
      maxConnections: 5,
      maxMessages: 100,
      connectionTimeout: 30000,
      greetingTimeout: 30000,
      socketTimeout: 60000,
      debug: process.env.NODE_ENV === 'development',
      logger: process.env.NODE_ENV === 'development',
    });

    // Verify connection
    try {
      await transporter.verify();
      this.logger.log(`SMTP connection verified for ${config.host}`);
      this.transportCache.set(cacheKey, transporter);
      
      // Cleanup transporter on close
        (transporter as any).on('close', () => {
      this.transportCache.delete(cacheKey);
    });
    } catch (error) {
      this.logger.error(`SMTP connection failed for ${config.host}: ${error.message}`);
      throw error;
    }

    return transporter;
  }

  async sendCampaignEmail(
  smtpConfigId: string,
  emailOptions: EmailOptions,
): Promise<SendEmailResult> {
  return this.sendEmail(smtpConfigId, emailOptions);
}

  // -------------------------------
  // CONFIGURATION MANAGEMENT
  // -------------------------------
  async createSMTPConfig(userId: string, configData: any): Promise<SMTPConfig> {
    try {
      // Validate configuration
      await this.testSMTPConfiguration(configData);

      const config = new this.smtpConfigModel({
        ...configData,
        userId: new Types.ObjectId(userId),
        dnsRecords: await this.checkDNSRecords(configData.fromEmail),
        successRate: 100,
        bounceRate: 0,
      });

      const savedConfig = await config.save();
      this.logger.log(`SMTP config created: ${savedConfig.name} for user ${userId}`);
      
      return savedConfig;
    } catch (error) {
      this.logger.error(`Failed to create SMTP config: ${error.message}`);
      throw new HttpException(
        `SMTP configuration failed: ${error.message}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async getUserSMTPConfigs(userId: string): Promise<SMTPConfig[]> {
    return this.smtpConfigModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .exec();
  }

  async getSMTPConfig(configId: string, userId: string): Promise<SMTPConfig> {
    const config = await this.smtpConfigModel.findOne({
      _id: new Types.ObjectId(configId),
      userId: new Types.ObjectId(userId),
    });

    if (!config) {
      throw new HttpException('SMTP configuration not found', HttpStatus.NOT_FOUND);
    }

    return config;
  }

  async updateSMTPConfig(
    configId: string,
    userId: string,
    updates: Partial<SMTPConfig>,
  ): Promise<SMTPConfig> {
    if (updates.host || updates.port || updates.username || updates.password) {
      await this.testSMTPConfiguration(updates);
    }

    const config = await this.smtpConfigModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(configId),
        userId: new Types.ObjectId(userId),
      },
      { $set: updates },
      { new: true, runValidators: true },
    );

    if (!config) {
      throw new HttpException('SMTP configuration not found', HttpStatus.NOT_FOUND);
    }

    // Clear cached transporter
    const cacheKey = `${config.host}:${config.port}:${config.username}`;
    this.transportCache.delete(cacheKey);

    return config;
  }

  async deleteSMTPConfig(configId: string, userId: string): Promise<void> {
    const result = await this.smtpConfigModel.deleteOne({
      _id: new Types.ObjectId(configId),
      userId: new Types.ObjectId(userId),
    });

    if (result.deletedCount === 0) {
      throw new HttpException('SMTP configuration not found', HttpStatus.NOT_FOUND);
    }
  }

  // -------------------------------
  // EMAIL SENDING CORE
  // -------------------------------
  async sendEmail(
    smtpConfigId: string,
    emailOptions: EmailOptions,
  ): Promise<SendEmailResult> {
    const startTime = Date.now();
    
    try {
      const config = await this.smtpConfigModel.findById(smtpConfigId);
      if (!config || !config.isActive) {
        throw new Error('SMTP configuration not found or inactive');
      }

      // Rate limiting check
      await this.checkAndUpdateRateLimit(config);

      const transporter = await this.getTransporter(config);

      const mailOptions: nodemailer.SendMailOptions = {
        from: emailOptions.from || `"${config.fromName}" <${config.fromEmail}>`,
        to: emailOptions.to,
        subject: emailOptions.subject,
        html: emailOptions.html,
        text: emailOptions.text,
        replyTo: emailOptions.replyTo,
        attachments: emailOptions.attachments,
        headers: {
          'X-Auto-Response-Suppress': 'All',
          'Auto-Submitted': 'auto-generated',
          ...(emailOptions.trackingId && {
            'X-Tracking-ID': emailOptions.trackingId,
            'X-Campaign-ID': emailOptions.trackingId?.split('_')[0],
          }),
        },
        envelope: {
          from: config.fromEmail,
          to: emailOptions.to,
        },
      };

      const info = await transporter.sendMail(mailOptions);
      const executionTime = Date.now() - startTime;

      // Update statistics
     await this.updateSMTPStats(getIdString(config._id), true);
   this.updateDailyStats(getIdString(config._id), true);

      this.logger.log(`Email sent to ${emailOptions.to} in ${executionTime}ms - ${info.messageId}`);

      return {
        success: true,
        messageId: info.messageId,
        status: 'sent',
        response: info.response,
      };

    } catch (error) {
      this.logger.error(`Failed to send email to ${emailOptions.to}: ${error.message}`);
      
      // Update failure statistics
      if (smtpConfigId) {
        await this.updateSMTPStats(smtpConfigId, false);
        this.updateDailyStats(smtpConfigId, false);
      }

      return {
        success: false,
        error: error.message,
        status: 'failed',
      };
    }
  }

  // -------------------------------
  // RATE LIMITING & THROTTLING
  // -------------------------------
  private async checkAndUpdateRateLimit(config: SMTPConfig): Promise<void> {
    const now = new Date();
    const lastReset = config.lastResetDate || new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Reset daily counter if it's a new day
    if (lastReset.toDateString() !== now.toDateString()) {
      await this.smtpConfigModel.updateOne(
        { _id: config._id },
        {
          emailsSentToday: 0,
          lastResetDate: now,
        },
      );
    }

    // Check daily limit
    if (config.dailyLimit > 0 && config.emailsSentToday >= config.dailyLimit) {
      throw new Error(`Daily email limit (${config.dailyLimit}) exceeded for ${config.name}`);
    }

    // Check hourly rate limit
    const hourlyKey = `${config._id}:${now.getHours()}`;
    const hourlyCount = this.dailyStats.get(hourlyKey)?.sent || 0;
    
    if (config.hourlyRateLimit > 0 && hourlyCount >= config.hourlyRateLimit) {
      throw new Error(`Hourly rate limit (${config.hourlyRateLimit}) exceeded for ${config.name}`);
    }
  }

  private async updateSMTPStats(configId: string, success: boolean): Promise<void> {
    const update: any = {
      $inc: {
        emailsSentToday: 1,
        totalEmailsSent: 1,
      },
    };

    if (!success) {
      update.$inc.emailsFailed = 1;
    }

    await this.smtpConfigModel.updateOne(
      { _id: new Types.ObjectId(configId) },
      update,
    );
  }

  private updateDailyStats(configId: string, success: boolean): void {
    const hourlyKey = `${configId}:${new Date().getHours()}`;
    const stats = this.dailyStats.get(hourlyKey) || { sent: 0, failed: 0 };
    
    if (success) {
      stats.sent++;
    } else {
      stats.failed++;
    }
    
    this.dailyStats.set(hourlyKey, stats);
  }

  private scheduleDailyReset(): void {
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const timeUntilMidnight = nextMidnight.getTime() - now.getTime();

    setTimeout(() => {
      this.dailyStats.clear();
      this.scheduleDailyReset(); // Schedule next reset
    }, timeUntilMidnight);
  }

  // -------------------------------
  // TEMPLATE MANAGEMENT
  // -------------------------------
  async createTemplate(userId: string, templateData: any): Promise<EmailTemplate> {
    const template = new this.emailTemplateModel({
      ...templateData,
      userId: new Types.ObjectId(userId),
      variables: this.extractVariablesFromTemplate(templateData.body, templateData.subject),
    });

    return await template.save();
  }

  async getUserTemplates(userId: string): Promise<EmailTemplate[]> {
    return this.emailTemplateModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .exec();
  }

  async getTemplate(templateId: string, userId: string): Promise<EmailTemplate> {
    const template = await this.emailTemplateModel.findOne({
      _id: new Types.ObjectId(templateId),
      userId: new Types.ObjectId(userId),
    });

    if (!template) {
      throw new HttpException('Template not found', HttpStatus.NOT_FOUND);
    }

    return template;
  }

  async updateTemplate(
    templateId: string,
    userId: string,
    updates: any,
  ): Promise<EmailTemplate> {
    if (updates.body || updates.subject) {
      updates.variables = this.extractVariablesFromTemplate(
        updates.body || '',
        updates.subject || '',
      );
    }

    const template = await this.emailTemplateModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(templateId),
        userId: new Types.ObjectId(userId),
      },
      { $set: updates },
      { new: true },
    );

    if (!template) {
      throw new HttpException('Template not found', HttpStatus.NOT_FOUND);
    }

    return template;
  }

  async deleteTemplate(templateId: string, userId: string): Promise<void> {
    const result = await this.emailTemplateModel.deleteOne({
      _id: new Types.ObjectId(templateId),
      userId: new Types.ObjectId(userId),
    });

    if (result.deletedCount === 0) {
      throw new HttpException('Template not found', HttpStatus.NOT_FOUND);
    }
  }

  // -------------------------------
  // TEMPLATE PERSONALIZATION
  // -------------------------------
  private personalizeTemplate(
    template: EmailTemplate,
    variables: Record<string, string>,
  ): { subject: string; body: string; text?: string } {
    let subject = template.subject;
    let body = template.body;

    // Replace all variables in subject and body
    Object.entries(variables).forEach(([key, value]) => {
      const placeholder = `{{${key}}}`;
      const regex = new RegExp(this.escapeRegExp(placeholder), 'g');
      subject = subject.replace(regex, value || '');
      body = body.replace(regex, value || '');
    });

    // Add tracking for HTML emails
    if (template.type === 'html' && template.trackOpens) {
     const trackingPixel = this.generateTrackingPixel(getIdString(template._id));
      body += trackingPixel;
    }

    // Convert HTML to text for plain text version
    const text = template.type === 'html' ? this.htmlToText(body) : body;

    return { subject, body, text };
  }

  private extractVariablesFromTemplate(body: string, subject: string): string[] {
    const variableRegex = /{{(\w+)}}/g;
    const variables = new Set<string>();
    
    let match;
    while ((match = variableRegex.exec(body + subject)) !== null) {
      variables.add(match[1]);
    }
    
    return Array.from(variables);
  }

  private generateTrackingPixel(templateId: string): string {
    const trackingId = createHash('md5').update(`${templateId}-${Date.now()}`).digest('hex');
    return `<img src="${process.env.TRACKING_URL}/open/${trackingId}" width="1" height="1" style="display:none;"/>`;
  }

  private htmlToText(html: string): string {
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<p\s*\/?>/gi, '\n\n')
      .replace(/<[^>]*>/g, '')
      .replace(/\n\s*\n/g, '\n\n')
      .trim();
  }

  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // -------------------------------
  // CAMPAIGN EMAIL PROCESSING
  // -------------------------------
  async processCampaignEmail(
    campaignId: string,
    emailData: CampaignEmail,
    template: EmailTemplate,
    smtpConfig: SMTPConfig,
  ): Promise<SendEmailResult> {
    try {
      const personalizedContent = this.personalizeTemplate(template, emailData.variables || {});
      const trackingId = `${campaignId}_${emailData.email}_${Date.now()}`;

      const result = await this.sendEmail(getIdString(smtpConfig._id), {
        to: emailData.email,
        subject: personalizedContent.subject,
        html: personalizedContent.body,
        text: personalizedContent.text,
        trackingId,
      });

      await this.updateCampaignEmailStatus(
        campaignId,
        emailData.email,
        result.success ? 'sent' : 'failed',
        result.messageId,
        result.error,
      );

      return result;
    } catch (error) {
      this.logger.error(`Failed to process campaign email ${emailData.email}: ${error.message}`);
      
      await this.updateCampaignEmailStatus(
        campaignId,
        emailData.email,
        'failed',
        undefined,
        error.message,
      );

      return {
        success: false,
        error: error.message,
        status: 'failed',
      };
    }
  }

  private async updateCampaignEmailStatus(
    campaignId: string,
    email: string,
    status: string,
    messageId?: string,
    error?: string,
  ): Promise<void> {
    const updateData: any = {
      $set: {
        'emails.$.status': status,
        ...(messageId && { 'emails.$.messageId': messageId }),
        ...(error && { 'emails.$.error': error }),
      },
      $inc: {},
    };

    if (status === 'sent') {
      updateData.$inc.emailsSent = 1;
      updateData.$set['emails.$.sentAt'] = new Date();
    } else if (status === 'failed') {
      updateData.$inc.emailsFailed = 1;
    }

    await this.campaignModel.updateOne(
      { _id: new Types.ObjectId(campaignId), 'emails.email': email },
      updateData,
    );
  }

  // -------------------------------
  // VALIDATION & TESTING
  // -------------------------------
  async verifySMTPConfig(configId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const config = await this.smtpConfigModel.findById(configId);
      if (!config) {
        return { success: false, error: 'SMTP configuration not found' };
      }

      const transporter = await this.getTransporter(config);
      await transporter.verify();

      // Update DNS status
      const dnsStatus = await this.checkDNSRecords(config.fromEmail);
      await this.smtpConfigModel.updateOne(
        { _id: configId },
        { dnsRecords: dnsStatus },
      );

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  private async testSMTPConfiguration(configData: any): Promise<void> {
    const testTransporter = nodemailer.createTransport({
      host: configData.host,
      port: configData.port,
      secure: configData.secure,
      auth: {
        user: configData.username,
        pass: configData.password,
      },
    });

    await testTransporter.verify();
  }

  private async checkDNSRecords(domain: string): Promise<{
    spf: boolean;
    dkim: boolean;
    dmarc: boolean;
    mx: boolean;
  }> {
    // Simplified DNS check - in production, use a proper DNS lookup library
    return {
      spf: true,
      dkim: true,
      dmarc: true,
      mx: true,
    };
  }

  // -------------------------------
  // ANALYTICS & REPORTING
  // -------------------------------
  async getCampaignAnalytics(campaignId: string): Promise<CampaignAnalytics> {
    const campaign = await this.campaignModel.findById(campaignId);
    if (!campaign) {
      throw new HttpException('Campaign not found', HttpStatus.NOT_FOUND);
    }

    const total = campaign.totalEmails;
    const delivered = campaign.emailsDelivered;
    const opened = campaign.emailsOpened;
    const clicked = campaign.emailsClicked;
    const replied = campaign.emailsReplied;
    const bounced = campaign.emailsBounced;

    const deliveryRate = total > 0 ? (delivered / total) * 100 : 0;
    const openRate = delivered > 0 ? (opened / delivered) * 100 : 0;
    const clickRate = delivered > 0 ? (clicked / delivered) * 100 : 0;
    const replyRate = delivered > 0 ? (replied / delivered) * 100 : 0;
    const bounceRate = total > 0 ? (bounced / total) * 100 : 0;

    const overallScore = this.calculateCampaignScore(
      deliveryRate,
      openRate,
      clickRate,
      replyRate,
      bounceRate,
    );

    const engagementScore = (openRate * 0.4 + clickRate * 0.4 + replyRate * 0.2) / 100;
    const spamScore = Math.max(0, 100 - overallScore) / 100;

    return {
      deliveryRate,
      openRate,
      clickRate,
      replyRate,
      bounceRate,
      overallScore,
      engagementScore,
      spamScore,
    };
  }

  private calculateCampaignScore(...rates: number[]): number {
    const weights = [0.25, 0.3, 0.2, 0.15, -0.1]; // Negative weight for bounce rate
    return rates.reduce((score, rate, index) => score + (rate * weights[index]), 0);
  }

  // -------------------------------
  // CLEANUP
  // -------------------------------
  async cleanup(): Promise<void> {
    // Close all transporters
    for (const [key, transporter] of this.transportCache.entries()) {
      try {
        transporter.close();
      } catch (error) {
        this.logger.error(`Failed to close transporter ${key}: ${error.message}`);
      }
    }
    this.transportCache.clear();
    this.dailyStats.clear();
  }
}