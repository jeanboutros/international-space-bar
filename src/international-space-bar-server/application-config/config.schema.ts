import { z } from "zod";
import { DEFAULT_HOST, DEFAULT_PORT } from "../constants.js";

// TODO: as a principle, a value cannot be optional. It's optional for the user
// to provide it, but once the config is loaded and validated, all values should be present and non-optional.
// This simplifies usage as the application doesn't have to
// deal with optional values and the possibility of missing keys at runtime. The
// schema should be updated to reflect this principle, and default values should
// be provided where appropriate (e.g. enableCors should default to false).
export const ConfigSchema = z.looseObject({
    version: z.number(),
    app: z
        .looseObject({
            appVersion: z.string().optional(),
        })
        .optional(),
    server: z
        .looseObject({
            port: z.number().default(DEFAULT_PORT),
            host: z.string().default(DEFAULT_HOST),
            enableCors: z.boolean().default(false),
            /**
             * Allowed CORS origins when `enableCors` is true.
             *
             * ⚠ When `enableCors` is `true` and `corsOrigins` is `[]` (the schema default),
             * Express's `cors` middleware receives an empty allow-list and silently blocks
             * **all** cross-origin requests — no matching origin means reject, not allow.
             * To allow all origins pass `["*"]`; to disable CORS enforcement entirely
             * set `enableCors: false`.
             */
            corsOrigins: z.array(z.string()).default([]),
        })
        .default({ port: DEFAULT_PORT, host: DEFAULT_HOST, enableCors: false, corsOrigins: [] }),
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
            // TODO: enforce enum values and default to "info" when missing.
            // should be defined in a constants.ts file.
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
