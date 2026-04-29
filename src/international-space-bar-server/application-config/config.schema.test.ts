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
});
