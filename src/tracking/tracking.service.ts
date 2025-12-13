import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Campaign } from "src/schemas/campaign.schema";

@Injectable()
export class TrackingService {
    private readonly logger = new Logger(TrackingService.name)

    constructor(
        @InjectModel(Campaign.name) private campaignModel: Model<Campaign>
    ) { }

    async trackOpen(trackingId: string): Promise<{ success: boolean }> {
        try {
            const [campaignId, email] = this.parseTrackingId(trackingId)

            await this.campaignModel.updateOne(
                {
                    _id: campaignId,
                    'emails.email': email
                },
                {
                    $Inc: {
                        emailsOpened: 1,
                        'emails.$.openCount': 1,
                    },
                    $set: {
                        'emails.$.openedAt': new Date(),
                        'emails.$.status': 'opened'
                    }
                }
            )
            this.logger.log(`email opened: ${email} in campaign: ${campaignId}`)
            return { success: true }
        } catch (error) {
            this.logger.error(`open tracking failed: ${error.message}`)
            return { success: false }
        }
    }

    async trackingClick(trackingId: string, link: string): Promise<{ success: boolean }> {
        try {
            const [campaignId, email] = this.parseTrackingId(trackingId)

            await this.campaignModel.updateOne(
                {
                    _id: campaignId,
                    'emails.email': email
                },
                {

                    $inc: { emailsClicked: 1 },
                    $set: {
                        'emails.$.clickedAt': new Date(),
                        'emails.$.clickLinks': link
                    },
                    $addToSet: {
                        'email.$.clickLinks': link
                    }
                }

            )
            this.logger.log(`link clicked ${link} by ${email} in Campaign: ${campaignId}`)
            return { success: true }
        } catch (error) {
            this.logger.error(`click tracking failed: ${error.message}`)
            return { success: false }
        }
    }

    private parseTrackingId(trackingId: string): [string, string] {
        const parts = trackingId.split('_')
        if (parts.length < 3) {
            throw new Error('invalid id format')
        }
        return [parts[0], parts[1]]
    }

    async trackReply(email: string, campaignId: string): Promise<void> {
        await this.campaignModel.updateOne(
            {
                _id: campaignId,
                'emails.email': email
            }, {
            $inc: { emailsReplied: 1 },
            $set: {
                'emails.$,repliedAt': new Date(),
                'emails.$.status': 'replied',
            }
        }
        )
    }
}       