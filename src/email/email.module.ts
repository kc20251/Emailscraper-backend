import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EmailService } from './email.service';
import {
  EmailTemplate,
  EmailTemplateSchema,
} from '../schemas/email-template.schema';
import { Campaign, CampaignSchema } from '../schemas/campaign.schema';
import { SMTPConfig, SMTPConfigSchema } from '../schemas/smtp-config.schema';
import { EmailController } from './email.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SMTPConfig.name, schema: SMTPConfigSchema },
      { name: EmailTemplate.name, schema: EmailTemplateSchema },
      { name: Campaign.name, schema: CampaignSchema },
    ]),
  ],
  providers: [EmailService],
  controllers: [EmailController],
  exports: [EmailService],
})
export class EmailModule {}
