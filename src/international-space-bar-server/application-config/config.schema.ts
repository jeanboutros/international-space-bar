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
    logger: z
        .looseObject({
            type: z.string(),
            logFilePath: z.string(),
            level: z.string(),
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
