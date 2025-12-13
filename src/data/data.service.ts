import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { EmailCollection, ScrapedEmail } from '../schemas/email-collection.schema';
import { ScrapedEmail as ScrapedEmailInterface } from '../scraping/scraping.service';
import { getIdString } from '../common/utils';

export interface CreateCollectionDto {
  name: string;
  description?: string;
  searchParams: {
    query: string;
    industry?: string;
    region?: string;
    numResults?: number;
  };
}

export interface AddEmailsDto {
  emails: ScrapedEmailInterface[];
  metadata?: {
    industry?: string;
    region?: string;
    company?: string;
    website?: string;
    // Add the extended properties
    searchQuery?: string;
    source?: string;
    jobId?: string;
  };
}

export interface CollectionStats {
  totalEmails: number;
  statusCounts: {
    pending: number;
    verified: number;
    invalid: number;
  };
  industryCounts: Record<string, number>;
  regionCounts: Record<string, number>;
  createdAt: Date; // Make required
  updatedAt: Date; // Make required
}

export interface PaginatedEmails {
  emails: ScrapedEmail[];
  total: number;
  page: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

@Injectable()
export class DataService {
  private readonly logger = new Logger(DataService.name);

  constructor(
    @InjectModel(EmailCollection.name)
    private emailCollectionModel: Model<EmailCollection>,
  ) { }

  /** -------- CREATE COLLECTION -------- */
  async createCollection(userId: string, createDto: CreateCollectionDto): Promise<EmailCollection> {
    try {
      // Check if collection name already exists for this user
      const existingCollection = await this.emailCollectionModel.findOne({
        userId: new Types.ObjectId(userId),
        name: createDto.name,
        isActive: true,
      });

      if (existingCollection) {
        throw new HttpException(
          'A collection with this name already exists',
          HttpStatus.CONFLICT,
        );
      }

      const collection = new this.emailCollectionModel({
        ...createDto,
        userId: new Types.ObjectId(userId),
        totalEmails: 0,
        verifiedEmails: 0,
        isActive: true,
      });

      const savedCollection = await collection.save();

      this.logger.log(`Collection created: ${savedCollection.name} for user ${userId}`);
      return savedCollection;
    } catch (error) {
      this.logger.error(`Failed to create collection: ${error.message}`);
      throw error;
    }
  }

  /** -------- ADD EMAILS TO COLLECTION -------- */
  async addEmailsToCollection(
    collectionId: string,
    userId: string,
    addEmailsDto: AddEmailsDto,
  ): Promise<EmailCollection> {
    try {
      const collection = await this.emailCollectionModel.findOne({
        _id: new Types.ObjectId(collectionId),
        userId: new Types.ObjectId(userId),
        isActive: true,
      });

      if (!collection) {
        throw new HttpException('Collection not found', HttpStatus.NOT_FOUND);
      }

      const existingEmails = new Set(collection.emails.map(e => e.email));
      const newEmails: ScrapedEmail[] = addEmailsDto.emails
        .filter(email => !existingEmails.has(email.email))
        .map(email => ({
          email: email.email.toLowerCase().trim(), // Normalize email
          source: email.source,
          context: email.context,
          scrapedAt: new Date(),
          metadata: addEmailsDto.metadata,
          status: 'pending',
        }));

      if (newEmails.length === 0) {
        this.logger.log(`No new emails to add to collection: ${collection.name}`);
        return collection;
      }

      collection.emails.push(...newEmails);
      collection.totalEmails = collection.emails.length;
      collection.verifiedEmails = collection.emails.filter(e => e.status === 'verified').length;

      const updatedCollection = await collection.save();

      this.logger.log(`Added ${newEmails.length} emails to collection: ${collection.name}`);
      return updatedCollection;
    } catch (error) {
      this.logger.error(`Failed to add emails to collection ${collectionId}: ${error.message}`);
      throw error;
    }
  }

