import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Subscription, SubscriptionDocument } from '../schemas/subscription.schema';
import { User, UserDocument } from '../schemas/user.schema';

@Injectable()
export class SubscriptionService {
  constructor(
    @InjectModel(Subscription.name)
    private subscriptionModel: Model<SubscriptionDocument>,
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
  ) {}

  async getAvailablePlans() {
    return [
      {
        id: 'free',
        name: 'Free',
        price: 0,
        currency: 'USD',
        interval: 'month',
        features: [
          '100 emails/day',
          '3 collections',
          '5 templates',
          '2 campaigns',
          '1 SMTP config',
          'Basic support',
        ],
        limits: {
          dailyEmails: 100,
          totalCollections: 3,
          emailTemplates: 5,
          campaigns: 2,
          smtpConfigs: 1,
          maxEmailsPerCollection: 1000,
        },
      },
      {
        id: 'basic',
        name: 'Basic',
        price: 29,
        currency: 'USD',
        interval: 'month',
        features: [
          '500 emails/day',
          '10 collections',
          '20 templates',
          '5 campaigns',
          '3 SMTP configs',
          'Priority support',
          'Email verification',
        ],
        limits: {
          dailyEmails: 500,
          totalCollections: 10,
          emailTemplates: 20,
          campaigns: 5,
          smtpConfigs: 3,
          maxEmailsPerCollection: 5000,
        },
      },
      {
        id: 'pro',
        name: 'Professional',
        price: 79,
        currency: 'USD',
        interval: 'month',
        features: [
          '2000 emails/day',
          '30 collections',
          '50 templates',
          '20 campaigns',
          '5 SMTP configs',
          'Priority support',
          'Email verification',
          'Advanced analytics',
          'API access',
        ],
        limits: {
          dailyEmails: 2000,
          totalCollections: 30,
          emailTemplates: 50,
          campaigns: 20,
          smtpConfigs: 5,
          maxEmailsPerCollection: 10000,
        },
      },
      {
        id: 'enterprise',
        name: 'Enterprise',
        price: 299,
        currency: 'USD',
        interval: 'month',
        features: [
          '10000 emails/day',
          '100 collections',
          '100 templates',
          '50 campaigns',
          '10 SMTP configs',
          '24/7 support',
          'Email verification',
          'Advanced analytics',
          'API access',
          'Custom integrations',
        ],
        limits: {
          dailyEmails: 10000,
          totalCollections: 100,
          emailTemplates: 100,
          campaigns: 50,
          smtpConfigs: 10,
          maxEmailsPerCollection: 50000,
        },
      },
      {
        id: 'white-label',
        name: 'White Label',
        price: 999,
        currency: 'USD',
        interval: 'month',
        features: [
          '50000 emails/day',
          '500 collections',
          '500 templates',
          '200 campaigns',
          '50 SMTP configs',
          '24/7 support',
          'White label branding',
          'Custom domain',
          'Reseller dashboard',
          'Priority development',
        ],
        limits: {
          dailyEmails: 50000,
          totalCollections: 500,
          emailTemplates: 500,
          campaigns: 200,
          smtpConfigs: 50,
          maxEmailsPerCollection: 100000,
        },
      },
    ];
  }

  async getUserSubscription(userId: string): Promise<any> {
    let subscription = await this.subscriptionModel.findOne({ userId });
    
    if (!subscription) {
      // Create default free subscription
      subscription = await this.createDefaultSubscription(userId);
    }

    const plans = await this.getAvailablePlans();
    const planDetails = subscription ? (plans.find(p => p.id === subscription.plan) || plans[0]) : plans[0];
    
    return subscription
      ? {
          ...subscription.toObject(),
          planDetails,
        }
      : { planDetails };
  }

  async getUsageStats(userId: string): Promise<any> {
    const subscription = await this.getUserSubscription(userId);
    const plans = await this.getAvailablePlans();
    const planDetails = plans.find(p => p.id === subscription.plan) || plans[0];

    // In a real app, you'd calculate actual usage from other collections
    return {
      dailyEmails: {
        used: subscription.usage?.dailyEmails?.used || 0,
        limit: planDetails.limits.dailyEmails,
        remaining: planDetails.limits.dailyEmails - (subscription.usage?.dailyEmails?.used || 0),
      },
      collections: {
        used: subscription.usage?.collections?.used || 0,
        limit: planDetails.limits.totalCollections,
        remaining: planDetails.limits.totalCollections - (subscription.usage?.collections?.used || 0),
      },
      templates: {
        used: subscription.usage?.templates?.used || 0,
        limit: planDetails.limits.emailTemplates,
        remaining: planDetails.limits.emailTemplates - (subscription.usage?.templates?.used || 0),
      },
      campaigns: {
        used: subscription.usage?.campaigns?.used || 0,
        limit: planDetails.limits.campaigns,
        remaining: planDetails.limits.campaigns - (subscription.usage?.campaigns?.used || 0),
      },
      smtpConfigs: {
        used: subscription.usage?.smtpConfigs?.used || 0,
        limit: planDetails.limits.smtpConfigs,
        remaining: planDetails.limits.smtpConfigs - (subscription.usage?.smtpConfigs?.used || 0),
      },
    };
  }

