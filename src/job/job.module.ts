import { Module } from "@nestjs/common";
import { JobService } from "./job.service";
import { JobController } from "./job.controller";
import { ScrapingModule } from "../scraping/scraping.module";
import { SearchModule } from "../search/search.module";
import { DataModule } from "src/data/data.module";

@Module({
    imports: [ScrapingModule, SearchModule, DataModule],
    providers: [JobService],
    controllers: [JobController],
})
export class JobModule {}