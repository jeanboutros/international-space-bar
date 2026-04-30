/**
 * Tests for: ConfigSchema (Zod config validation)
 * Source: src/international-space-bar-server/application-config/config.schema.ts
 * Ticket: isb-0044
 *
 * Purpose: Verifies that the Zod config schema validates required fields,
 * rejects invalid types, and preserves unknown keys via looseObject.
 */
import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ConfigSchema } from "./config.schema.js";

/**
 * ConfigSchema — Zod looseObject schema for application configuration.
 * Tests verify validation rules, type constraints, and unknown-key passthrough.
 */
void describe("ConfigSchema", () => {
    /**
     * WHAT: A fully populated config object passes validation.
     * WHY: Validates the happy-path — all known fields with correct types are accepted.
     * STEPS:
     *   Arrange — build a config with all known sections populated
     *   Act — call ConfigSchema.safeParse
     *   Assert — result.success is true; data matches input
     */
    void it("accepts a valid full config", () => {
        // --- Arrange ---
        const input = {
            version: 1,
            app: { appVersion: "0.1.0" },
            server: { port: 3000, host: "127.0.0.1" },
            logger: { type: "pino", logFilePath: "./logs/app.log", level: "debug" },
            ollama: { baseUrl: "https://ollama.com", apiKey: "test-key" },
            tavily: { apiKey: "tavily-key" },
            models: { default: "gpt-4", aliases: { fast: "gpt-3.5" } },
            paths: { skillsRoot: ".agents/skills/", agentsConfigDir: ".agents/agents/" },
        };

        // --- Act ---
        const result = ConfigSchema.safeParse(input);

        // --- Assert ---
        assert.ok(result.success);
        assert.equal(result.data.version, 1);
        assert.equal(result.data.server?.port, 3000);
        assert.equal(result.data.models?.default, "gpt-4");
    });

    /**
     * WHAT: A minimal config with only the required `version` field passes.
     * WHY: All sections except `version` are optional; a bare-minimum config must be valid.
     * STEPS:
     *   Arrange — build a config with only version
     *   Act — call ConfigSchema.safeParse
     *   Assert — result.success is true
     */
    void it("accepts minimal config with only version", () => {
        // --- Arrange ---
        const input = { version: 1 };

        // --- Act ---
        const result = ConfigSchema.safeParse(input);

        // --- Assert ---
        assert.ok(result.success);
        assert.equal(result.data.version, 1);
    });

    /**
     * WHAT: Missing required `version` field fails validation.
     * WHY: `version` is the only required top-level field; its absence must be caught.
     * STEPS:
     *   Arrange — build a config without version
     *   Act — call ConfigSchema.safeParse
     *   Assert — result.success is false
     */
    void it("rejects config missing required version field", () => {
        // --- Arrange ---
        const input = { server: { port: 3000, host: "localhost" } };

        // --- Act ---
        const result = ConfigSchema.safeParse(input);

        // --- Assert ---
        assert.equal(result.success, false);
    });

    /**
     * WHAT: Wrong type for `version` (string instead of number) fails.
     * WHY: version must be a number; type mismatches must be rejected.
     * STEPS:
     *   Arrange — build a config with version as a string
     *   Act — call ConfigSchema.safeParse
     *   Assert — result.success is false
     */
    void it("rejects wrong type for version (string instead of number)", () => {
        // --- Arrange ---
        const input = { version: "one" };

        // --- Act ---
        const result = ConfigSchema.safeParse(input);

        // --- Assert ---
        assert.equal(result.success, false);
    });

    /**
     * WHAT: Unknown top-level keys are preserved in result.data (looseObject).
     * WHY: looseObject allows passthrough of unknown keys for forward compatibility.
     * STEPS:
     *   Arrange — build a config with a custom top-level key
     *   Act — call ConfigSchema.safeParse
     *   Assert — result.data contains the unknown key
     */
    void it("preserves unknown top-level keys in result.data", () => {
        // --- Arrange ---
        const input = { version: 1, customTopLevel: "preserved-value" };

        // --- Act ---
        const result = ConfigSchema.safeParse(input);

        // --- Assert ---
        assert.ok(result.success);
        // Unknown keys pass through due to looseObject
        assert.equal((result.data as Record<string, unknown>).customTopLevel, "preserved-value");
    });

    /**
     * WHAT: Unknown nested keys are preserved in result.data.
     * WHY: Nested looseObjects must also pass through unknown keys.
     * STEPS:
     *   Arrange — build a config with an unknown key inside the server section
     *   Act — call ConfigSchema.safeParse
     *   Assert — result.data.server contains the unknown nested key
     */
    void it("preserves unknown nested keys in result.data", () => {
        // --- Arrange ---
        const input = {
            version: 1,
            server: { port: 3000, host: "localhost", customNested: "nested-value" },
        };

        // --- Act ---
        const result = ConfigSchema.safeParse(input);

        // --- Assert ---
        assert.ok(result.success);
        assert.equal((result.data.server as Record<string, unknown>).customNested, "nested-value");
    });

    /**
     * WHAT: server.port as a string (instead of number) fails validation.
     * WHY: Port must be a number; string port values must be rejected by Zod.
     * STEPS:
     *   Arrange — build a config with port as a string
     *   Act — call ConfigSchema.safeParse
     *   Assert — result.success is false
     */
    void it("rejects server.port as string", () => {
        // --- Arrange ---
        const input = { version: 1, server: { port: "3000", host: "localhost" } };

        // --- Act ---
        const result = ConfigSchema.safeParse(input);

        // --- Assert ---
        assert.equal(result.success, false);
    });

    /**
     * WHAT: Empty object fails validation (missing required version).
     * WHY: An empty object has no version field, which is required.
     * STEPS:
     *   Arrange — pass an empty object
     *   Act — call ConfigSchema.safeParse
     *   Assert — result.success is false
     */
    void it("rejects empty object", () => {
        // --- Arrange ---
        const input = {};

        // --- Act ---
        const result = ConfigSchema.safeParse(input);

        // --- Assert ---
        assert.equal(result.success, false);
    });

    // -----------------------------------------------------------------------
    // TC-3: logger.level enum validation (isb-0055)
    // -----------------------------------------------------------------------

    /**
     * WHAT: A valid pino log level ("trace") passes schema validation.
     * WHY: AC-1 — the level enum must accept all six pino levels so valid
     *      configurations are not wrongly rejected at startup.
     * STEPS:
     *   Arrange — build a config with logger.level set to "trace" (lowest valid level)
     *   Act — call ConfigSchema.safeParse
     *   Assert — result.success is true and the level value is preserved
     */
    void it('accepts valid pino level "trace" for logger.level', () => {
        // --- Arrange ---
        const input = {
            version: 1,
            logger: { type: "pino", logFilePath: "./logs/app.log", level: "trace" },
        };

        // --- Act ---
        const result = ConfigSchema.safeParse(input);

        // --- Assert ---
        assert.ok(result.success);
        // Level value is preserved in parsed output
        assert.equal(result.data.logger?.level, "trace");
    });

    /**
     * WHAT: An invalid log level string ("verbose") is rejected by the schema.
     * WHY: AC-1 — the level field uses z.enum([...]) not z.string(); any value
     *      outside the six pino levels must be caught at startup, not at runtime.
     * STEPS:
     *   Arrange — build a config with logger.level set to "verbose" (not a pino level)
     *   Act — call ConfigSchema.safeParse
     *   Assert — result.success is false
     */
    void it('rejects invalid log level string "verbose" for logger.level', () => {
        // --- Arrange ---
        const input = {
            version: 1,
            logger: { type: "pino", logFilePath: "./logs/app.log", level: "verbose" },
        };

        // --- Act ---
        const result = ConfigSchema.safeParse(input);

        // --- Assert ---
        // "verbose" is not in the enum ["fatal","error","warn","info","debug","trace"]
        assert.equal(result.success, false);
    });

    /**
     * WHAT: Omitting logger.level (undefined) passes schema validation.
     * WHY: AC-1 — the level field is .optional(); absence must be valid so the
     *      service-level fallback to "info" (AC-2) is reachable without a schema error.
     * STEPS:
     *   Arrange — build a config with a logger section but no level key
     *   Act — call ConfigSchema.safeParse
     *   Assert — result.success is true and level is undefined in parsed output
     */
    void it("passes when logger.level is omitted (optional field)", () => {
        // --- Arrange ---
        const input = {
            version: 1,
            logger: { type: "pino", logFilePath: "./logs/app.log" },
        };

        // --- Act ---
        const result = ConfigSchema.safeParse(input);

        // --- Assert ---
        assert.ok(result.success);
        // level is absent — undefined signals the fallback path in PinoLoggerService
        assert.equal(result.data.logger?.level, undefined);
    });

    // -----------------------------------------------------------------------
    // TC-4: server.corsOrigins and server.enableCors validation (isb-0059)
    // -----------------------------------------------------------------------

    /**
     * WHAT: A config with server.corsOrigins as a string array passes validation.
     * WHY: T-14 — corsOrigins is declared as z.array(z.string()); a valid origin
     *      list must be accepted at startup so the allowlist is applied in main.ts.
     * STEPS:
     *   Arrange — build a config with server.corsOrigins set to ["http://localhost:4000"]
     *   Act — call ConfigSchema.safeParse
     *   Assert — result.success is true and corsOrigins is preserved in parsed output
     */
    void it("accepts server.corsOrigins as a string array", () => {
        // --- Arrange ---
        const input = {
            version: 1,
            server: { port: 3000, host: "localhost", corsOrigins: ["http://localhost:4000"] },
        };

        // --- Act ---
        const result = ConfigSchema.safeParse(input);

        // --- Assert ---
        assert.ok(result.success);
        // corsOrigins is passed through to main.ts as-is — value must be preserved
        assert.deepEqual(result.data.server?.corsOrigins, ["http://localhost:4000"]);
    });

    /**
     * WHAT: A config with server.corsOrigins as a plain string fails validation.
     * WHY: T-15 — corsOrigins is z.array(z.string()), not z.string(); a bare string
     *      would bypass the origin-list logic in main.ts and must be caught at startup.
     * STEPS:
     *   Arrange — build a config with server.corsOrigins set to a plain string
     *   Act — call ConfigSchema.safeParse
     *   Assert — result.success is false
     */
    void it("rejects server.corsOrigins as a plain string (not an array)", () => {
        // --- Arrange ---
        const input = {
            version: 1,
            server: { port: 3000, host: "localhost", corsOrigins: "http://localhost:4000" },
        };

        // --- Act ---
        const result = ConfigSchema.safeParse(input);

        // --- Assert ---
        // A bare string is not a valid origin list — z.array(z.string()) must reject it
        assert.equal(result.success, false);
    });

    /**
     * WHAT: A config with server.enableCors: true passes validation.
     * WHY: T-16 — enableCors is z.boolean().optional(); true must be accepted so
     *      dev environments can opt into CORS via config.dev.yaml.
     * STEPS:
     *   Arrange — build a config with server.enableCors set to true
     *   Act — call ConfigSchema.safeParse
     *   Assert — result.success is true and enableCors value is preserved
     */
    void it("accepts server.enableCors: true", () => {
        // --- Arrange ---
        const input = {
            version: 1,
            server: { port: 3000, host: "localhost", enableCors: true },
        };

        // --- Act ---
        const result = ConfigSchema.safeParse(input);

        // --- Assert ---
        assert.ok(result.success);
        assert.equal(result.data.server?.enableCors, true);
    });

    /**
     * WHAT: A config with server.enableCors: false passes validation.
     * WHY: T-16 — false is a valid boolean value; prod configs that disable CORS
     *      must not be rejected by the schema.
     * STEPS:
     *   Arrange — build a config with server.enableCors set to false
     *   Act — call ConfigSchema.safeParse
     *   Assert — result.success is true and enableCors is false in parsed output
     */
    void it("accepts server.enableCors: false", () => {
        // --- Arrange ---
        const input = {
            version: 1,
            server: { port: 3000, host: "localhost", enableCors: false },
        };

        // --- Act ---
        const result = ConfigSchema.safeParse(input);

        // --- Assert ---
        assert.ok(result.success);
        assert.equal(result.data.server?.enableCors, false);
    });

    /**
     * WHAT: A config with server.enableCors set to a non-boolean fails validation.
     * WHY: T-16 — enableCors is z.boolean(); a string "true" or number 1 must be
     *      rejected so a YAML typo (e.g. enableCors: "yes") is caught at startup.
     * STEPS:
     *   Arrange — build a config with server.enableCors set to the string "true"
     *   Act — call ConfigSchema.safeParse
     *   Assert — result.success is false
     */
    void it("rejects server.enableCors as a non-boolean value", () => {
        // --- Arrange ---
        const input = {
            version: 1,
            server: { port: 3000, host: "localhost", enableCors: "true" },
        };

        // --- Act ---
        const result = ConfigSchema.safeParse(input);

        // --- Assert ---
        // The string "true" is not a boolean — z.boolean() must reject it
        assert.equal(result.success, false);
    });

    // -----------------------------------------------------------------------
    // TC-5: server block defaults (isb-0064)
    // -----------------------------------------------------------------------

    /**
     * WHAT: When the `server:` key is entirely absent, all four server fields
     *       resolve to their schema defaults.
     * WHY: T-1 — isb-0064 adds `.default({})` to the server block so that a
     *      minimal config (e.g. `{ version: 1 }`) produces a fully resolved
     *      server object rather than undefined. Both port and host are verified
     *      here because they are the primary security-sensitive defaults.
     * STEPS:
     *   Arrange — build a config with only `version: 1` (NO `server:` key)
     *   Act — call ConfigSchema.safeParse
     *   Assert — result.data.server.port === 3000 AND .host === "127.0.0.1"
     */
    void it("applies server block default when server key is absent — port and host (T-1)", () => {
        // --- Arrange ---
        // Explicitly no `server:` key — this is intentional, not { server: undefined }
        const input = { version: 1 };

        // --- Act ---
        const result = ConfigSchema.safeParse(input);

        // --- Assert ---
        assert.ok(result.success);
        // Direct access (no optional chaining) — .default({}) guarantees the object exists
        assert.equal(result.data.server.port, 3000);
        assert.equal(result.data.server.host, "127.0.0.1");
    });

    /**
     * WHAT: When `server:` is present but `port` is omitted, port defaults to 3000.
     * WHY: T-2 — `port` carries `.default(DEFAULT_PORT)`; partial server configs
     *      (e.g. only specifying host) must not require the user to also supply port.
     * STEPS:
     *   Arrange — build a config with `server: { host: "localhost" }` (no port)
     *   Act — call ConfigSchema.safeParse
     *   Assert — result.data.server.port === 3000
     */
    void it("defaults server.port to 3000 when port is omitted (T-2)", () => {
        // --- Arrange ---
        const input = { version: 1, server: { host: "localhost" } };

        // --- Act ---
        const result = ConfigSchema.safeParse(input);

        // --- Assert ---
        assert.ok(result.success);
        assert.equal(result.data.server.port, 3000);
    });

    /**
     * WHAT: When `server:` is present but `host` is omitted, host defaults to "127.0.0.1".
     * WHY: T-3 — `host` carries `.default(DEFAULT_HOST)`; the loopback default is a
     *      security boundary. Omitting host in config must not expose the server.
     * STEPS:
     *   Arrange — build a config with `server: { port: 8080 }` (no host)
     *   Act — call ConfigSchema.safeParse
     *   Assert — result.data.server.host === "127.0.0.1"
     */
    void it('defaults server.host to "127.0.0.1" when host is omitted (T-3)', () => {
        // --- Arrange ---
        const input = { version: 1, server: { port: 8080 } };

        // --- Act ---
        const result = ConfigSchema.safeParse(input);

        // --- Assert ---
        assert.ok(result.success);
        assert.equal(result.data.server.host, "127.0.0.1");
    });

    /**
     * WHAT: When `server:` is present but `enableCors` is omitted, it defaults to false.
     * WHY: T-4 — `enableCors` carries `.default(false)`; CORS must be disabled
     *      by default so prod configs that omit the key are secure out of the box.
     * STEPS:
     *   Arrange — build a config with `server: {}` (no enableCors)
     *   Act — call ConfigSchema.safeParse
     *   Assert — result.data.server.enableCors === false
     */
    void it("defaults server.enableCors to false when enableCors is omitted (T-4)", () => {
        // --- Arrange ---
        const input = { version: 1, server: {} };

        // --- Act ---
        const result = ConfigSchema.safeParse(input);

        // --- Assert ---
        assert.ok(result.success);
        assert.equal(result.data.server.enableCors, false);
    });

    /**
     * WHAT: When `server:` is present but `corsOrigins` is omitted, it defaults to [].
     * WHY: T-5 — `corsOrigins` carries `.default([])`; an absent key must produce
     *      an empty array (not undefined) so main.ts can safely iterate the list.
     * STEPS:
     *   Arrange — build a config with `server: {}` (no corsOrigins)
     *   Act — call ConfigSchema.safeParse
     *   Assert — deepEqual(result.data.server.corsOrigins, [])
     */
    void it("defaults server.corsOrigins to [] when corsOrigins is omitted (T-5)", () => {
        // --- Arrange ---
        const input = { version: 1, server: {} };

        // --- Act ---
        const result = ConfigSchema.safeParse(input);

        // --- Assert ---
        assert.ok(result.success);
        // deepEqual required — [] is a reference type; assert.equal would always fail
        assert.deepEqual(result.data.server.corsOrigins, []);
    });

    /**
     * WHAT: Explicit server field values are preserved and not overridden by defaults.
     * WHY: T-6 — defaults must only activate when a field is absent; if a user
     *      explicitly sets port/host/enableCors/corsOrigins, those values must
     *      not be silently replaced by the schema defaults.
     * STEPS:
     *   Arrange — build a config with all four server fields set to non-default values
     *   Act — call ConfigSchema.safeParse
     *   Assert — all four fields match the explicitly provided values
     */
    void it("preserves explicit server field values — defaults do not override (T-6)", () => {
        // --- Arrange ---
        const input = {
            version: 1,
            server: {
                port: 9000,
                host: "0.0.0.0",
                enableCors: true,
                corsOrigins: ["https://example.com"],
            },
        };

        // --- Act ---
        const result = ConfigSchema.safeParse(input);

        // --- Assert ---
        assert.ok(result.success);
        assert.equal(result.data.server.port, 9000);
        assert.equal(result.data.server.host, "0.0.0.0");
        assert.equal(result.data.server.enableCors, true);
        // deepEqual required — arrays are reference types
        assert.deepEqual(result.data.server.corsOrigins, ["https://example.com"]);
    });
});
