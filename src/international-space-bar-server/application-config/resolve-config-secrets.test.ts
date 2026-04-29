/**
 * Tests for: resolveConfigSecrets utility
 * Source: src/international-space-bar-server/application-config/resolve-config-secrets.ts
 * Ticket: isb-0044
 *
 * Purpose: Verifies that SECRET[xxx] references in config objects are resolved
 * via the secrets store, and that non-secret values pass through untouched.
 */
import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ISecretsStore } from "../common/interfaces/index.js";
import { resolveConfigSecrets } from "./resolve-config-secrets.js";

/**
 * resolveConfigSecrets — walks a config object and resolves SECRET[xxx] references.
 * Tests cover resolution, pass-through, known limitations, and error propagation.
 */
void describe("resolveConfigSecrets", () => {
    /** Mock secrets store that returns deterministic values for known keys. */
    const mockStore: ISecretsStore = {
        getSecret(key: string): string {
            const secrets: Record<string, string> = {
                API_KEY: "resolved-api-key",
                DEEP_SECRET: "resolved-deep-secret",
            };
            const val = secrets[key];
            if (val) return val;
            throw new Error(`Secret "${key}" not found`);
        },
    };

    /**
     * WHAT: Resolves a top-level SECRET[xxx] string value.
     * WHY: Core behaviour — top-level config values like apiKey: SECRET[API_KEY] must be resolved.
     * STEPS:
     *   Arrange — create config with a SECRET[xxx] value
     *   Act — call resolveConfigSecrets
     *   Assert — the value is replaced with the resolved secret
     */
    void it("resolves top-level SECRET[xxx] values", () => {
        // --- Arrange ---
        const config: Record<string, unknown> = { apiKey: "SECRET[API_KEY]" };

        // --- Act ---
        resolveConfigSecrets(config, mockStore);

        // --- Assert ---
        assert.equal(config.apiKey, "resolved-api-key");
    });

    /**
     * WHAT: Resolves nested SECRET[xxx] in deeply nested objects.
     * WHY: Config files often have secrets in nested sections (e.g. ollama.apiKey).
     * STEPS:
     *   Arrange — create config with a nested SECRET[xxx]
     *   Act — call resolveConfigSecrets
     *   Assert — the nested value is replaced
     */
    void it("resolves nested SECRET[xxx] in deep objects", () => {
        // --- Arrange ---
        const config: Record<string, unknown> = {
            level1: { level2: { secret: "SECRET[DEEP_SECRET]" } },
        };

        // --- Act ---
        resolveConfigSecrets(config, mockStore);

        // --- Assert ---
        const nested = (config.level1 as Record<string, unknown>).level2 as Record<string, unknown>;
        assert.equal(nested.secret, "resolved-deep-secret");
    });

    /**
     * WHAT: Non-secret string values pass through unchanged.
     * WHY: Only values matching SECRET[xxx] should be resolved; plain strings must survive.
     * STEPS:
     *   Arrange — create config with plain string values
     *   Act — call resolveConfigSecrets
     *   Assert — values remain unchanged
     */
    void it("leaves non-secret strings untouched", () => {
        // --- Arrange ---
        const config: Record<string, unknown> = {
            name: "plain-value",
            url: "https://example.com",
        };

        // --- Act ---
        resolveConfigSecrets(config, mockStore);

        // --- Assert ---
        assert.equal(config.name, "plain-value");
        assert.equal(config.url, "https://example.com");
    });

    /**
     * WHAT: Non-string values (numbers, booleans) pass through unchanged.
     * WHY: The resolver must only process strings; other types should be untouched.
     * STEPS:
     *   Arrange — create config with number and boolean values
     *   Act — call resolveConfigSecrets
     *   Assert — values remain their original types and values
     */
    void it("passes through non-string values (numbers, booleans)", () => {
        // --- Arrange ---
        const config: Record<string, unknown> = { port: 3000, enabled: true };

        // --- Act ---
        resolveConfigSecrets(config, mockStore);

        // --- Assert ---
        assert.equal(config.port, 3000);
        assert.equal(config.enabled, true);
    });

    /**
     * WHAT: Arrays are not traversed (known limitation).
     * WHY: The implementation explicitly skips arrays — this test documents that behaviour.
     * STEPS:
     *   Arrange — create config with SECRET[xxx] inside an array
     *   Act — call resolveConfigSecrets
     *   Assert — the array element remains unresolved
     */
    void it("does not traverse arrays (known limitation)", () => {
        // --- Arrange ---
        const config: Record<string, unknown> = { items: ["SECRET[API_KEY]"] };

        // --- Act ---
        resolveConfigSecrets(config, mockStore);

        // --- Assert ---
        // Array elements are not resolved — this is documented behaviour
        assert.equal((config.items as string[])[0], "SECRET[API_KEY]");
    });

    /**
     * WHAT: Throws when getSecret() throws for a missing secret.
     * WHY: Missing secrets must propagate errors to prevent silent config corruption.
     * STEPS:
     *   Arrange — create config referencing a secret not in the mock store
     *   Act — call resolveConfigSecrets
     *   Assert — the function throws with the secret name in the message
     */
    void it("throws when getSecret() throws for a missing secret", () => {
        // --- Arrange ---
        const config: Record<string, unknown> = { key: "SECRET[UNKNOWN_KEY]" };

        // --- Act & Assert ---
        assert.throws(
            () => resolveConfigSecrets(config, mockStore),
            (err: unknown) => {
                assert.ok(err instanceof Error);
                assert.match(err.message, /UNKNOWN_KEY/);
                return true;
            },
        );
    });

    /**
     * WHAT: Empty object returns empty object without errors.
     * WHY: Edge case — empty config should not crash the resolver.
     * STEPS:
     *   Arrange — create an empty config object
     *   Act — call resolveConfigSecrets
     *   Assert — returns the same empty object
     */
    void it("returns empty object unchanged", () => {
        // --- Arrange ---
        const config: Record<string, unknown> = {};

        // --- Act ---
        const result = resolveConfigSecrets(config, mockStore);

        // --- Assert ---
        assert.deepStrictEqual(result, {});
    });

    /**
     * WHAT: Null values in config do not crash the resolver.
     * WHY: YAML can produce null values; the resolver must handle them gracefully.
     * STEPS:
     *   Arrange — create config with a null value alongside a valid secret
     *   Act — call resolveConfigSecrets
     *   Assert — null value remains null; the valid secret is still resolved
     */
    void it("handles null values without crashing", () => {
        // --- Arrange ---
        const config: Record<string, unknown> = {
            key: null,
            other: "SECRET[API_KEY]",
        };

        // --- Act ---
        resolveConfigSecrets(config, mockStore);

        // --- Assert ---
        assert.equal(config.key, null);
        // The non-null secret should still be resolved
        assert.equal(config.other, "resolved-api-key");
    });
});
