import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

// Import the actual schemas and document types
import { User, UserDocument } from '../schemas/user.schema';
import { Campaign, CampaignDocument } from '../schemas/campaign.schema';
import { EmailCollection, EmailCollectionDocument } from '../schemas/email-collection.schema';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Campaign.name) private campaignModel: Model<CampaignDocument>,
    @InjectModel(EmailCollection.name) private collectionModel: Model<EmailCollectionDocument>,
  ) {}

  async getUsers({ page, limit, search, role }: { 
    page: number; 
    limit: number; 
    search?: string; 
    role?: string;
  }) {
    const query: any = {};

    if (search) {
      query.$or = [
        { email: { $regex: search, $options: 'i' } },
        { username: { $regex: search, $options: 'i' } },
        { company: { $regex: search, $options: 'i' } },
      ];
    }

    if (role) {
      query.role = role;
    }

    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      this.userModel
        .find(query)
        .select('-password -verificationToken -resetPasswordToken')
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .lean(),
      this.userModel.countDocuments(query),
    ]);

    return {
      users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getUser(userId: string) {
    const user = await this.userModel
      .findById(userId)
      .select('-password -verificationToken -resetPasswordToken')
      .lean();

    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    // Get user's campaigns and collections stats
    const [campaigns, collections] = await Promise.all([
      this.campaignModel.countDocuments({ userId: new Types.ObjectId(userId) }),
      this.collectionModel.countDocuments({ userId: new Types.ObjectId(userId) }),
    ]);

    return {
      ...user,
      stats: {
        campaigns,
        collections,
      },
    };
  }

  async updateUserRole(userId: string, role: string, adminId: string) {
    if (userId === adminId) {
      throw new HttpException('Cannot change your own role', HttpStatus.BAD_REQUEST);
    }

    const validRoles = ['user', 'admin', 'super-admin'];
    if (!validRoles.includes(role)) {
      throw new HttpException('Invalid role', HttpStatus.BAD_REQUEST);
    }

    const user = await this.userModel.findByIdAndUpdate(
      userId,
      { role },
      { new: true },
    ).select('-password');

    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    this.logger.log(`Admin ${adminId} changed user ${userId} role to ${role}`);

    return user;
  }

  async updateUserSubscription(userId: string, updateData: any) {
    const user = await this.userModel.findById(userId);
    
    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    // Update subscription
    if (user.subscription) {
      user.subscription = {
        ...user.subscription,
        ...updateData,
      };
    } else {
      user.subscription = updateData;
    }

    await user.save();

    return {
      message: 'Subscription updated successfully',
      subscription: user.subscription,
    };
  }

  async deleteUser(userId: string, adminId: string) {
    if (userId === adminId) {
      throw new HttpException('Cannot delete your own account', HttpStatus.BAD_REQUEST);
    }

    const user = await this.userModel.findById(userId);
    
    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    // Soft delete - mark as inactive
    user.isActive = false;
    await user.save();

    this.logger.log(`Admin ${adminId} deactivated user ${userId}`);

    return { message: 'User deactivated successfully' };
  }

  async getAnalytics(period: string) {
    const now = new Date();
    let startDate = new Date();

    switch (period) {
      case '7d':
        startDate.setDate(now.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(now.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(now.getDate() - 90);
        break;
      default:
        startDate.setDate(now.getDate() - 30);
    }

    // Fixed aggregation pipeline
    const timeline = await this.userModel.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
          },
          users: { $sum: 1 }
        }
      },
      {
        $sort: { "_id": 1 as const }
      }
    ]);

    const analytics = {
      users: {
        total: await this.userModel.countDocuments(),
        active: await this.userModel.countDocuments({ isActive: true }),
        new: await this.userModel.countDocuments({ createdAt: { $gte: startDate } }),
        byPlan: await this.userModel.aggregate([
          { $group: { _id: '$subscription.plan', count: { $sum: 1 } } }
        ]),
      },
      campaigns: {
        total: await this.campaignModel.countDocuments(),
        active: await this.campaignModel.countDocuments({ status: 'running' }),
        completed: await this.campaignModel.countDocuments({ status: 'completed' }),
        emailsSent: await this.campaignModel.aggregate([
          { $group: { _id: null, total: { $sum: '$emailsSent' } } }
        ]),
      },
      collections: {
        total: await this.collectionModel.countDocuments(),
        emails: await this.collectionModel.aggregate([
          { $group: { _id: null, total: { $sum: '$totalEmails' } } }
        ]),
      },
      timeline,
    };

    return analytics;
  }

  async getStats() {
    const [
      totalUsers,
      totalCampaigns,
      totalCollections,
      totalEmailsSentAgg,
      activeCampaigns,
    ] = await Promise.all([
      this.userModel.countDocuments(),
      this.campaignModel.countDocuments(),
      this.collectionModel.countDocuments(),
      this.campaignModel.aggregate([
        { $group: { _id: null, total: { $sum: '$emailsSent' } } }
      ]),
      this.campaignModel.countDocuments({ status: 'running' }),
    ]);

    const totalEmailsSent = totalEmailsSentAgg[0]?.total || 0;

    return {
      totalUsers,
      totalCampaigns,
      totalCollections,
      totalEmailsSent,
      activeCampaigns,
      storageUsed: await this.calculateStorageUsed(),
    };
  }

  async enableWhitelabel(userId: string, whitelabelData: any) {
    const user = await this.userModel.findById(userId);
    
    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    user.whitelabel = {
      enabled: true,
      ...whitelabelData,
    };

    // Update user role to white-label reseller
    user.role = 'admin';
    
    await user.save();

    this.logger.log(`White-label enabled for user ${userId}`);

    return {
      message: 'White-label enabled successfully',
      whitelabel: user.whitelabel,
    };
  }

  async disableWhitelabel(userId: string) {
    const user = await this.userModel.findById(userId);
    
    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    user.whitelabel = { enabled: false };
    await user.save();

    this.logger.log(`White-label disabled for user ${userId}`);

    return { message: 'White-label disabled successfully' };
  }

  async getSystemHealth() {
    // Check database connection
    const dbStatus = await this.checkDatabaseConnection();
    
    // Check external APIs (mock for now)
    const externalApis = {
      googleSearch: await this.checkGoogleApi(),
      emailService: await this.checkEmailService(),
      paymentGateway: await this.checkPaymentGateway(),
    };

    return {
      status: dbStatus ? 'healthy' : 'unhealthy',
      timestamp: new Date(),
      database: dbStatus,
      externalApis,
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime(),
    };
  }

  private async calculateStorageUsed(): Promise<number> {
    // Calculate approximate storage used
    const [usersSize, campaignsSize, collectionsSize] = await Promise.all([
      this.userModel.countDocuments().then(count => count * 1024), // ~1KB per user
      this.campaignModel.countDocuments().then(count => count * 5120), // ~5KB per campaign
      this.collectionModel.countDocuments().then(count => count * 2048), // ~2KB per collection
    ]);

    return usersSize + campaignsSize + collectionsSize;
  }

  private async checkDatabaseConnection(): Promise<boolean> {
    try {
      await this.userModel.findOne();
      return true;
    } catch (error) {
      this.logger.error('Database connection check failed:', error);
      return false;
    }
  }

  private async checkGoogleApi(): Promise<{ status: string; latency?: number }> {
    try {
      const start = Date.now();
      // Mock API check - replace with actual Google API check
      await new Promise(resolve => setTimeout(resolve, 100));
      const latency = Date.now() - start;
      return { status: 'connected', latency };
    } catch (error) {
      return { status: 'disconnected' };
    }
  }

  private async checkEmailService(): Promise<{ status: string }> {
    // Mock check
    return { status: 'connected' };
  }

  private async checkPaymentGateway(): Promise<{ status: string }> {
    // Mock check
    return { status: 'connected' };
  }
}