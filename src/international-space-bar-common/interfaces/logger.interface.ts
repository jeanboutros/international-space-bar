/**
 * Logging abstraction used across the application.
 *
 * Consumers depend on this interface, not on pino or any other logging library
 * directly. The concrete implementation in `Logging` maps these methods onto
 * a pino child logger, but that detail is invisible to callers.
 *
 * Log methods accept an optional `context` object whose properties are merged
 * into the structured log line, followed by a human-readable `message`.
 *
 * @example
 * ```typescript
 * function doWork(log: ILogger) {
 *     log.info({ jobId: 42 }, 'Starting job');
 *     log.debug('Detailed step');
 *     log.error({ err }, 'Job failed');
 * }
 * ```
 */
export interface ILogger {
    /**
     * Returns a child logger with an additional `module` binding on every line.
     *
     * @param name - Dot-separated module name (e.g. `"agents.orchestrator"`).
     */
    child(name: string): ILogger;

    trace(context: Record<string, unknown>, message: string): void;
    trace(message: string): void;

    debug(context: Record<string, unknown>, message: string): void;
    debug(message: string): void;

    info(context: Record<string, unknown>, message: string): void;
    info(message: string): void;

    warn(context: Record<string, unknown>, message: string): void;
    warn(message: string): void;

    error(context: Record<string, unknown>, message: string): void;
    error(message: string): void;

    fatal(context: Record<string, unknown>, message: string): void;
    fatal(message: string): void;
}
