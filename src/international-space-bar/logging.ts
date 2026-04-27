import pino, { type Logger } from "pino";
import { build as prettyBuild } from "pino-pretty";
import type { IConfig } from "./interfaces/config.interface.js";
import type { ILogger } from "./interfaces/logger.interface.js";
import { getLogRingBuffer } from "./services/log-stream.js";

type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

const LOG_LEVELS: Record<LogLevel, number> = {
    trace: 10,
    debug: 20,
    info: 30,
    warn: 40,
    error: 50,
    fatal: 60,
};

/**
 * Application logger singleton.
 *
 * Uses the same async factory pattern as {@link Config} — the constructor is
 * private and trivial; all initialisation lives in the private
 * {@link Logging.initialize} method.
 *
 * Logging is intentionally initialised **after** {@link Config} so that the
 * log level and backend are derived from validated configuration values.
 *
 * The `Promise<Logging>` is cached rather than the resolved instance, which
 * prevents duplicate initialisation when `getInstance` is called concurrently
 * before the first call has resolved.
 *
 * ## Logger backends
 *
 * Set `LOGGER_TYPE` in the environment (or `loggerType` in config) to choose:
 * - `"default"` — writes structured JSON to `process.stdout` with no third-party
 *   dependency. This is the default and requires nothing extra.
 * - `"pino"` — uses the pino library. Pipe the process output through `pinot`
 *   for human-readable formatting in development:
 *   ```bash
 *   pnpm dev | pinot
 *   ```
 *
 * ## Module-level logging
 *
 * Use the static {@link Logging.getLogger} to obtain a logger from any module
 * without `await`, without `AppContext`, and without coupling to the `App`
 * singleton:
 *
 * ```typescript
 * import { Logging } from "../logging.js";
 *
 * const logger = Logging.getLogger("tool.weather");
 *
 * export function weatherFunction(input: WeatherSchema) {
 *     logger.info({ location: input.location }, "Fetching weather");
 * }
 * ```
 *
 * **Pre-init fallback.** `getLogger` is safe to call before `App.run()` has
 * finished initialising the logging stack. Until {@link getInstance} resolves
 * and stores the configured backend, calls are forwarded to a lazily-created
 * {@link StdoutLoggerAdapter} at `debug` level. This fallback is created only
 * on first use and only if `resolvedInstance` is not yet set — it is never
 * allocated in the normal (post-init) path. Once the real backend is ready,
 * `resolvedInstance` takes over and the fallback is no longer referenced.
 *
 * > **Note:** loggers obtained before init will use the fallback's level and
 * > format, not the configured ones. Keep pre-init logging to warnings and
 * > errors to avoid noise from the fallback backend.
 *
 * @example Obtain the root logger after init
 * ```typescript
 * const root = (await Logging.getInstance(config)).getLogger();
 * root.info("App started");
 * ```
 *
 * @example Obtain a named child logger after init
 * ```typescript
 * const log = (await Logging.getInstance(config)).getLogger("agents.invoke");
 * log.info("Invoking agent");
 * ```
 */
export class Logging {
    private static instance: Promise<Logging> | undefined;
    private static resolvedInstance: Logging | undefined;
    // Lazily initialised so StdoutLoggerAdapter is available at call time, not at class definition time.
    private static _preInitLogger: ILogger | undefined;
    private logger: ILogger;

    private constructor(logger: ILogger) {
        this.logger = logger;
    }

    private static resolveLevel(config: IConfig): LogLevel {
        if (config.nodeEnv === "production") return "info";
        if (config.nodeEnv === "test") return "warn";
        return "debug";
    }

    private static initialize(config: IConfig): Logging {
        const level = Logging.resolveLevel(config);

        let logger: ILogger;

        if (config.loggerType === "pino") {
            const pinoOptions: pino.LoggerOptions = {
                level,
                timestamp: pino.stdTimeFunctions.isoTime,
                formatters: { level: (label) => ({ level: label }) },
            };

            // Build the destination stream(s).
            // pino-pretty runs in-process (no worker thread) so messages are never
            // lost when the process exits — fixing the pino.transport() race on exit.
            const streams: pino.StreamEntry[] = [];

            if (config.nodeEnv === "development") {
                // Pretty-print colourised text to stdout in development only.
                streams.push({ stream: prettyBuild({ colorize: true, sync: true }), level });
            } else {
                // Structured JSON to stdout in non-development environments.
                streams.push({ stream: pino.destination(1), level });
            }

            if (config.logFilePath) {
                // Structured JSON lines to the configured log file (all environments).
                streams.push({
                    stream: pino.destination({ dest: config.logFilePath, mkdir: true }),
                    level,
                });
            }

            // Ring buffer for the TUI log pane — pretty-printed, always active.
            streams.push({
                stream: prettyBuild({
                    colorize: false,
                    sync: true,
                    destination: getLogRingBuffer(),
                }),
                level,
            });

            logger = new PinoLoggerAdapter(pino(pinoOptions, pino.multistream(streams)));
        } else {
            logger = new StdoutLoggerAdapter({}, level);
        }

        return new Logging(logger);
    }

