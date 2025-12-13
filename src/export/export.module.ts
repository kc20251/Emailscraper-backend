import { Module } from '@nestjs/common';
import { ExportService } from './export.service';
import { ExportContoller } from './export.contoller';
import { DataModule } from '../data/data.module';


@Module({
    imports: [DataModule],
    providers: [ExportService],
    controllers: [ExportContoller]
})

export class ExportModule {}