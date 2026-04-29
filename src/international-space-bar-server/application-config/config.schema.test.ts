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
});
