import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";

const DEFAULT_PORT = 3000;

async function bootstrap() {
    const app = await NestFactory.create(AppModule, {
        logger: ["verbose", "debug", "log", "warn", "error", "fatal"],
        bufferLogs: true,
    });
    const port = Number(process.env.PORT ?? DEFAULT_PORT);
    app.enableShutdownHooks();
    await app.listen(port, "127.0.0.1");
}

await bootstrap();