  /** -------- GET COLLECTION BY ID -------- */
  async getCollection(collectionId: string, userId: string): Promise<EmailCollection> {
    try {
      const collection = await this.emailCollectionModel.findOne({
        _id: new Types.ObjectId(collectionId),
        userId: new Types.ObjectId(userId),
        isActive: true,
      });

      if (!collection) {
        throw new HttpException('Collection not found', HttpStatus.NOT_FOUND);
      }

      return collection;
    } catch (error) {
      this.logger.error(`Failed to get collection ${collectionId}: ${error.message}`);
      throw error;
    }
  }

  /** -------- GET ALL USER COLLECTIONS -------- */
  async getUserCollections(userId: string): Promise<EmailCollection[]> {
    try {
      return await this.emailCollectionModel
        .find({
          userId: new Types.ObjectId(userId),
          isActive: true,
        })
        .sort({ createdAt: -1 })
        .exec();
    } catch (error) {
      this.logger.error(`Failed to get collections for user ${userId}: ${error.message}`);
      throw error;
    }
  }

  /** -------- UPDATE COLLECTION -------- */
  async updateCollection(
    collectionId: string,
    userId: string,
    updates: { name?: string; description?: string },
  ): Promise<EmailCollection> {
    try {
      // Check if new name conflicts with existing collections
      if (updates.name) {
        const existingCollection = await this.emailCollectionModel.findOne({
          userId: new Types.ObjectId(userId),
          name: updates.name,
          isActive: true,
          _id: { $ne: new Types.ObjectId(collectionId) },
        });

        if (existingCollection) {
          throw new HttpException(
            'A collection with this name already exists',
            HttpStatus.CONFLICT,
          );
        }
      }

      const collection = await this.emailCollectionModel.findOneAndUpdate(
        {
          _id: new Types.ObjectId(collectionId),
          userId: new Types.ObjectId(userId),
          isActive: true,
        },
        { $set: updates },
        { new: true, runValidators: true },
      );

      if (!collection) {
        throw new HttpException('Collection not found', HttpStatus.NOT_FOUND);
      }

      this.logger.log(`Collection updated: ${collection.name}`);
      return collection;
    } catch (error) {
      this.logger.error(`Failed to update collection ${collectionId}: ${error.message}`);
      throw error;
    }
  }

  /** -------- DELETE COLLECTION (SOFT DELETE) -------- */
  async deleteCollection(collectionId: string, userId: string): Promise<void> {
    try {
      const result = await this.emailCollectionModel.updateOne(
        {
          _id: new Types.ObjectId(collectionId),
          userId: new Types.ObjectId(userId)
        },
        { isActive: false },
      );

      if (result.modifiedCount === 0) {
        throw new HttpException('Collection not found', HttpStatus.NOT_FOUND);
      }

      this.logger.log(`Collection deleted: ${collectionId}`);
    } catch (error) {
      this.logger.error(`Failed to delete collection ${collectionId}: ${error.message}`);
      throw error;
    }
  }

  /** -------- UPDATE EMAIL STATUS -------- */
  async updateEmailStatus(
    collectionId: string,
    userId: string,
    email: string,
    status: 'pending' | 'verified' | 'invalid',
  ): Promise<EmailCollection> {
    try {
      const collection = await this.emailCollectionModel.findOne({
        _id: new Types.ObjectId(collectionId),
        userId: new Types.ObjectId(userId),
      });

      if (!collection) {
        throw new HttpException('Collection not found', HttpStatus.NOT_FOUND);
      }

      const emailToUpdate = collection.emails.find(e => e.email === email);
      if (!emailToUpdate) {
        throw new HttpException('Email not found in collection', HttpStatus.NOT_FOUND);
      }

      emailToUpdate.status = status;
      collection.verifiedEmails = collection.emails.filter(e => e.status === 'verified').length;

      const updatedCollection = await collection.save();

      this.logger.log(`Email status updated: ${email} -> ${status} in collection ${collection.name}`);
      return updatedCollection;
    } catch (error) {
      this.logger.error(`Failed to update email status for ${email}: ${error.message}`);
      throw error;
    }
  }

