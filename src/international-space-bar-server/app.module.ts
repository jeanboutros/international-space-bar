import { Module } from "@nestjs/common";
import { HealthController } from "./health/health.controller.js";
import { OpenResponsesModule } from "./openresponses/openresponses.module.js";

@Module({
    imports: [OpenResponsesModule],
    controllers: [HealthController],
})
export class AppModule {}
