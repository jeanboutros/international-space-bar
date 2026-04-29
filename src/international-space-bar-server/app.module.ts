import { Module } from "@nestjs/common";
import { ApplicationConfigModule } from "./application-config/application-config.module.js";
import { HealthController } from "./health/health.controller.js";
import { OpenResponsesModule } from "./openresponses/openresponses.module.js";

@Module({
    imports: [ApplicationConfigModule, OpenResponsesModule],
    controllers: [HealthController],
})
export class AppModule {}
