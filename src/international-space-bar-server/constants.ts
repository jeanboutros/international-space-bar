/** Default TCP port the server binds to when not overridden by config or environment. */
export const DEFAULT_PORT = 3000;

/**
 * Default host the server binds to.
 * Intentionally loopback — prevents accidental external exposure.
 * Override via `server.host` in config or the `HOST` environment variable.
 */
export const DEFAULT_HOST = "127.0.0.1";

/**
 * Bearer token prefix as defined by RFC 6750 §2.1.
 * The trailing space is intentional — Authorization header format is `"Bearer " + token`.
 * Use `BEARER_PREFIX.length` as the slice offset; never hardcode `7`.
 */
export const BEARER_PREFIX = "Bearer ";

/** Environment variable name for the OpenResponses API key. */
export const API_KEY_ENV_VAR = "ISB_OPENRESPONSES_API_KEY";

/** HTTP route for the responses controller (no leading slash — NestJS convention). */
export const RESPONSES_ROUTE = "v1/responses";

/**
 * WebSocket gateway path for the responses gateway (leading slash required by the ws library
 * path option). Derived from RESPONSES_ROUTE so the two cannot drift independently.
 */
export const RESPONSES_WS_PATH = `/${RESPONSES_ROUTE}`;
