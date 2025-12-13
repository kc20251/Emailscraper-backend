import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SubscriptionPlan =
  | 'free'
  | 'basic'
  | 'pro'
  | 'enterprise'
  | 'white-label';

export type SubscriptionStatus =
  | 'active'
  | 'inactive'
  | 'trial'
  | 'cancelled'
  | 'expired';

@Schema({ timestamps: true })
export class Subscription {
  @Prop({ required: true })
   userId: Types.ObjectId;

  @Prop({
    type: String,
    enum: ['free', 'basic', 'pro', 'enterprise', 'white-label'],
    default: 'free',
  })
  plan: SubscriptionPlan;

  @Prop({
    type: String,
    enum: ['active', 'inactive', 'trial', 'cancelled', 'expired'],
    default: 'trial',
  })
  status: SubscriptionStatus;

  @Prop() trialEndsAt: Date;
  @Prop() expiresAt: Date;
  @Prop() paymentMethodId: string;
  @Prop() lastPaymentDate: Date;
  @Prop() nextPaymentDate: Date;

  @Prop({ type: Object })
  limits: {
    dailyEmails: number;
    totalCollections: number;
    emailTemplates: number;
    campaigns: number;
    smtpConfigs: number;
    maxEmailsPerCollection: number;
  };

  @Prop({ type: Object })
  usage: {
    dailyEmails: { used: number; date: Date };
    collections: { used: number };
    templates: { used: number };
    campaigns: { used: number };
    smtpConfigs: { used: number };
  };

  @Prop({ type: Object })
  billingInfo: {
    name: string;
    email: string;
    company: string;
    address: string;
    country: string;
  };

  @Prop({ default: 0 }) amount: number;
  @Prop({ default: 'USD' }) currency: string;
  @Prop({ default: 'month' }) interval: string;
  @Prop({ default: true }) autoRenew: boolean;
  @Prop() cancellationReason: string;
  @Prop() cancelledAt: Date;
}

// ✅ Correct NestJS pattern: plain class + type alias
export type SubscriptionDocument = Subscription & Document;
export const SubscriptionSchema = SchemaFactory.createForClass(Subscription);

// Indexes
SubscriptionSchema.index({ userId: 1 });
SubscriptionSchema.index({ status: 1 });
SubscriptionSchema.index({ expiresAt: 1 });