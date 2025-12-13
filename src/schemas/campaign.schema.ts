import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, Schema as MongooseSchema } from 'mongoose';

// Define CampaignEmail as a Mongoose schema
@Schema({ _id: false })
export class CampaignEmail {
  @Prop({ required: true })
  email: string;

  @Prop({ default: '' })
  name: string;

  @Prop({ type: Object, default: {} })
  variables: Record<string, string>;

  @Prop({ 
    enum: ['pending', 'sent', 'delivered', 'opened', 'clicked', 'replied', 'bounced', 'failed'],
    default: 'pending'
  })
  status: string;

  @Prop()
  messageId?: string;

  @Prop()
  sentAt?: Date;

  @Prop()
  deliveredAt?: Date;

  @Prop()
  openedAt?: Date;

  @Prop()
  clickedAt?: Date;

  @Prop()
  bouncedAt?: Date;

  @Prop()
  failedAt?: Date;

  @Prop()
  bounceReason?: string;

  @Prop()
  error?: string;

  @Prop({ default: 0 })
  openCount: number;

  @Prop({ default: 0 })
  clickCount: number;
}

// Create the schema for CampaignEmail
export const CampaignEmailSchema = SchemaFactory.createForClass(CampaignEmail);

@Schema({ timestamps: true })
export class Campaign extends Document {
  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  userId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop()
  description?: string;

  @Prop({ type: Types.ObjectId, ref: 'SMTPConfig', required: true })
  smtpConfigId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'EmailTemplate' })
  templateId?: Types.ObjectId;

  // ✅ Use the SchemaFactory created schema for the array
  @Prop({ type: [CampaignEmailSchema], default: [] })
  emails: CampaignEmail[];

  @Prop({ 
    enum: ['draft', 'scheduled', 'running', 'paused', 'completed', 'failed'],
    default: 'draft'
  })
  status: string;

  @Prop()
  scheduledFor?: Date;

  @Prop()
  startedAt?: Date;

  @Prop()
  completedAt?: Date;

  @Prop({ default: 0 })
  totalEmails: number;

  @Prop({ default: 0 })
  emailsSent: number;

  @Prop({ default: 0 })
  emailsDelivered: number;

  @Prop({ default: 0 })
  emailsOpened: number;

  @Prop({ default: 0 })
  emailsClicked: number;

  @Prop({ default: 0 })
  emailsReplied: number;

  @Prop({ default: 0 })
  emailsBounced: number;

  @Prop({ default: 0 })
  emailsFailed: number;

  @Prop({ default: 0 })
  hourlyRate: number;

  @Prop({ default: false })
  isTrackingEnabled: boolean;

  @Prop({ type: Object })
  settings?: {
    delayBetweenEmails?: number;
    maxEmailsPerHour?: number;
    timezone?: string;
  };

  @Prop()
  lastEmailSentAt?: Date;
}

export const CampaignSchema = SchemaFactory.createForClass(Campaign);

// Add indexes
CampaignSchema.index({ userId: 1, status: 1 });
CampaignSchema.index({ userId: 1, createdAt: -1 });
CampaignSchema.index({ smtpConfigId: 1 });
CampaignSchema.index({ status: 1, scheduledFor: 1 });

// Export Document type
export type CampaignDocument = Campaign & Document;