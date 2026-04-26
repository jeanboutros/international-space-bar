/**
 * Application entry point and lifecycle orchestrator.
 *
 * `App` owns two sequential phases:
 *
 * 1. **Initialisation** — infrastructure setup tasks registered via
 *    {@link App.addInitializationTask}. The built-in tasks (config → logging)
 *    run first and are fixed; additional tasks are appended in registration order.
 *
 * 2. **Runnables** — application-level work registered via {@link App.addRunnable}.
 *    These run after all init tasks complete, sequentially in registration order.
 *
 * @example Basic usage
 * ```typescript
 * import { App } from './app.js';
 *
 * // 1. Register any extra init tasks (optional)
 * App.addInitializationTask('database', () => connectToDatabase());
 *
 * // 2. Register the main application work
 * App.addRunnable('agent.loop', () => runAgentLoop());
 *
 * // 3. Run — init executes first, then runnables
 * await App.getInstance().run();
 * ```
 *
* @example Injecting context into an agent
 * ```typescript
 * const ctx = App.getContext();
 * const loop = createOrchestrator(ctx);
 * App.addRunnable('agent.orchestrator', () => loop());
 * // → { "module": "agents.orchestrator", "level": "info", "msg": "..." }
 * ```
 */
import { Config } from "./config.js";
import { Logging } from "./logging.js";
import type { ILogger } from "./interfaces/logger.interface.js";
import type { IConfig } from "./interfaces/config.interface.js";
import type { AppContext } from "./interfaces/app-context.interface.js";

/**
 * Application singleton and lifecycle orchestrator.
 *
 * Use {@link App.getInstance} to obtain the instance, then call {@link App.run}
 * to start the application. Register init tasks and runnables before calling
 * {@link App.run}.
 *
 * Built-in initialisation order (fixed, cannot be reordered):
 * 1. `config`  — validates and loads all environment variables via {@link Config}
 * 2. `logging` — builds the pino logger from validated config via {@link Logging}
 *
 * Additional tasks registered with {@link App.addInitializationTask} are appended
 * after the built-in tasks.
 */
export class App {
    private static instance: App;
    private static config: IConfig;
    private static initialized = false;
    private static log: ILogger;

    private constructor() {
        // Private constructor to prevent direct instantiation
    }

    /**
     * Returns the singleton `App` instance, creating it on the first call.
     *
     * @returns The singleton `App` instance.
     */
    public static getInstance(): App {
        if (!App.instance) {
            App.instance = new App();
        }
        return App.instance;
    }

    private static async setupConfig() {
        try {
            App.config = (await Config.getInstance()).getConfig();
        } catch (error) {
            // Logger is not yet available — fall back to stderr for this one case.
            process.stderr.write(`[fatal] Error loading configuration: ${String(error)}\n`);
            process.exit(1);
        }
    }

    private static async setupLogging() {
        if (!App.config) {
            // This should never happen because of the initialisation order, but we check just in case.
            process.stderr.write("[fatal] Cannot initialize logging: config is not available\n");
            process.exit(1);
        }
        App.log = (await Logging.getInstance(App.config)).getLogger();
        App.log.debug("Logging initialised.");
    }

    private static initialisationStack: Array<{ callableName: string, callable: () => Promise<unknown> }> = [
        {
            // Config must be first — logging reads config values to configure itself.
            callableName: "config",
            callable: () => App.setupConfig(),
        },
        {
            callableName: "logging",
            callable: () => App.setupLogging(),
        },
        // Add other initialization tasks here as needed
    ];

    private static async initialize() {
        for (const { callableName, callable } of App.initialisationStack) {
            await callable();
            // Use stderr until logging is guaranteed to be ready
            App.log?.debug(`Initialisation task complete: ${callableName}`);
        }
        App.log.info("App initialisation complete.");
    }

    /**
     * Registers an infrastructure initialisation task to run during startup,
     * after the built-in `config` and `logging` tasks.
     *
     * Tasks are executed sequentially in registration order. Each task must
     * resolve before the next one begins.
     *
     * Must be called before {@link App.run}.
     *
     * @param callableName - A human-readable label used in log output.
     * @param callable - An async function to execute during initialisation.
     *
     * @example
     * ```typescript
     * App.addInitializationTask('database', () => connectToDatabase());
     * App.addInitializationTask('cache', () => warmCache());
     * await App.getInstance().run();
     * ```
     */
    static addInitializationTask(callableName: string, callable: () => Promise<unknown>) {
        App.initialisationStack.push({ callableName, callable });
    }

    private static runnableStack: Array<{ runnableName: string, runnable: (ctx: AppContext) => Promise<unknown> }> = [
        // Register the main application runnables here using addRunnable(),
        // or push directly into this array before calling app.run().
    ];

    /**
     * Registers a runnable to be executed after all initialisation tasks complete.
     *
     * Runnables are independent of application setup — they represent the main
     * work the application performs (e.g. starting an agent loop, processing a
     * queue, running an HTTP server). They are executed sequentially in the order
     * they are registered.
     *
     * Must be called before {@link App.run}.
     *
     * @param runnableName - A human-readable label used in log output.
     * @param runnable - An async function to execute.
     *
     * @example
     * ```typescript
     * App.addRunnable('agent.loop', () => runAgentLoop());
     * await App.getInstance().run();
     * ```
     */
    static addRunnable(runnableName: string, runnable: (ctx: AppContext) => Promise<unknown>) {
        App.runnableStack.push({ runnableName, runnable });
    }

    private static async runAll() {
        for (const { runnableName, runnable } of App.runnableStack) {
            App.log.debug({ runnable: runnableName }, "Starting runnable.");
            await runnable(App.getContext());
            App.log.debug({ runnable: runnableName }, "Runnable complete.");
        }
    }

    /**
     * Returns the {@link AppContext} to be injected into agents and services.
     *
     * The context exposes an {@link ILogger} and {@link IConfig} — both are
     * interface types, so consumers have no dependency on pino, Zod, or any
     * other infrastructure library.
     *
     * Must only be called after the app has been initialised (i.e. after
     * `await app.run()`).
     *
     * @returns The application context.
     *
     * @example
     * ```typescript
     * const ctx = App.getContext();
     * const loop = createOrchestrator(ctx);
     * App.addRunnable('agent.orchestrator', loop);
     * ```
     */
    public static getContext(): AppContext {
        return {
            logger: App.log,
            config: App.config,
        };
    }

    /**
     * Starts the application: runs all initialisation tasks then all runnables.
     *
     * Initialisation is skipped on subsequent calls (guarded by `initialized`).
     * Each phase runs sequentially — runnables do not start until all init
     * tasks have resolved.
     *
     * @example
     * ```typescript
     * App.addRunnable('agent.loop', () => runAgentLoop());
     * await App.getInstance().run();
     * ```
     */
    async run() {
        if (!App.initialized) {
            await App.initialize();
            App.initialized = true;
        }
        App.log.info("App is running.");
        await App.runAll();
        App.log.info("App run complete. Exiting.");
    }
}