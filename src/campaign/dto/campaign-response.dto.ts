import { Types } from 'mongoose';

export class CampaignResponseDto {
  id: string;
  userId: string;
  name: string;
  description?: string;
  smtpConfigId: string;
  templateId?: string;
  emails: Array<{
    email: string;
    name: string;
    variables: Record<string, string>;
    status: string;
    messageId?: string;
    sentAt?: Date;
    deliveredAt?: Date;
    openedAt?: Date;
    clickedAt?: Date;
    bouncedAt?: Date;
    failedAt?: Date;
    bounceReason?: string;
    error?: string;
    openCount: number;
    clickCount: number;
  }>;
  status: string;
  scheduledFor?: Date;
  startedAt?: Date;
  completedAt?: Date;
  totalEmails: number;
  emailsSent: number;
  emailsDelivered: number;
  emailsOpened: number;
  emailsClicked: number;
  emailsReplied: number;
  emailsBounced: number;
  emailsFailed: number;
  hourlyRate: number;
  isTrackingEnabled: boolean;
  settings?: {
    delayBetweenEmails?: number;
    maxEmailsPerHour?: number;
    timezone?: string;
  };
  lastEmailSentAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;

  static fromDocument(campaign: any): CampaignResponseDto {
    return {
      id: campaign._id?.toString(),
      userId: campaign.userId?.toString(),
      name: campaign.name,
      description: campaign.description,
      smtpConfigId: campaign.smtpConfigId?.toString(),
      templateId: campaign.templateId?.toString(),
      emails: campaign.emails || [],
      status: campaign.status,
      scheduledFor: campaign.scheduledFor,
      startedAt: campaign.startedAt,
      completedAt: campaign.completedAt,
      totalEmails: campaign.totalEmails,
      emailsSent: campaign.emailsSent,
      emailsDelivered: campaign.emailsDelivered,
      emailsOpened: campaign.emailsOpened,
      emailsClicked: campaign.emailsClicked,
      emailsReplied: campaign.emailsReplied,
      emailsBounced: campaign.emailsBounced,
      emailsFailed: campaign.emailsFailed,
      hourlyRate: campaign.hourlyRate,
      isTrackingEnabled: campaign.isTrackingEnabled,
      settings: campaign.settings,
      lastEmailSentAt: campaign.lastEmailSentAt,
      createdAt: campaign.createdAt,
      updatedAt: campaign.updatedAt,
    };
  }
}