    /**
     * Returns a `Promise` that resolves to the singleton `Logging` instance,
     * creating it on the first call.
     *
     * `config` is required on the first call so that the logger is built from
     * validated configuration values. Subsequent calls return the cached instance
     * regardless of the argument.
     *
     * @param config - The resolved application configuration.
     * @returns A `Promise` resolving to the singleton `Logging` instance.
     *
     * @example
     * ```typescript
     * const log = (await Logging.getInstance(config)).getLogger('my.module');
     * log.info({ userId: 42 }, 'User logged in');
     * ```
     */
    public static getInstance(config: IConfig): Promise<Logging> {
        if (!Logging.instance) {
            // TODO: Once `initialize` performs real async I/O (e.g. loading log
            // configuration from a file or secrets manager), remove `Promise.resolve()`
            // and make `initialize` async, returning `Promise<Logging>` directly.
            // The `getInstance` signature stays unchanged.
            Logging.instance = Promise.resolve(Logging.initialize(config)).then((inst) => {
                Logging.resolvedInstance = inst;
                return inst;
            });
        }
        return Logging.instance;
    }

    /**
     * Returns an {@link ILogger} synchronously, callable from any module without `await`.
     *
     * Before {@link getInstance} resolves, calls are forwarded to a default
     * {@link StdoutLoggerAdapter} at `debug` level so no messages are lost.
     * Once the singleton is initialised the configured backend is used instead.
     *
     * The returned logger is a {@link LazyLogger} — a thin proxy that resolves
     * the real backend on every call. This means callers can safely store the
     * return value at module scope or in a `const` and it will automatically
     * upgrade to the configured backend once init completes. No per-module
     * lazy-loading wrappers are needed.
     *
     * @param name - Optional dot-separated module name (e.g. `"tool.weather"`).
     * @returns An {@link ILogger} proxy that always delegates to the current backend.
     *
     * @example
     * ```typescript
     * // Any module — no await, no AppContext required.
     * // Safe to call at top level; automatically upgrades after init.
     * import { Logging } from "../logging.js";
     *
     * const logger = Logging.getLogger("tool.weather");
     * logger.info("hello");
     * ```
     */
    public static getLogger(name?: string): ILogger {
        return new LazyLogger(name);
    }

    /**
     * Resolves the current backend logger, falling back to the pre-init
     * {@link StdoutLoggerAdapter} when the singleton has not yet been
     * initialised. Called by {@link LazyLogger} on every method invocation.
     *
     * @internal
     */
    static resolveLogger(name?: string): ILogger {
        if (Logging.resolvedInstance) {
            return Logging.resolvedInstance.getLogger(name);
        }
        if (!Logging._preInitLogger) {
            Logging._preInitLogger = new StdoutLoggerAdapter({}, "debug");
        }
        return name ? Logging._preInitLogger.child(name) : Logging._preInitLogger;
    }

    /**
     * Returns an {@link ILogger} instance.
     *
     * When `name` is provided a **child logger** is returned with a `module`
     * binding added to every log line:
     * ```
     * { "module": "agents.invoke", "level": "info", "msg": "Invoking agent" }
     * ```
     *
     * When called without a name the root logger is returned.
     *
     * @param name - Optional dot-separated module name (e.g. `"agents.invoke"`).
     * @returns An {@link ILogger}, optionally scoped to `name`.
     */
    public getLogger(name?: string): ILogger {
        return name ? this.logger.child(name) : this.logger;
    }
}

// ---------------------------------------------------------------------------
// Lazy logger — proxy that resolves the real backend on each call.
// Safe to store at module scope; automatically upgrades after init.
// ---------------------------------------------------------------------------

class LazyLogger implements ILogger {
    constructor(private readonly name?: string) {}

    private resolve(): ILogger {
        return Logging.resolveLogger(this.name);
    }

    child(childName: string): ILogger {
        const combined = this.name ? `${this.name}.${childName}` : childName;
        return new LazyLogger(combined);
    }

