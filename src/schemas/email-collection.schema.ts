import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ _id: false })
export class ScrapedEmail {
  @Prop({ required: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true })
  source: string;

  @Prop()
  context?: string;

  @Prop()
  name?: string;

  @Prop()
  position?: string;

  @Prop({ default: 'pending', enum: ['pending', 'verified', 'invalid'] })
  status: string;

  @Prop({ type: Object })
  metadata?: {
    industry?: string;
    region?: string;
    company?: string;
    website?: string;
    size?: string;
    revenue?: string;
    searchQuery?: string;
    source?: string;
    jobId?: string;
    scrapedAt?: Date;
  };

  @Prop({ default: Date.now })
  scrapedAt: Date;

  @Prop()
  verifiedAt?: Date;

  @Prop()
  lastEngagement?: Date;
}

export const ScrapedEmailSchema = SchemaFactory.createForClass(ScrapedEmail);

@Schema({ timestamps: true })
export class EmailCollection extends Document {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ type: [ScrapedEmailSchema], default: [] })
  emails: ScrapedEmail[];

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  userId: Types.ObjectId;

  @Prop({ type: Object })
  searchParams: {
    query: string;
    industry?: string;
    region?: string;
    numResults?: number;
    language?: string;
  };

  @Prop({ default: 0 })
  totalEmails: number;

  @Prop({ default: 0 })
  verifiedEmails: number;

  @Prop({ default: 0 })
  invalidEmails: number;

  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  lastScrapedAt?: Date;

  @Prop({ default: 0 })
  scrapeCount: number;
}

export const EmailCollectionSchema = SchemaFactory.createForClass(EmailCollection);

// Indexes for better query performance
EmailCollectionSchema.index({ userId: 1, createdAt: -1 });
EmailCollectionSchema.index({ userId: 1, name: 1 }, { unique: true, partialFilterExpression: { isActive: true } });
EmailCollectionSchema.index({ 'emails.email': 1 });
EmailCollectionSchema.index({ 'emails.status': 1 });

// Export Document type
export type EmailCollectionDocument = EmailCollection & Document;