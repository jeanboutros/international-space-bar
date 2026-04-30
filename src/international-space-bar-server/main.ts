import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { ApplicationConfigService } from "./application-config/application-config.service.js";
import { PinoLoggerService } from "./logging/pino-logger.service.js";
import { OpenResponsesWsAdapter } from "./openresponses/ws-adapter.js";

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
    if (config.get("server.enableCors")) {
        const origins = config.get("server.corsOrigins");
        app.enableCors({ origin: origins });
    }

    logger.log(`Starting international-space-bar-server in ${String(config.environment)} mode ...`);

    const port = config.get("server.port");
    const host = config.get("server.host");

    logger.debug("Logging application debug information:");
    logger.debug(`Is CORS enabled? ${String(config.get("server.enableCors"))}`);
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
