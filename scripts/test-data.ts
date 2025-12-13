import { connect, disconnect } from 'mongoose';
import * as bcrypt from 'bcrypt';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Mock data
const testUsers = [
  {
    email: 'admin@emailscraper.com',
    username: 'superadmin',
    password: 'admin123',
    role: 'super-admin',
    subscription: {
      plan: 'enterprise',
      status: 'active',
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
      limits: {
        dailyEmails: 10000,
        totalCollections: 100,
        emailTemplates: 100,
        campaigns: 50,
        smtpConfigs: 10,
      },
    },
    whitelabel: {
      enabled: true,
      brandName: 'EmailScraper Pro',
      customColors: {
        primary: '#3B82F6',
        secondary: '#8B5CF6',
      },
    },
  },
  {
    email: 'test@example.com',
    username: 'testuser',
    password: 'password123',
    role: 'user',
    subscription: {
      plan: 'pro',
      status: 'active',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      limits: {
        dailyEmails: 1000,
        totalCollections: 20,
        emailTemplates: 20,
        campaigns: 10,
        smtpConfigs: 3,
      },
    },
    whitelabel: {
      enabled: false,
    },
  },
];

const testSMTPConfigs = [
  {
    name: 'Test Gmail SMTP',
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    username: 'test@example.com',
    password: 'testpassword123',
    fromEmail: 'test@example.com',
    fromName: 'Test Sender',
    dailyLimit: 500,
    isActive: true,
    hourlyRateLimit: 100,
    provider: 'gmail',
  },
  {
    name: 'Admin SMTP',
    host: 'smtp.mailgun.org',
    port: 587,
    secure: false,
    username: 'admin@emailscraper.com',
    password: 'adminpassword123',
    fromEmail: 'admin@emailscraper.com',
    fromName: 'EmailScraper Admin',
    dailyLimit: 1000,
    isActive: true,
    hourlyRateLimit: 200,
    provider: 'mailgun',
  },
];

const testCollections = [
  {
    name: 'Tech Companies',
    description: 'Technology companies from Silicon Valley',
    emailCount: 45,
    verifiedCount: 40,
  },
  {
    name: 'Marketing Agencies',
    description: 'Digital marketing agencies worldwide',
    emailCount: 32,
    verifiedCount: 28,
  },
];

const testTemplates = [
  {
    name: 'Welcome Email',
    subject: 'Welcome to Our Community, {{name}}!',
    body: `
Hi {{name}},

Welcome to our community! We're excited to have you on board.

Best regards,
{{company}}
    `,
    variables: ['name', 'company'],
  },
  {
    name: 'Follow-up Email',
    subject: 'Following up on our conversation',
    body: `
Hi {{name}},

Just wanted to follow up on our previous conversation about {{company}}.

Looking forward to hearing from you!

Best regards,
Your Team
    `,
    variables: ['name', 'company'],
  },
];

const testCampaigns = [
  {
    name: 'Welcome Campaign',
    status: 'completed',
    emailsSent: 250,
    totalEmails: 250,
  },
  {
    name: 'Product Launch',
    status: 'running',
    emailsSent: 125,
    totalEmails: 500,
  },
];