    trace(contextOrMessage: Record<string, unknown> | string, message?: string): void {
        this.resolve().trace(contextOrMessage as Record<string, unknown>, message as string);
    }
    debug(contextOrMessage: Record<string, unknown> | string, message?: string): void {
        this.resolve().debug(contextOrMessage as Record<string, unknown>, message as string);
    }
    info(contextOrMessage: Record<string, unknown> | string, message?: string): void {
        this.resolve().info(contextOrMessage as Record<string, unknown>, message as string);
    }
    warn(contextOrMessage: Record<string, unknown> | string, message?: string): void {
        this.resolve().warn(contextOrMessage as Record<string, unknown>, message as string);
    }
    error(contextOrMessage: Record<string, unknown> | string, message?: string): void {
        this.resolve().error(contextOrMessage as Record<string, unknown>, message as string);
    }
    fatal(contextOrMessage: Record<string, unknown> | string, message?: string): void {
        this.resolve().fatal(contextOrMessage as Record<string, unknown>, message as string);
    }
}

// ---------------------------------------------------------------------------
// Default logger — writes newline-delimited JSON to process.stdout.
// Zero third-party dependencies.
// ---------------------------------------------------------------------------

class StdoutLoggerAdapter implements ILogger {
    constructor(
        private readonly bindings: Record<string, unknown>,
        private readonly level: LogLevel,
    ) {}

    child(name: string): ILogger {
        return new StdoutLoggerAdapter({ ...this.bindings, module: name }, this.level);
    }

    private write(
        level: LogLevel,
        contextOrMessage: Record<string, unknown> | string,
        message?: string,
    ): void {
        if (LOG_LEVELS[level] < LOG_LEVELS[this.level]) return;
        const entry =
            typeof contextOrMessage === "string"
                ? { ...this.bindings, level, time: new Date().toISOString(), msg: contextOrMessage }
                : {
                      ...this.bindings,
                      ...contextOrMessage,
                      level,
                      time: new Date().toISOString(),
                      msg: message ?? "",
                  };
        process.stdout.write(`${JSON.stringify(entry)}\n`);
    }

    trace(contextOrMessage: Record<string, unknown> | string, message?: string): void {
        this.write("trace", contextOrMessage, message);
    }
    debug(contextOrMessage: Record<string, unknown> | string, message?: string): void {
        this.write("debug", contextOrMessage, message);
    }
    info(contextOrMessage: Record<string, unknown> | string, message?: string): void {
        this.write("info", contextOrMessage, message);
    }
    warn(contextOrMessage: Record<string, unknown> | string, message?: string): void {
        this.write("warn", contextOrMessage, message);
    }
    error(contextOrMessage: Record<string, unknown> | string, message?: string): void {
        this.write("error", contextOrMessage, message);
    }
    fatal(contextOrMessage: Record<string, unknown> | string, message?: string): void {
        this.write("fatal", contextOrMessage, message);
    }
}

// ---------------------------------------------------------------------------
// Pino logger — used when config.loggerType === "pino".
// Pipe output through `pinot` for human-readable formatting in development.
// ---------------------------------------------------------------------------

class PinoLoggerAdapter implements ILogger {
    constructor(private readonly logger: Logger) {}

    child(name: string): ILogger {
        return new PinoLoggerAdapter(this.logger.child({ module: name }));
    }

    private call(
        level: Exclude<LogLevel, "silent">,
        contextOrMessage: Record<string, unknown> | string,
        message?: string,
    ): void {
        if (typeof contextOrMessage === "string") {
            this.logger[level](contextOrMessage);
        } else {
            this.logger[level](contextOrMessage, message ?? "");
        }
    }

    trace(contextOrMessage: Record<string, unknown> | string, message?: string): void {
        this.call("trace", contextOrMessage, message);
    }
    debug(contextOrMessage: Record<string, unknown> | string, message?: string): void {
        this.call("debug", contextOrMessage, message);
    }
    info(contextOrMessage: Record<string, unknown> | string, message?: string): void {
        this.call("info", contextOrMessage, message);
    }
    warn(contextOrMessage: Record<string, unknown> | string, message?: string): void {
        this.call("warn", contextOrMessage, message);
    }
    error(contextOrMessage: Record<string, unknown> | string, message?: string): void {
        this.call("error", contextOrMessage, message);
    }
    fatal(contextOrMessage: Record<string, unknown> | string, message?: string): void {
        this.call("fatal", contextOrMessage, message);
    }
}
