import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JobModule } from './job/job.module';
import { ScrapingModule } from './scraping/scraping.module';
import { SearchModule } from './search/search.module';
import {ExportModule } from './export/export.module';
import {DataModule } from './data/data.module';
import {TrackingModule} from './tracking/tracking.module';
import { CampaignModule } from './campaign/campaign.module';
import configuration from './config/configuration';
import { AdminModule } from './admin/admin.module';
import { SubscriptionModule } from './subscription/subscription.module'; 



@Module({
  imports: [
     ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration], // Add this line to load your configuration
    }),
  MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URI'),
      }),
      inject: [ConfigService],
    }),
    AuthModule,
    JobModule,
    ScrapingModule,
    SearchModule,
    DataModule,
    ExportModule,
    TrackingModule,
    CampaignModule,
    AdminModule, 
    SubscriptionModule,
  ],
  controllers: [],
  providers: [],


})
export class AppModule {}
