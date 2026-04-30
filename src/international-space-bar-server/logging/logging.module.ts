import { Global, Module } from "@nestjs/common";
import { ApplicationConfigModule } from "../application-config/application-config.module.js";
import { LOGGER } from "../common/interfaces/logger.port.js";
import { PinoLoggerService } from "./pino-logger.service.js";

/**
 * Global NestJS logging module.
 *
 * Provides `PinoLoggerService` to the entire application.
 * `@Global()` means consuming modules do not need to import `LoggingModule`
 * explicitly — the provider is available in every module's injection context.
 *
 * Imports `ApplicationConfigModule` to make `ApplicationConfigService`
 * an explicit dependency of this module (rather than relying on the implicit
 * global scope provided when `AppModule` imports both).  This also allows
 * `LoggingModule` to be tested in isolation with a simple `overrideProvider`.
 *
 * This module does NOT include a TUI ring buffer or agentLogger — those are
 * composition-root concerns for the core agent app, not the HTTP server.
 * See docs/logging.md §Separation of Concerns for the full rationale.
 */
@Global()
@Module({
    imports: [ApplicationConfigModule],
    providers: [{ provide: LOGGER, useClass: PinoLoggerService }, PinoLoggerService],
    exports: [LOGGER],
})
export class LoggingModule {}
