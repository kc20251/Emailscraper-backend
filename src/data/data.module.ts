import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DataService } from './data.service';
import { DataController } from './data.controller';
import {
  EmailCollection,
  EmailCollectionSchema,
} from '../schemas/email-collection.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: EmailCollection.name, schema: EmailCollectionSchema },
    ]),
  ],
  providers: [DataService],
  controllers: [DataController],
  exports: [DataService],
})
export class DataModule {}