  async upgradePlan(userId: string, planId: string, paymentMethodId?: string): Promise<any> {
    const subscription = await this.subscriptionModel.findOne({ userId });
    const plans = await this.getAvailablePlans();
    const newPlan = plans.find(p => p.id === planId);
    
    if (!newPlan) {
      throw new NotFoundException('Plan not found');
    }

    const updateData: any = {
      plan: planId,
      status: 'active',
      amount: newPlan.price,
      currency: newPlan.currency,
      interval: newPlan.interval,
      limits: newPlan.limits,
      updatedAt: new Date(),
    };

    if (paymentMethodId) {
      updateData.paymentMethodId = paymentMethodId;
    }

    if (subscription) {
      await this.subscriptionModel.updateOne({ userId }, updateData);
    } else {
      const newSubscription = new this.subscriptionModel({
        userId,
        ...updateData,
        trialEndsAt: null,
        expiresAt: null, // Will be set based on payment
      });
      await newSubscription.save();
    }

    // Update user role if upgrading to white-label
    if (planId === 'white-label') {
      await this.userModel.updateOne(
        { _id: userId },
        { role: 'admin' } // White-label users get admin access
      );
    }

    return { success: true, message: 'Subscription upgraded successfully' };
  }

  async cancelSubscription(userId: string, reason?: string): Promise<any> {
    await this.subscriptionModel.updateOne(
      { userId },
      {
        status: 'cancelled',
        autoRenew: false,
        cancellationReason: reason,
        cancelledAt: new Date(),
        updatedAt: new Date(),
      },
    );

    return { success: true, message: 'Subscription cancelled successfully' };
  }

  async updateBillingInfo(userId: string, billingInfo: any): Promise<any> {
    await this.subscriptionModel.updateOne(
      { userId },
      {
        billingInfo,
        updatedAt: new Date(),
      },
    );

    return { success: true, message: 'Billing information updated' };
  }

  async updatePaymentMethod(userId: string, paymentData: any): Promise<any> {
    await this.subscriptionModel.updateOne(
      { userId },
      {
        paymentMethodId: paymentData.paymentMethodId,
        updatedAt: new Date(),
      },
    );

    return { success: true, message: 'Payment method updated' };
  }

  async getInvoiceHistory(userId: string): Promise<any[]> {
    // In a real app, you'd fetch from payment provider
    return [
      {
        id: 'inv_001',
        date: new Date('2024-01-01'),
        amount: 29.99,
        currency: 'USD',
        status: 'paid',
        downloadUrl: '#',
      },
    ];
  }

  async getInvoice(userId: string, invoiceId: string): Promise<any> {
    const invoices = await this.getInvoiceHistory(userId);
    return invoices.find(inv => inv.id === invoiceId) || null;
  }

  async incrementUsage(userId: string, type: string, amount = 1): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await this.subscriptionModel.updateOne(
      { userId },
      {
        $inc: {
          [`usage.${type}.used`]: amount,
        },
        [`usage.${type}.date`]: today,
      },
      { upsert: true },
    );
  }

  private async createDefaultSubscription(userId: string): Promise<any> {
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 14); // 14-day trial

    const subscription = new this.subscriptionModel({
      userId,
      plan: 'free',
      status: 'trial',
      trialEndsAt,
      limits: {
        dailyEmails: 100,
        totalCollections: 3,
        emailTemplates: 5,
        campaigns: 2,
        smtpConfigs: 1,
        maxEmailsPerCollection: 1000,
      },
      usage: {
        dailyEmails: { used: 0, date: new Date() },
        collections: { used: 0 },
        templates: { used: 0 },
        campaigns: { used: 0 },
        smtpConfigs: { used: 0 },
      },
      amount: 0,
      currency: 'USD',
      interval: 'month',
      autoRenew: true,
    });

    return subscription.save();
  }
}