async function createTestData() {
  try {
    // Connect to MongoDB
    console.log('🔗 Connecting to MongoDB...');
    await connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/email-scraper');
    console.log('✅ Connected to MongoDB');

    // We need to use the actual Mongoose models from the compiled code
    // First, let's register the schemas
    const mongoose = require('mongoose');
    const { UserSchema } = require('../src/schemas/user.schema');
    const { EmailCollectionSchema } = require('../src/schemas/email-collection.schema');
    const { EmailTemplateSchema } = require('../src/schemas/email-template.schema');
    const { CampaignSchema } = require('../src/schemas/campaign.schema');
    const { SMTPConfigSchema } = require('../src/schemas/smtp-config.schema');

    // Create models
    const User = mongoose.model('User', UserSchema) || mongoose.models.User;
    const EmailCollection = mongoose.model('EmailCollection', EmailCollectionSchema) || mongoose.models.EmailCollection;
    const EmailTemplate = mongoose.model('EmailTemplate', EmailTemplateSchema) || mongoose.models.EmailTemplate;
    const Campaign = mongoose.model('Campaign', CampaignSchema) || mongoose.models.Campaign;
    const SMTPConfig = mongoose.model('SMTPConfig', SMTPConfigSchema) || mongoose.models.SMTPConfig;

    // Clear existing data
    console.log('🧹 Clearing existing data...');
    await User.deleteMany({});
    await EmailCollection.deleteMany({});
    await EmailTemplate.deleteMany({});
    await Campaign.deleteMany({});
    await SMTPConfig.deleteMany({});
    console.log('✅ Cleared existing data');

    console.log('👤 Creating test users...');
    
    // Create users
    const createdUsers: Array<typeof User.prototype> = [];
    for (const userData of testUsers) {
      const hashedPassword = await bcrypt.hash(userData.password, 10);
      const user = new User({
        ...userData,
        password: hashedPassword,
        emailVerified: true,
        isActive: true,
      });
      await user.save();
      createdUsers.push(user);
      console.log(`✅ Created user: ${user.email}`);
    }

    // Get admin and test user
    const adminUser = createdUsers.find(u => u.email === 'admin@emailscraper.com');
    const testUser = createdUsers.find(u => u.email === 'test@example.com');

    console.log('📧 Creating SMTP configurations...');
    
    // Create SMTP configurations
    const createdSMTPConfigs: Array<typeof SMTPConfig.prototype> = [];
    for (const smtpData of testSMTPConfigs) {
      const smtpConfig = new SMTPConfig({
        ...smtpData,
        userId: smtpData.username.includes('admin') ? adminUser._id : testUser._id,
        emailsSentToday: 0,
        totalEmailsSent: 0,
        emailsFailed: 0,
        successRate: 100,
        bounceRate: 0,
        dnsRecords: {
          spf: true,
          dkim: true,
          dmarc: true,
          mx: true,
        },
        lastTestedAt: new Date(),
        lastResetDate: new Date(),
      });
      await smtpConfig.save();
      createdSMTPConfigs.push(smtpConfig);
      console.log(`✅ Created SMTP config: ${smtpConfig.name} for ${smtpConfig.userId === adminUser._id ? 'admin' : 'test user'}`);
    }

    console.log('📁 Creating test collections...');
    
    // Create collections for test user
    for (const collectionData of testCollections) {
      const emails = Array.from({ length: collectionData.emailCount }, (_, i) => ({
        email: `contact${i}@company${i}.com`,
        source: 'test',
        status: i < collectionData.verifiedCount ? 'verified' : 'pending',
        metadata: {
          name: `John Doe ${i}`,
          company: `Company ${i}`,
          industry: 'Technology',
        },
        scrapedAt: new Date(),
      }));

      const collection = new EmailCollection({
        name: collectionData.name,
        description: collectionData.description,
        userId: testUser._id,
        emails: emails,
        totalEmails: collectionData.emailCount,
        verifiedEmails: collectionData.verifiedCount,
        invalidEmails: 0,
        searchParams: {
          query: collectionData.name,
          numResults: collectionData.emailCount,
        },
        isActive: true,
      });
      await collection.save();
      console.log(`✅ Created collection: ${collection.name} with ${collection.totalEmails} emails`);
    }

    console.log('📝 Creating test templates...');
    
    // Create templates for both users
    for (const user of [adminUser, testUser]) {
      for (const templateData of testTemplates) {
        const template = new EmailTemplate({
          ...templateData,
          userId: user._id,
          type: 'html',
          isActive: true,
          status: 'published',
          trackOpens: true,
          trackClicks: true,
        });
        await template.save();
        console.log(`✅ Created template for ${user.email}: ${template.name}`);
      }
    }

    console.log('🎯 Creating test campaigns...');
    
    // Get a template and SMTP config for test user
    const userTemplate = await EmailTemplate.findOne({ userId: testUser._id });
    const userSMTPConfig = createdSMTPConfigs.find(config => config.userId.equals(testUser._id));
    
    if (!userSMTPConfig) {
      throw new Error('No SMTP config found for test user');
    }
    
    // Create campaigns for test user
    for (const campaignData of testCampaigns) {
      const emails = Array.from({ length: campaignData.totalEmails }, (_, i) => ({
        email: `recipient${i}@example.com`,
        name: `Recipient ${i}`,
        variables: {
          name: `Recipient ${i}`,
          company: `Company ${i}`,
        },
        status: i < campaignData.emailsSent ? 'sent' : 'pending',
        sentAt: i < campaignData.emailsSent ? new Date() : undefined,
      }));

      const campaign = new Campaign({
        name: campaignData.name,
        userId: testUser._id,
        templateId: userTemplate._id,
        smtpConfigId: userSMTPConfig._id, // Now we have an SMTP config
        emails: emails,
        status: campaignData.status,
        totalEmails: campaignData.totalEmails,
        emailsSent: campaignData.emailsSent,
        emailsDelivered: Math.floor(campaignData.emailsSent * 0.85), // 85% delivery rate
        emailsOpened: Math.floor(campaignData.emailsSent * 0.60), // 60% open rate
        emailsClicked: Math.floor(campaignData.emailsSent * 0.20), // 20% click rate
        emailsReplied: Math.floor(campaignData.emailsSent * 0.05), // 5% reply rate
        emailsBounced: Math.floor(campaignData.emailsSent * 0.05), // 5% bounce rate
        emailsFailed: Math.floor(campaignData.emailsSent * 0.10), // 10% failed
        isTrackingEnabled: true,
        settings: {
          delayBetweenEmails: 5000,
          maxEmailsPerHour: 100,
          timezone: 'UTC',
        },
      });
      await campaign.save();
      console.log(`✅ Created campaign: ${campaign.name}`);
    }

    console.log('\n🎉 Test data created successfully!');
    console.log('\n🔑 Login Credentials:');
    console.log('Super Admin: admin@emailscraper.com / admin123');
    console.log('Test User: test@example.com / password123');
    console.log('\n📊 Stats Created:');
    console.log('👥 Users: 2');
    console.log('📧 SMTP Configs: 2');
    console.log('📁 Collections: 2');
    console.log('📝 Templates: 4');
    console.log('🎯 Campaigns: 2');
    
    await disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
    
  } catch (error) {
    console.error('❌ Error creating test data:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  createTestData().catch(console.error);
}

export { createTestData };