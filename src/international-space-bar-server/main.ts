import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { PinoLoggerService } from "./logging/pino-logger.service.js";

const DEFAULT_PORT = 3000;

async function bootstrap() {
    const app = await NestFactory.create(AppModule, { bufferLogs: true });
    // Must be called after module bootstrap and before app.listen().
    // bufferLogs: true holds NestJS internal messages until this point.
    app.useLogger(app.get(PinoLoggerService));
    const port = Number(process.env.PORT ?? DEFAULT_PORT);
    app.enableShutdownHooks();
    await app.listen(port, "127.0.0.1");
}

await bootstrap();
