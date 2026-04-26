/**
 * This file is responsible for defining the configuration schema and parsing environment variables for the application.
 * It uses the Zod library to validate and provide default values for the configuration.
 *
 * TODO:
 * The configurations should be inside a yaml file and not inside environment variables.
 * Environment variables should only be used for base level configurations that have to precede the loading of the yaml file,
 * such as the path to the yaml file.
 * Secrets should be managed by a secrets manager and not be stored in environment variables or yaml files.
 */

import { z } from "zod";
import packageJson from "../../package.json" with { type: "json" };

// The application version is injected from package.json at build time.
const version = packageJson.version;

const ConfigSchema = z.readonly(
    z.object({
        nodeEnv: z.enum(["development", "production", "test"]).default("development"),
        loggerType: z.enum(["default", "pino"]).default("default"),
        logFilePath: z.string().optional(),
        ollamaBaseUrl: z
            .url()
            .transform((s) => new URL(s))
            .default(() => new URL("http://localhost:11434")),
        tavilyApiKey: z.string().min(1),
        appVersion: z.string().default(version),
        skillsRoot: z.string().default(".agents/skills/"),
        agentsConfigDir: z.string().default(".agents/agents/"),
    }),
);

/**
 * Application configuration singleton.
 *
 * Uses the async factory pattern — the constructor is private and trivial;
 * all initialisation (including future async I/O such as secrets-manager calls)
 * lives in the private {@link Config.initialize} method.
 *
 * The `Promise<Config>` is cached rather than the resolved instance, which
 * prevents duplicate initialisation when `getInstance` is called concurrently
 * before the first call has resolved.
 *
 * Required environment variables:
 * - `TAVILY_API_KEY` — Tavily search API key
 *
 * Optional environment variables (all have defaults):
 * - `NODE_ENV` — `"development"` | `"production"` | `"test"` (default: `"development"`)
 * - `OLLAMA_BASE_URL` — Ollama server base URL (default: `"http://localhost:11434"`)
 * - `APP_VERSION` — application version string (default: `"1.0.0"`)
 *
 * @example
 * ```typescript
 * import { Config } from './config.js';
 *
 * const config = (await Config.getInstance()).getConfig();
 *
 * console.log(config.nodeEnv);       // "development"
 * console.log(config.ollamaBaseUrl); // URL { href: 'http://localhost:11434/' }
 * console.log(config.tavilyApiKey);  // "tvly-..."
 * ```
 */
export class Config {
    private static instance: Promise<Config> | undefined;
    private config: z.infer<typeof ConfigSchema>;

    private constructor(config: z.infer<typeof ConfigSchema>) {
        this.config = config;
    }

    /**
     * Performs all async initialisation and returns a fully constructed instance.
     * Replace the `process.env` lookups here with async I/O (e.g. secrets manager)
     * as needed — callers are unaffected because they always await {@link Config.getInstance}.
     */
    private static initialize(): Config {
        const parsed = ConfigSchema.parse({
            nodeEnv: process.env.NODE_ENV,
            logFilePath: process.env.LOG_FILE_PATH,
            loggerType: process.env.LOGGER_TYPE,
            ollamaBaseUrl: process.env.OLLAMA_BASE_URL,
            tavilyApiKey: process.env.TAVILY_API_KEY,
            appVersion: process.env.APP_VERSION,
            skillsRoot: process.env.SKILLS_ROOT,
            agentsConfigDir: process.env.AGENTS_CONFIG_DIR,
        });

        return new Config(parsed);
    }

    /**
     * Returns a `Promise` that resolves to the singleton `Config` instance,
     * creating it on the first call.
     *
     * Caching the `Promise` (not the resolved value) ensures that concurrent
     * calls before initialisation completes all share the same in-flight promise
     * and never trigger a second initialisation.
     *
     * @returns A `Promise` resolving to the singleton `Config` instance.
     * @throws {import('zod').ZodError} If required environment variables are missing or fail validation.
     *
     * @example
     * ```typescript
     * // Throws ZodError at startup if TAVILY_API_KEY is not set.
     * const config = (await Config.getInstance()).getConfig();
     * ```
     */
    public static getInstance(): Promise<Config> {
        if (!Config.instance) {
            // TODO: Once `initialize` performs real async I/O (e.g. reading from a secrets manager,
            // network, or filesystem), remove `Promise.resolve()` and make `initialize` async,
            // returning `Promise<Config>` directly. The `getInstance` signature stays unchanged.
            Config.instance = Promise.resolve(Config.initialize());
        }
        return Config.instance;
    }

    /**
     * Returns the validated, readonly configuration object.
     *
     * @returns A `Readonly` config object matching {@link ConfigType}.
     */
    public getConfig() {
        return this.config;
    }
}

export type ConfigType = z.infer<typeof ConfigSchema>;