  /** -------- BULK UPDATE EMAIL STATUSES -------- */
  async bulkUpdateEmailStatuses(
    collectionId: string,
    userId: string,
    updates: Array<{ email: string; status: 'pending' | 'verified' | 'invalid' }>,
  ): Promise<EmailCollection> {
    try {
      const collection = await this.emailCollectionModel.findOne({
        _id: new Types.ObjectId(collectionId),
        userId: new Types.ObjectId(userId),
      });

      if (!collection) {
        throw new HttpException('Collection not found', HttpStatus.NOT_FOUND);
      }

      let updatedCount = 0;
      for (const update of updates) {
        const emailToUpdate = collection.emails.find(e => e.email === update.email);
        if (emailToUpdate && emailToUpdate.status !== update.status) {
          emailToUpdate.status = update.status;
          updatedCount++;
        }
      }

      if (updatedCount > 0) {
        collection.verifiedEmails = collection.emails.filter(e => e.status === 'verified').length;
        const updatedCollection = await collection.save();

        this.logger.log(`Bulk updated ${updatedCount} email statuses in collection ${collection.name}`);
        return updatedCollection;
      }

      return collection;
    } catch (error) {
      this.logger.error(`Failed to bulk update email statuses: ${error.message}`);
      throw error;
    }
  }

  /** -------- SEARCH EMAILS WITH PAGINATION -------- */
  async searchEmails(
    userId: string,
    filters: {
      collectionId?: string;
      status?: string;
      industry?: string;
      region?: string;
      searchTerm?: string;
    },
    page: number = 1,
    limit: number = 50,
  ): Promise<PaginatedEmails> {
    try {
      const query: any = {
        userId: new Types.ObjectId(userId),
        isActive: true
      };

      if (filters.collectionId) {
        query._id = new Types.ObjectId(filters.collectionId);
      }

      const collections = await this.emailCollectionModel.find(query).exec();

      let allEmails: ScrapedEmail[] = [];
      collections.forEach(collection => {
        allEmails.push(...collection.emails);
      });

      // Apply filters
      if (filters.status) {
        allEmails = allEmails.filter(email => email.status === filters.status);
      }

      if (filters.industry) {
        allEmails = allEmails.filter(email =>
          email.metadata?.industry?.toLowerCase().includes(filters.industry!.toLowerCase())
        );
      }

      if (filters.region) {
        allEmails = allEmails.filter(email =>
          email.metadata?.region?.toLowerCase().includes(filters.region!.toLowerCase())
        );
      }

      if (filters.searchTerm) {
        const term = filters.searchTerm.toLowerCase();
        allEmails = allEmails.filter(email =>
          email.email.toLowerCase().includes(term) ||
          email.source.toLowerCase().includes(term) ||
          email.context?.toLowerCase().includes(term) ||
          email.metadata?.company?.toLowerCase().includes(term)
        );
      }

      // Pagination
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedEmails = allEmails.slice(startIndex, endIndex);
      const total = allEmails.length;
      const totalPages = Math.ceil(total / limit);

      return {
        emails: paginatedEmails,
        total,
        page,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      };
    } catch (error) {
      this.logger.error(`Failed to search emails: ${error.message}`);
      throw error;
    }
  }

