import path from "node:path";
import type { LoggerService } from "@nestjs/common";
import { Inject, Injectable } from "@nestjs/common";
import pino from "pino";
import { build as prettyBuild } from "pino-pretty";
import { ApplicationConfigService } from "../application-config/application-config.service.js";
import type { ILogger } from "../common/interfaces/index.js";

/**
 * NestJS logging service backed by pino.
 *
 * Implements both:
 * - NestJS `LoggerService` — used as the application-wide NestJS logger via
 *   `app.useLogger(app.get(PinoLoggerService))`.
 * - Inner `ILogger` — injectable into any service that needs structured logging
 *   without coupling to NestJS internals.
 *
 * Stream strategy:
 * - Non-production (`dev`, `test`): pino-pretty → stdout; optional file destination.
 * - Production (`prod`): JSON → stdout (fd 1); optional file destination.
 *
 * Level fallback: if `config.logger.level` is absent, `"info"` is used and a
 * warning is emitted on the pino logger immediately after construction.
 */
@Injectable()
export class PinoLoggerService implements LoggerService, ILogger {
    private readonly pinoLogger: pino.Logger;

    constructor(@Inject(ApplicationConfigService) configService: ApplicationConfigService) {
        const config = configService.getConfig();
        const rawLevel = config.logger?.level;
        const resolvedLevel = rawLevel ?? "info";

        const pinoOptions: pino.LoggerOptions = {
            level: resolvedLevel,
            timestamp: pino.stdTimeFunctions.isoTime,
            formatters: { level: (label) => ({ level: label }) },
        };

        const streams: pino.StreamEntry[] = [];
        const isProd = configService.environment === "prod";

        if (!isProd) {
            streams.push({
                stream: prettyBuild({ colorize: true, sync: true }),
                level: resolvedLevel,
            });
        } else {
            // Production: structured JSON to stdout (file descriptor 1).
            streams.push({ stream: pino.destination(1), level: resolvedLevel });
        }

        if (config.logger?.logFilePath) {
            // AC-3: resolve path relative to process.cwd() to prevent runtime drift.
            const resolvedPath = path.resolve(process.cwd(), config.logger.logFilePath);
            // sync: true opens the file FD synchronously so writes never throw
            // "sonic boom is not ready yet" during test teardown or early startup.
            streams.push({
                stream: pino.destination({ dest: resolvedPath, mkdir: true, sync: true }),
                level: resolvedLevel,
            });
        }

        this.pinoLogger = pino(pinoOptions, pino.multistream(streams));

        // AC-2: emit warning after logger is built so the message lands in all configured streams.
        if (rawLevel === undefined) {
            this.pinoLogger.warn("config.logger.level is undefined — falling back to 'info'");
        }
    }

    /**
     * Internal factory for child logger instances.
     *
     * Bypasses NestJS DI by constructing an instance via `Object.create` and
     * populating the `pinoLogger` field directly. This avoids a secondary
     * constructor overload that would confuse NestJS's `emitDecoratorMetadata`
     * reflection. The resulting instance is fully functional — all prototype
     * methods are inherited.
     */
    private static fromPinoLogger(pinoLogger: pino.Logger): PinoLoggerService {
        const instance = Object.create(PinoLoggerService.prototype) as PinoLoggerService;
        // Bypass readonly: instance is fully owned by this class and never exposed externally.
        Reflect.set(instance, "pinoLogger", pinoLogger);
        return instance;
    }

    // -------------------------------------------------------------------------
    // ILogger implementation
    // -------------------------------------------------------------------------

    child(name: string): ILogger {
        return PinoLoggerService.fromPinoLogger(this.pinoLogger.child({ module: name }));
    }

    trace(contextOrMessage: Record<string, unknown> | string, message?: string): void {
        if (typeof contextOrMessage === "string") {
            this.pinoLogger.trace(contextOrMessage);
        } else {
            this.pinoLogger.trace(contextOrMessage, message ?? "");
        }
    }

    debug(contextOrMessage: Record<string, unknown> | string, message?: string): void {
        if (typeof contextOrMessage === "string") {
            this.pinoLogger.debug(contextOrMessage);
        } else {
            this.pinoLogger.debug(contextOrMessage, message ?? "");
        }
    }

    info(contextOrMessage: Record<string, unknown> | string, message?: string): void {
        if (typeof contextOrMessage === "string") {
            this.pinoLogger.info(contextOrMessage);
        } else {
            this.pinoLogger.info(contextOrMessage, message ?? "");
        }
    }

    warn(contextOrMessage: Record<string, unknown> | string, message?: string): void {
        if (typeof contextOrMessage === "string") {
            this.pinoLogger.warn(contextOrMessage);
        } else {
            this.pinoLogger.warn(contextOrMessage, message ?? "");
        }
    }

    error(contextOrMessage: Record<string, unknown> | string, message?: string): void {
        if (typeof contextOrMessage === "string") {
            this.pinoLogger.error(contextOrMessage);
        } else {
            this.pinoLogger.error(contextOrMessage, message ?? "");
        }
    }

    fatal(contextOrMessage: Record<string, unknown> | string, message?: string): void {
        if (typeof contextOrMessage === "string") {
            this.pinoLogger.fatal(contextOrMessage);
        } else {
            this.pinoLogger.fatal(contextOrMessage, message ?? "");
        }
    }

    // -------------------------------------------------------------------------
    // NestJS LoggerService implementation
    //
    // NestJS passes context (the class name) as the last element of optionalParams.
    // These methods bridge NestJS's internal logging calls to pino.
    // -------------------------------------------------------------------------

    log(message: unknown, ...optionalParams: unknown[]): void {
        const context = optionalParams.at(-1);
        const ctx: Record<string, unknown> =
            typeof context === "string"
                ? { nestContext: context }
                : typeof context === "object" && context !== null
                  ? (context as Record<string, unknown>)
                  : {};
        this.pinoLogger.info(ctx, String(message));
    }

    verbose(message: unknown, ...optionalParams: unknown[]): void {
        const context = optionalParams.at(-1);
        const ctx: Record<string, unknown> =
            typeof context === "string"
                ? { nestContext: context }
                : typeof context === "object" && context !== null
                  ? (context as Record<string, unknown>)
                  : {};
        this.pinoLogger.trace(ctx, String(message));
    }
}
