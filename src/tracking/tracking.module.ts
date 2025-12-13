import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TrackingService } from './tracking.service';
import { TrackingController } from './tracking.controller';
import { Campaign, CampaignSchema } from 'src/schemas/campaign.schema';


@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Campaign.name, schema: CampaignSchema }
        ])
    ],
    providers: [TrackingService],
    controllers: [TrackingController],
    exports: [TrackingService]
})

export class TrackingModule { }