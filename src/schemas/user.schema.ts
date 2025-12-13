import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserRole = 'user' | 'admin' | 'super-admin';
export type SubscriptionPlan = 'free' | 'basic' | 'pro' | 'enterprise' | 'white-label';
export type SubscriptionStatus = 'active' | 'inactive' | 'trial' | 'cancelled';

@Schema({ timestamps: true })
export class User extends Document {
  @Prop({ required: true })
  email: string;

  @Prop({ required: true })
  password: string;

  @Prop({ required: true})
  username: string;

  @Prop()
  company?: string;

  @Prop({ default: 'user' })
  role: UserRole;

  @Prop({
    type: {
      plan: { type: String, default: 'free' },
      status: { type: String, default: 'trial' },
      expiresAt: Date,
      limits: {
        dailyEmails: { type: Number, default: 100 },
        totalCollections: { type: Number, default: 3 },
        emailTemplates: { type: Number, default: 5 },
        campaigns: { type: Number, default: 2 },
        smtpConfigs: { type: Number, default: 1 },
      },
      paymentMethodId: String,
      stripeCustomerId: String,
      lastPaymentDate: Date,
      nextPaymentDate: Date,
    },
    default: {}
  })
  subscription: {
    plan: SubscriptionPlan;
    status: SubscriptionStatus;
    expiresAt?: Date;
    limits: {
      dailyEmails: number;
      totalCollections: number;
      emailTemplates: number;
      campaigns: number;
      smtpConfigs: number;
    };
    paymentMethodId?: string;
    stripeCustomerId?: string;
    lastPaymentDate?: Date;
    nextPaymentDate?: Date;
  };

  @Prop({
    type: {
      enabled: { type: Boolean, default: false },
      brandName: String,
      logoUrl: String,
      domain: String,
      customColors: {
        primary: String,
        secondary: String,
      },
    },
    default: {}
  })
  whitelabel: {
    enabled: boolean;
    brandName?: string;
    logoUrl?: string;
    domain?: string;
    customColors?: {
      primary: string;
      secondary: string;
    };
  };

  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  lastLogin: Date;

  @Prop({ default: false })
  emailVerified: boolean;

  @Prop()
  verificationToken?: string;

  @Prop()
  resetPasswordToken?: string;

  @Prop()
  resetPasswordExpires?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

// Add indexes
UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ username: 1 }, { unique: true });
UserSchema.index({ role: 1 });
UserSchema.index({ 'subscription.status': 1 });
UserSchema.index({ 'subscription.expiresAt': 1 });

// Export Document type
export type UserDocument = User & Document;