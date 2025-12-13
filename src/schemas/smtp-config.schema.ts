import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class SMTPConfig extends Document {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true })
  host: string;

  @Prop({ required: true })
  port: number;

  @Prop({ required: true })
  secure: boolean;

  @Prop({ required: true })
  username: string;

  @Prop({ required: true })
  password: string;

  @Prop({ required: true, lowercase: true, trim: true })
  fromEmail: string;

  @Prop({ required: true, trim: true })
  fromName: string;

  @Prop({ default: 500 })
  dailyLimit: number;

  @Prop({ default: 0 })
  emailsSentToday: number;

  @Prop({ type: Date })
  lastResetDate: Date;

  @Prop({ default: 0 })
  totalEmailsSent: number;

  @Prop({ default: 0 })
  emailsFailed: number;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: 100 })
  hourlyRateLimit: number;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  userId: Types.ObjectId;

  @Prop({ type: Object })
  dnsRecords?: {
    spf: boolean;
    dkim: boolean;
    dmarc: boolean;
    mx: boolean;
  };

  @Prop({ default: 100 })
  successRate: number;

  @Prop({ default: 0 })
  bounceRate: number;

  @Prop()
  lastTestedAt?: Date;

  @Prop({ default: 'unknown' })
  provider: string;
}

export const SMTPConfigSchema = SchemaFactory.createForClass(SMTPConfig);

// Indexes
SMTPConfigSchema.index({ userId: 1, createdAt: -1 });
SMTPConfigSchema.index({ isActive: 1 });

// Export Document type
export type SMTPConfigDocument = SMTPConfig & Document;