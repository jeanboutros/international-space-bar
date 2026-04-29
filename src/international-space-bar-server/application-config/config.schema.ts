import { z } from "zod";

export const ConfigSchema = z.looseObject({
    version: z.number(),
    app: z
        .looseObject({
            appVersion: z.string().optional(),
        })
        .optional(),
    server: z
        .looseObject({
            port: z.number(),
            host: z.string(),
        })
        .optional(),
    /**
     * HTTP server logging — consumed by `PinoLoggerService`.
     * `level` defaults to `"info"` when absent (a warning is emitted on the pino
     * logger itself). `logFilePath` is optional; when set it receives JSON lines
     * in addition to stdout. See `docs/logging.md §6` for the full reference.
     */
    logger: z
        .looseObject({
            type: z.string(),
            logFilePath: z.string(),
            level: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).optional(),
        })
        .optional(),
    ollama: z
        .looseObject({
            baseUrl: z.string(),
            apiKey: z.string(),
        })
        .optional(),
    tavily: z
        .looseObject({
            apiKey: z.string(),
        })
        .optional(),
    models: z
        .looseObject({
            default: z.string(),
            aliases: z.record(z.string(), z.string()),
        })
        .optional(),
    paths: z
        .looseObject({
            skillsRoot: z.string(),
            agentsConfigDir: z.string(),
        })
        .optional(),
});

export type AppConfig = z.infer<typeof ConfigSchema>;
