/**
 * Configuration abstraction used across the application.
 *
 * Consumers depend on this interface, not on the Zod-backed `Config` class or
 * any specific validation library. The concrete implementation in `Config`
 * populates these fields from validated YAML configuration, but that detail
 * is invisible to callers.
 *
 * All fields are `readonly` — configuration is immutable after initialisation.
 */

export interface IConfig {
    /** Runtime environment. */
    readonly nodeEnv: "development" | "production" | "test";

    /**
     * Logger backend to use.
     * - `"default"` — writes structured JSON to `process.stdout` with no third-party dependency.
     * - `"pino"`    — uses the pino logging library (lower overhead, more features).
     */
    readonly loggerType: "default" | "pino";

    /**
     * Absolute path to a file where pino writes JSON log lines.
     * Only used when `loggerType === "pino"`. When set, pino runs two transports:
     * structured JSON to this file and pretty-printed text to `process.stdout`.
     * When unset, only the pretty-print stdout transport is active.
     */
    readonly logFilePath?: string;

    /** Base URL of the Ollama server (cloud or local). */
    readonly ollamaBaseUrl: URL;

    /** API key for Ollama Cloud authentication. */
    readonly ollamaApiKey?: string;

    /** Tavily search API key. */
    readonly tavilyApiKey: string;

    /**
     * Default LLM model identifier used when an agent YAML does not specify its own model.
     * Format: `"provider:model"` (e.g. `"ollama:gemma4:27b"`).
     */
    readonly defaultModel: string;

    /** Application version string (semver). */
    readonly appVersion: string;

    /**
     * Root directory for agent skills, relative to `process.cwd()`.
     * Used as the `FilesystemBackend` root and the base path for skill loading.
     */
    readonly skillsRoot: string;

    /**
     * Directory containing agent YAML configuration files, relative to `process.cwd()`.
     * The agent loader scans this directory for `*.yaml` files at startup.
     */
    readonly agentsConfigDir: string;

    /**
     * Model alias mappings (e.g. `"opus": "ollama:qwen3-coder:480b"`).
     * Used by the agent loader to resolve shorthand model names in YAML configs.
     */
    readonly modelAliases: Record<string, string>;
}
