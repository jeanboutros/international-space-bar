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

    /** Base URL of the Ollama server. */
    readonly ollamaBaseUrl: URL;

    /** Tavily search API key. */
    readonly tavilyApiKey: string;

    /** Application version string (semver). */
    readonly appVersion: string;
}
