/**
 * Configuration abstraction used across the application.
 *
 * Consumers depend on this interface, not on the Zod-backed `Config` class or
 * any specific validation library. The concrete implementation in `Config`
 * populates these fields from validated environment variables, but that detail
 * is invisible to callers.
 *
 * All fields are `readonly` — configuration is immutable after initialisation.
 *
 * @example
 * ```typescript
 * function createLLM(config: IConfig) {
 *     return new ChatOllama({ baseUrl: config.ollamaBaseUrl.href });
 * }
 * ```
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

    /** Base URL of the Ollama server. */
    readonly ollamaBaseUrl: URL;

    /** Tavily search API key. */
    readonly tavilyApiKey: string;

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
}
