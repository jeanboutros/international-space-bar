/**
 * Application configuration — reads from YAML with secrets resolution.
 *
 * The primary config source is `config.yaml` at the project root.
 * Values using the `SECRET[xxx]` syntax are resolved at load time
 * via a pluggable {@link ISecretsStore} (default: environment variables).
 *
 * Only one environment variable is required to bootstrap the system:
 * - `CONFIG_PATH` — path to the YAML config file (default: `config.yaml`)
 *
 * All other values (including secrets) come from the YAML file, with
 * secrets resolved through the store.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import packageJson from "../../package.json" with { type: "json" };
import {
    EnvironmentVariablesSecretsStore,
    type ISecretsStore,
    resolveSecrets,
} from "./services/secrets-store.js";

const version = packageJson.version;

// ---------------------------------------------------------------------------
// Schema — mirrors config.yaml structure after secrets are resolved
// ---------------------------------------------------------------------------

const ConfigSchema = z.readonly(
    z.object({
        nodeEnv: z.enum(["development", "production", "test"]).default("development"),
        loggerType: z.enum(["default", "pino"]).default("default"),
        logFilePath: z.string().optional(),
        ollamaBaseUrl: z
            .url()
            .transform((s) => new URL(s))
            .default(() => new URL("https://ollama.com")),
        ollamaApiKey: z.string().optional(),
        tavilyApiKey: z.string().min(1),
        defaultModel: z.string().min(1).default("ollama:gemma4:27b"),
        appVersion: z.string().default(version),
        skillsRoot: z.string().default(".agents/skills/"),
        agentsConfigDir: z.string().default(".agents/agents/"),
        modelAliases: z.record(z.string(), z.string()).default({}),
    }),
);

// ---------------------------------------------------------------------------
// YAML loading helpers
// ---------------------------------------------------------------------------

interface RawYamlConfig {
    app?: { nodeEnv?: string; appVersion?: string };
    logger?: { type?: string; logFilePath?: string };
    ollama?: { baseUrl?: string; apiKey?: string };
    tavily?: { apiKey?: string };
    models?: { default?: string; aliases?: Record<string, string> };
    paths?: { skillsRoot?: string; agentsConfigDir?: string };
}

/**
 * Flatten the nested YAML structure into the flat schema shape.
 */
function flattenYaml(raw: RawYamlConfig): Record<string, unknown> {
    return {
        nodeEnv: raw.app?.nodeEnv,
        appVersion: raw.app?.appVersion,
        loggerType: raw.logger?.type,
        logFilePath: raw.logger?.logFilePath,
        ollamaBaseUrl: raw.ollama?.baseUrl,
        ollamaApiKey: raw.ollama?.apiKey,
        tavilyApiKey: raw.tavily?.apiKey,
        defaultModel: raw.models?.default,
        modelAliases: raw.models?.aliases,
        skillsRoot: raw.paths?.skillsRoot,
        agentsConfigDir: raw.paths?.agentsConfigDir,
    };
}

// ---------------------------------------------------------------------------
// Config singleton
// ---------------------------------------------------------------------------

export class Config {
    private static instance: Promise<Config> | undefined;
    private config: z.infer<typeof ConfigSchema>;

    private constructor(config: z.infer<typeof ConfigSchema>) {
        this.config = config;
    }

    /**
     * Performs all async initialisation and returns a fully constructed instance.
     *
     * Reads the YAML config file, resolves `SECRET[xxx]` references using
     * the provided (or default) secrets store, then validates against the
     * Zod schema.
     */
    private static async initialize(secretsStore?: ISecretsStore): Promise<Config> {
        const store = secretsStore ?? new EnvironmentVariablesSecretsStore();

        // Determine YAML path from env (or default)
        const configPath = process.env.CONFIG_PATH ?? join(process.cwd(), "config.yaml");

        // Load and parse YAML
        const { parse: parseYaml } = await import("yaml");
        const rawYaml = readFileSync(configPath, "utf-8");
        const parsed = parseYaml(rawYaml) as unknown;

        // Flatten nested YAML into the flat schema shape
        const flat = flattenYaml(parsed as RawYamlConfig);

        // Resolve SECRET[xxx] references
        resolveSecrets(flat, store);

        // Validate with Zod
        const validated = ConfigSchema.parse(flat);

        return new Config(validated);
    }

    /**
     * Returns a `Promise` that resolves to the singleton `Config` instance,
     * creating it on the first call.
     *
     * @param secretsStore - Optional custom secrets store (defaults to env vars).
     * @returns A `Promise` resolving to the singleton `Config` instance.
     * @throws {import('zod').ZodError} If required config values are missing or invalid.
     * @throws {Error} If the YAML file cannot be read or secrets cannot be resolved.
     */
    public static getInstance(secretsStore?: ISecretsStore): Promise<Config> {
        if (!Config.instance) {
            Config.instance = Config.initialize(secretsStore);
        }
        return Config.instance;
    }

    /**
     * Returns the validated, readonly configuration object.
     */
    public getConfig() {
        return this.config;
    }
}

export type ConfigType = z.infer<typeof ConfigSchema>;
