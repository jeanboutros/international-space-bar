/**
 * Tests for: parseCliArgs utility
 * Source: src/international-space-bar-server/application-config/cli-args.ts
 * Ticket: isb-0044
 *
 * Purpose: Verifies that CLI arguments (--environment, --config, --secret-store)
 * are correctly parsed from process.argv, including short flags and combined usage.
 */
import "reflect-metadata";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { parseCliArgs } from "./cli-args.js";

/**
 * parseCliArgs — parses CLI flags from process.argv using node:util parseArgs.
 * Tests override process.argv before each call and restore after.
 */
void describe("parseCliArgs", () => {
    let originalArgv: string[];

    beforeEach(() => {
        originalArgv = process.argv;
    });

    afterEach(() => {
        process.argv = originalArgv;
    });

    /**
     * WHAT: Parses --environment dev from process.argv.
     * WHY: The --environment flag selects the config environment (dev/test/prod).
     * STEPS:
     *   Arrange — set process.argv with --environment dev
     *   Act — call parseCliArgs
     *   Assert — result.environment is "dev"
     */
    void it("parses --environment dev", () => {
        // --- Arrange ---
        process.argv = ["node", "script.js", "--environment", "dev"];

        // --- Act ---
        const result = parseCliArgs();

        // --- Assert ---
        assert.equal(result.environment, "dev");
    });

    /**
     * WHAT: Parses -e prod (short flag for --environment).
     * WHY: Short flags provide a convenient CLI UX; they must map correctly.
     * STEPS:
     *   Arrange — set process.argv with -e prod
     *   Act — call parseCliArgs
     *   Assert — result.environment is "prod"
     */
    void it("parses -e prod (short flag)", () => {
        // --- Arrange ---
        process.argv = ["node", "script.js", "-e", "prod"];

        // --- Act ---
        const result = parseCliArgs();

        // --- Assert ---
        assert.equal(result.environment, "prod");
    });

    /**
     * WHAT: Parses --config /path/to/file.yaml.
     * WHY: The --config flag overrides the default config file path.
     * STEPS:
     *   Arrange — set process.argv with --config and an absolute path
     *   Act — call parseCliArgs
     *   Assert — result.config is the provided path
     */
    void it("parses --config with absolute path", () => {
        // --- Arrange ---
        process.argv = ["node", "script.js", "--config", "/path/to/file.yaml"];

        // --- Act ---
        const result = parseCliArgs();

        // --- Assert ---
        assert.equal(result.config, "/path/to/file.yaml");
    });

    /**
     * WHAT: Parses -c ./relative.yaml (short flag for --config).
     * WHY: Short flags and relative paths must be supported.
     * STEPS:
     *   Arrange — set process.argv with -c and a relative path
     *   Act — call parseCliArgs
     *   Assert — result.config is the provided relative path
     */
    void it("parses -c with relative path (short flag)", () => {
        // --- Arrange ---
        process.argv = ["node", "script.js", "-c", "./relative.yaml"];

        // --- Act ---
        const result = parseCliArgs();

        // --- Assert ---
        assert.equal(result.config, "./relative.yaml");
    });

    /**
     * WHAT: Parses --secret-store env.
     * WHY: The --secret-store flag selects the secrets backend.
     * STEPS:
     *   Arrange — set process.argv with --secret-store env
     *   Act — call parseCliArgs
     *   Assert — result.secretStore is "env"
     */
    void it("parses --secret-store env", () => {
        // --- Arrange ---
        process.argv = ["node", "script.js", "--secret-store", "env"];

        // --- Act ---
        const result = parseCliArgs();

        // --- Assert ---
        assert.equal(result.secretStore, "env");
    });

    /**
     * WHAT: Parses all flags combined in a single invocation.
     * WHY: Real CLI usage often combines multiple flags; they must not interfere.
     * STEPS:
     *   Arrange — set process.argv with all three flags
     *   Act — call parseCliArgs
     *   Assert — all three fields are populated correctly
     */
    void it("parses all flags combined", () => {
        // --- Arrange ---
        process.argv = [
            "node",
            "script.js",
            "--environment",
            "prod",
            "--config",
            "/custom/config.yaml",
            "--secret-store",
            "env",
        ];

        // --- Act ---
        const result = parseCliArgs();

        // --- Assert ---
        assert.equal(result.environment, "prod");
        assert.equal(result.config, "/custom/config.yaml");
        assert.equal(result.secretStore, "env");
    });

    /**
     * WHAT: Returns empty object when no flags are provided.
     * WHY: The service falls back to env vars and defaults when CLI args are absent.
     * STEPS:
     *   Arrange — set process.argv with no flags
     *   Act — call parseCliArgs
     *   Assert — all fields are undefined
     */
    void it("returns empty object when no flags are provided", () => {
        // --- Arrange ---
        process.argv = ["node", "script.js"];

        // --- Act ---
        const result = parseCliArgs();

        // --- Assert ---
        assert.equal(result.environment, undefined);
        assert.equal(result.config, undefined);
        assert.equal(result.secretStore, undefined);
    });

    /**
     * WHAT: Unknown flags do not cause a crash (strict: false).
     * WHY: parseArgs is configured with strict:false so unknown flags are ignored.
     * STEPS:
     *   Arrange — set process.argv with an unknown flag alongside a known flag
     *   Act — call parseCliArgs
     *   Assert — no error thrown; known fields are still parsed correctly
     */
    void it("ignores unknown flags without crashing (strict: false)", () => {
        // --- Arrange ---
        process.argv = ["node", "script.js", "--unknown-flag", "-e", "test"];

        // --- Act ---
        const result = parseCliArgs();

        // --- Assert ---
        // Unknown flag is silently ignored; known flag is parsed
        assert.equal(result.environment, "test");
    });
});
