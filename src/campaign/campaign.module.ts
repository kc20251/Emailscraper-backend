import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CampaignService } from './campaign.service';
import { CampaignController } from './Campaign.controller';
import {
  EmailTemplate,
  EmailTemplateSchema,
} from '../schemas/email-template.schema';
import { Campaign, CampaignSchema } from '../schemas/campaign.schema';
import { SMTPConfig, SMTPConfigSchema } from '../schemas/smtp-config.schema';
import { DataModule } from '../data/data.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Campaign.name, schema: CampaignSchema },
      { name: EmailTemplate.name, schema: EmailTemplateSchema },
      { name: SMTPConfig.name, schema: SMTPConfigSchema },
    ]),
    EmailModule,
    DataModule,
  ],
  providers: [CampaignService],
  controllers: [CampaignController],
  exports: [CampaignService],
})
export class CampaignModule {}
