import { Module } from "@nestjs/common";
import { ApplicationConfigModule } from "./application-config/application-config.module.js";
import { HealthController } from "./health/health.controller.js";
import { LoggingModule } from "./logging/logging.module.js";
import { OpenResponsesModule } from "./openresponses/openresponses.module.js";

@Module({
    imports: [ApplicationConfigModule, LoggingModule, OpenResponsesModule],
    controllers: [HealthController],
})
export class AppModule {}
