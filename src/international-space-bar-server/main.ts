import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { ApplicationConfigService } from "./application-config/application-config.service.js";
import { PinoLoggerService } from "./logging/pino-logger.service.js";
import { OpenResponsesWsAdapter } from "./openresponses/ws-adapter.js";

// TODO: Constants should all live in one place, ideally typed and validated via zod.
// They are the last resort and the fallback for when config values are truly needed
// and they are not provided via environment variables or config files. For example, the default
// port is something that should be easily overridable by env vars or config, but we want to have a sane default if not provided.
const DEFAULT_PORT = 3000;
// TODO: Same as DEFAULT_PORT, we should ideally have a single source of truth for the default host,
// and it should be overrideable via env vars or config.
const DEFAULT_HOST = "127.0.0.1";

async function bootstrap() {
    const app = await NestFactory.create(AppModule, { bufferLogs: true });
    // Must be called after module bootstrap and before app.listen().
    // bufferLogs: true holds NestJS internal messages until this point.
    const logger = app.get(PinoLoggerService);
    app.useLogger(logger);

    // Register WebSocket adapter for OpenResponses at /v1/responses.
    // Uses native ws library (not Socket.IO) for spec compliance.
    app.useWebSocketAdapter(new OpenResponsesWsAdapter(app));

    const config = app.get(ApplicationConfigService);
    config.get("enableCors") && app.enableCors();

    logger.log(
        `Starting international-space-bar-server in ${String(config.get("environment"))} mode ...`,
    );

    const port = Number(config.get("server.port") ?? process.env.PORT ?? DEFAULT_PORT);
    const host = String(config.get("server.host") ?? process.env.HOST ?? DEFAULT_HOST);

    logger.debug("Logging application debug information:");
    logger.debug(`Is CORS enabled? ${String(config.get("enableCors"))}`);
    logger.debug(`Is server.port set? ${String(config.get("server.port"))}`);
    logger.debug(`Is server.host set? ${String(config.get("server.host"))}`);
    logger.debug(`Is environment variable HOST set? ${process.env.HOST ?? "undefined"}`);
    logger.debug(`Is environment variable PORT set? ${process.env.PORT ?? "undefined"}`);

    logger.info(`Listening on ${host}:${port}`);

    app.enableShutdownHooks();
    await app.listen(port, host);

    const _shutdown = async (signal: string) => {
        logger.log(`Received ${signal}, closing application...`);
        await app.close();
        process.exit(0);
    };

    // process.once("SIGINT", () => {
    //     void shutdown("SIGINT");
    // });
    // process.once("SIGTERM", () => {
    //     void shutdown("SIGTERM");
    // });
}

await bootstrap().catch((error: unknown) => {
    process.stderr.write(
        `Error during application bootstrap: ${error instanceof Error ? error.stack : String(error)}\n`,
    );
    process.exit(1);
});