  /** -------- GET COLLECTION STATISTICS -------- */
  async getCollectionStats(collectionId: string, userId: string): Promise<CollectionStats> {
    try {
      const collection = await this.getCollection(collectionId, userId);

      const statusCounts = {
        pending: 0,
        verified: 0,
        invalid: 0,
      };

      const industryCounts: Record<string, number> = {};
      const regionCounts: Record<string, number> = {};

      collection.emails.forEach(email => {
        statusCounts[email.status] = (statusCounts[email.status] || 0) + 1;

        if (email.metadata?.industry) {
          industryCounts[email.metadata.industry] =
            (industryCounts[email.metadata.industry] || 0) + 1;
        }

        if (email.metadata?.region) {
          regionCounts[email.metadata.region] =
            (regionCounts[email.metadata.region] || 0) + 1;
        }
      });

      // Provide fallback dates if timestamps are undefined
      const createdAt = (collection as any).createdAt || new Date();
      const updatedAt = (collection as any).updatedAt || new Date();

      return {
        totalEmails: collection.totalEmails,
        statusCounts,
        industryCounts,
        regionCounts,
        createdAt,
        updatedAt,
      };
    } catch (error) {
      this.logger.error(`Failed to get collection stats for ${collectionId}: ${error.message}`);
      throw error;
    }
  }

  /** -------- GET EMAILS WITH PAGINATION -------- */
  async getEmailsWithPagination(
    collectionId: string,
    userId: string,
    page: number = 1,
    limit: number = 50,
  ): Promise<PaginatedEmails> {
    try {
      const collection = await this.getCollection(collectionId, userId);

      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;

      const emails = collection.emails.slice(startIndex, endIndex);
      const total = collection.emails.length;
      const totalPages = Math.ceil(total / limit);

      return {
        emails,
        total,
        page,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      };
    } catch (error) {
      this.logger.error(`Failed to get paginated emails for collection ${collectionId}: ${error.message}`);
      throw error;
    }
  }

  /** -------- DELETE EMAILS FROM COLLECTION -------- */
  async deleteEmailsFromCollection(
    collectionId: string,
    userId: string,
    emailsToDelete: string[],
  ): Promise<EmailCollection> {
    try {
      const collection = await this.getCollection(collectionId, userId);

      const initialCount = collection.emails.length;
      collection.emails = collection.emails.filter(
        email => !emailsToDelete.includes(email.email)
      );

      collection.totalEmails = collection.emails.length;
      collection.verifiedEmails = collection.emails.filter(e => e.status === 'verified').length;

      const updatedCollection = await collection.save();

      this.logger.log(`Deleted ${initialCount - collection.emails.length} emails from collection ${collection.name}`);

      return updatedCollection;
    } catch (error) {
      this.logger.error(`Failed to delete emails from collection ${collectionId}: ${error.message}`);
      throw error;
    }
  }

  /** -------- GET OVERVIEW STATISTICS -------- */
  async getOverviewStats(userId: string) {
    try {
      const collections = await this.getUserCollections(userId);

      const totalEmails = collections.reduce((sum, col) => sum + col.totalEmails, 0);
      const totalCollections = collections.length;
      const verifiedEmails = collections.reduce((sum, col) => sum + col.verifiedEmails, 0);

      return {
        totalCollections,
        totalEmails,
        verifiedEmails,
        invalidEmails: totalEmails - verifiedEmails,
        recentCollections: collections.slice(0, 5).map(col => ({
          id: col._id,
          name: col.name,
          emailCount: col.totalEmails,
          verifiedCount: col.verifiedEmails,
          createdAt: (col as any).createdAt || new Date(), // Use current date as fallback
        })),
      };
    } catch (error) {
      this.logger.error(`Failed to get overview stats for user ${userId}: ${error.message}`);
      throw error;
    }
  }

  /** -------- VALIDATE EMAIL FORMAT -------- */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /** -------- CLEAN AND VALIDATE EMAILS -------- */
  async cleanAndValidateEmails(emails: ScrapedEmailInterface[]): Promise<{
    valid: ScrapedEmailInterface[];
    invalid: ScrapedEmailInterface[];
  }> {
    const valid: ScrapedEmailInterface[] = [];
    const invalid: ScrapedEmailInterface[] = [];

    for (const email of emails) {
      if (this.isValidEmail(email.email)) {
        valid.push({
          ...email,
          email: email.email.toLowerCase().trim(),
        });
      } else {
        invalid.push(email);
      }
    }

    return { valid, invalid };
  }
}