import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class EmailTemplate extends Document {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, trim: true })
  subject: string;

  @Prop({ required: true })
  body: string;

  @Prop({ default: 'html', enum: ['html', 'text'] })
  type: string;

  @Prop({ type: [String], default: [] })
  variables: string[];

  @Prop({ type: Object, default: {} })
  personalization: {
    enabled: boolean;
    fields: string[];
  };

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  userId: Types.ObjectId;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: 0 })
  usageCount: number;

  @Prop({ type: Object, default: {} })
  analytics?: {
    openRate: number;
    clickRate: number;
    replyRate: number;
    conversionRate: number;
  };

  @Prop({ default: true })
  trackOpens: boolean;

  @Prop({ default: true })
  trackClicks: boolean;

  @Prop()
  category?: string;

  @Prop({ default: 'draft', enum: ['draft', 'published', 'archived'] })
  status: string;
}

export const EmailTemplateSchema = SchemaFactory.createForClass(EmailTemplate);

// Indexes
EmailTemplateSchema.index({ userId: 1, createdAt: -1 });
EmailTemplateSchema.index({ userId: 1, name: 1 }, { unique: true });
EmailTemplateSchema.index({ status: 1 });

// Export Document type
export type EmailTemplateDocument = EmailTemplate & Document;