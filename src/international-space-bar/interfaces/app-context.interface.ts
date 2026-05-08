import type { IConfig } from "./config.interface.js";
import type { ILogger } from "../../international-space-bar-common/interfaces/logger.interface.js";

/**
 * Cross-cutting application context injected into agents, services, and other
 * domain components.
 *
 * `AppContext` intentionally depends only on the {@link ILogger} and
 * {@link IConfig} interfaces — never on `App`, `Logging`, `Config`, pino, or
 * Zod directly. This keeps domain code decoupled from infrastructure and makes
 * every consumer trivially testable with mock implementations.
 *
 * The context is constructed at the composition root (i.e. `main.ts` or
 * `App.getContext()`) after the initialisation phase completes, and is then
 * passed down to agents and services via constructor or function arguments.
 *
 * ## Keeping the context narrow
 *
 * Only genuinely cross-cutting infrastructure belongs here. Domain-specific
 * dependencies (a database repository, an API client, a specific tool) should
 * be injected explicitly into the component that needs them, not added to
 * `AppContext`. A bloated context becomes a service locator and makes
 * dependencies implicit.
 *
 * @example Injecting into an agent factory
 * ```typescript
 * import type { AppContext } from '../interfaces/app-context.interface.js';
 *
 * export function createOrchestrator(ctx: AppContext) {
 *     const log = ctx.logger.child('agents.orchestrator');
 *
 *     return async function runAgentLoop() {
 *         log.info('Invoking agent');
 *     };
 * }
 * ```
 *
 * @example Constructing a mock context in tests
 * ```typescript
 * const ctx: AppContext = {
 *     logger: mockLogger,
 *     config: mockConfig,
 * };
 * const loop = createOrchestrator(ctx);
 * await loop();
 * ```
 */
export interface AppContext {
    /** Application-wide logger. Use {@link ILogger.child} to scope log lines to a module. */
    readonly logger: ILogger;

    /** Validated, immutable application configuration. */
    readonly config: IConfig;
}
