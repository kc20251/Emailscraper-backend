import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { Parser } from 'json2csv';
import * as ExcelJS from 'exceljs';
import { DataService } from 'src/data/data.service';
import { ScrapedEmail } from 'src/schemas/email-collection.schema';

export interface ExportOptions {
  format: 'csv' | 'excel' | 'json';
  includeFields: string[];
  filters?: {
    status?: string;
    industry?: string;
    region?: string;
  };
}

@Injectable()
export class ExportService {
  constructor(private dataService: DataService) { }

 // Remove the problematic async generator return type and use proper pagination
async exportEmails(
  userId: string,
  collectionId: string | 'all',
  options: ExportOptions,
): Promise<{ data: Buffer | string; filename: string; mimeType: string }> {
  let emails: ScrapedEmail[];

  if (collectionId === 'all') {
    // Use paginated search instead of async generator
    const searchResult = await this.dataService.searchEmails(
      userId, 
      {}, 
      1, 
      10000 // Large limit for export
    );
    emails = searchResult.emails;
  } else {
    const collection = await this.dataService.getCollection(collectionId, userId);
    emails = collection.emails;
  }

  // Apply filters with proper null checks
  if (options.filters?.status) {
    emails = emails.filter(email => email.status === options.filters!.status);
  }

  if (options.filters?.industry) {
    const industryFilter = options.filters.industry.toLowerCase();
    emails = emails.filter(email => 
      email.metadata?.industry?.toLowerCase().includes(industryFilter)
    );
  }

  if (options.filters?.region) {
    const regionFilter = options.filters.region.toLowerCase();
    emails = emails.filter(email => 
      email.metadata?.region?.toLowerCase().includes(regionFilter)
    );
  }

  const timestamp = new Date().toISOString().split('T')[0];
  const baseFilename = `emails-${timestamp}`;

  switch (options.format) {
    case 'csv':
      return this.exportToCSV(emails, baseFilename);
    case 'excel':
      return this.exportToExcel(emails, baseFilename);
    case 'json':
      return this.exportToJSON(emails, baseFilename);
    default:
      throw new HttpException('Unsupported export format', HttpStatus.BAD_REQUEST);
  }
}

  /** ------------------------------
   *  CSV EXPORT
   * ------------------------------ */
  private exportToCSV(emails: ScrapedEmail[], filename: string) {
    const fields = [
      'email',
      'source',
      'context',
      'status',
      'scrapedAt',
      'metadata.industry',
      'metadata.region',
      'metadata.company',
      'metadata.website'
    ];

    const parser = new Parser({ fields });
    const csv = parser.parse(emails);

    return {
      data: csv,
      filename: `${filename}.csv`,
      mimeType: 'text/csv'
    };
  }

  /** ------------------------------
   *  EXCEL EXPORT
   * ------------------------------ */
  private async exportToExcel(emails: ScrapedEmail[], filename: string) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Emails');

    worksheet.columns = [
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Source', key: 'source', width: 50 },
      { header: 'Context', key: 'context', width: 30 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Industry', key: 'industry', width: 20 },
      { header: 'Region', key: 'region', width: 20 },
      { header: 'Company', key: 'company', width: 25 },
      { header: 'Website', key: 'website', width: 30 },
      { header: 'ScrapedAt', key: 'scrapedAt', width: 20 }
    ];

    emails.forEach(email => {
      worksheet.addRow({
        email: email.email,
        source: email.source,
        context: email.context,
        status: email.status,
        industry: email.metadata?.industry,
        region: email.metadata?.region,
        company: email.metadata?.company,
        website: email.metadata?.website,
        scrapedAt: email.scrapedAt
      });
    });

    worksheet.getRow(1).font = { bold: true };
    const buffer = await workbook.xlsx.writeBuffer();

    return {
      data: Buffer.from(buffer), // <-- fixed
      filename: `${filename}.xlsx`,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };

  }

  /** ------------------------------
   *  JSON EXPORT
   * ------------------------------ */
  private exportToJSON(emails: ScrapedEmail[], filename: string) {
    return {
      data: JSON.stringify(emails, null, 2),
      filename: `${filename}.json`,
      mimeType: 'application/json'
    };
  }

  /** ------------------------------
   *  EXPORT STATISTICS
   * ------------------------------ */
  async getExportStats(userId: string): Promise<{
    totalCollection: number;
    totalEmails: number;
    verifiedEmails: number;
    emailsByIndustry: Record<string, number>;
    emailsByRegion: Record<string, number>;
  }> {
    const collections = await this.dataService.getUserCollections(userId);

    const totalEmails = collections.reduce(
      (sum, col) => sum + col.totalEmails,
      0
    );

    const verifiedEmails = collections.reduce(
      (sum, col) => sum + col.verifiedEmails,
      0
    );

    const emailsByIndustry: Record<string, number> = {};
    const emailsByRegion: Record<string, number> = {};

    collections.forEach(col => {
      col.emails.forEach(email => {
        if (email.metadata?.industry) {
          emailsByIndustry[email.metadata.industry] =
            (emailsByIndustry[email.metadata.industry] || 0) + 1;
        }
        if (email.metadata?.region) {
          emailsByRegion[email.metadata.region] =
            (emailsByRegion[email.metadata.region] || 0) + 1;
        }
      });
    });

    return {
      totalCollection: collections.length,
      totalEmails,
      verifiedEmails,
      emailsByIndustry,
      emailsByRegion
    };
  }
}
