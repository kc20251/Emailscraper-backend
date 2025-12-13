import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
  Res,
  Query,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ExportService } from './export.service';
import type { ExportOptions } from './export.service';
import type { Response } from 'express'; // ✅ use import type



@Controller('export')
@UseGuards(AuthGuard('jwt'))
export class ExportContoller {
  constructor(private exportService: ExportService) {}

  @Post('collectionId/:id')
  async exportCollection(
    @Req() req,
    @Param('id') collectionId: string,
    @Body() options: ExportOptions,
    @Res() res: Response,
  ) {
    try {
      const result = await this.exportService.exportEmails(
        req.user.usertId,
        collectionId,
        options,
      );

      res.setHeader('Content-Type', result.mimeType);
      res.setHeader(
        'Content-Disposition',
        `attachment: filename=${result.filename}`,
      );

      if (Buffer.isBuffer(result.data)) {
        res.send(result.data);
      } else {
        res.send(Buffer.from(result.data, 'utf-8'));
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        message: `Export failed: ${error.message}`,
      });
    }
  }

  @Post('all')
  async exportAll(
    @Req() req,
    @Body() options: ExportOptions,
    @Res() res: Response,
  ) {
    try {
      const result = await this.exportService.exportEmails(
        req.user.userId,
        'all',
        options,
      );

      res.setHeader('Content-Type', result.mimeType);
      res.setHeader(
        'Content-Disposition',
        `attachment: filename=${result.filename}`,
      );

      if (Buffer.isBuffer(result.data)) {
        res.send(result.data);
      } else {
        res.send(Buffer.from(result.data, 'utf-8'));
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        message: `Export failed: ${error.message}`,
      });
    }
  }

  @Get('stats')
  async getExportStats(@Req() req) {
    return await this.exportService.getExportStats(req.user.userId);
  }

   @Post('emails')
  async exportEmails(
    @Req() req,
    @Body() body: { collectionId: string | 'all'; format: string; filters?: any },
    @Res() res: Response,
  ) {
    try {
      const result = await this.exportService.exportEmails(
        req.user.userId,
        body.collectionId,
        {
          format: body.format as any,
          includeFields: ['email', 'source', 'context', 'status', 'industry', 'region'],
          filters: body.filters,
        },
      );

      res.setHeader('Content-Type', result.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      
      if (result.data instanceof Buffer) {
        res.send(result.data);
      } else {
        res.send(Buffer.from(result.data));
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}
