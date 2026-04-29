/**
 * Tests for: ApplicationConfigService and ApplicationConfigModule factory
 * Source: src/international-space-bar-server/application-config/application-config.service.ts
 * Ticket: isb-0044
 *
 * Purpose: Verifies config loading from YAML files, secret resolution,
 * Zod validation, config path precedence, DI factory behaviour,
 * and error handling for missing/invalid configs.
 */
import "reflect-metadata";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import { Test } from "@nestjs/testing";
import { ConfigurationException } from "../common/exceptions/index.js";
import type { ISecretsStore } from "../common/interfaces/index.js";
import { SECRETS_STORE } from "../common/interfaces/index.js";
import { ApplicationConfigModule } from "./application-config.module.js";
import { ApplicationConfigService } from "./application-config.service.js";
import { CLI_ARGS } from "./cli-args.js";
import { SecretsStoreSelectorService } from "./secrets-store-selector.service.js";

/**
 * ApplicationConfigService — loads YAML config, resolves secrets, validates via Zod.
 * Also tests the ApplicationConfigModule DI factory for SECRETS_STORE.
 */
void describe("ApplicationConfigService", () => {
    // ----------------------------------------------------------------
    // Shared fixtures
    // ----------------------------------------------------------------
    let tmpDir: string;
    let validConfigPath: string;
    let secretsConfigPath: string;
    let invalidSchemaPath: string;
    let nonObjectYamlPath: string;
    let alternateConfigPath: string;

    /** No-op secrets store — returns empty strings, never called in valid configs. */
    const noopStore: ISecretsStore = {
        getSecret(): string {
            return "";
        },
    };

    const ENV_KEYS = ["ISB_PROJECT_ENVIRONMENT", "ISB_CONFIG_PATH"] as const;
    let savedEnv: Record<string, string | undefined>;

    before(() => {
        tmpDir = mkdtempSync(join(tmpdir(), "isb-config-test-"));

        validConfigPath = join(tmpDir, "valid.yaml");
        writeFileSync(validConfigPath, 'version: 1\nserver:\n  port: 3001\n  host: "127.0.0.1"\n');

        secretsConfigPath = join(tmpDir, "secrets.yaml");
        writeFileSync(
            secretsConfigPath,
            'version: 1\nollama:\n  baseUrl: "https://example.com"\n  apiKey: SECRET[TEST_API_KEY]\n',
        );

        invalidSchemaPath = join(tmpDir, "invalid-schema.yaml");
        writeFileSync(invalidSchemaPath, 'version: "not-a-number"\n');

        nonObjectYamlPath = join(tmpDir, "non-object.yaml");
        writeFileSync(nonObjectYamlPath, "42\n");

        alternateConfigPath = join(tmpDir, "alternate.yaml");
        writeFileSync(
            alternateConfigPath,
            'version: 2\nserver:\n  port: 9999\n  host: "0.0.0.0"\n',
        );
    });

    after(() => {
        rmSync(tmpDir, { recursive: true });
    });

    beforeEach(() => {
        savedEnv = {};
        for (const key of ENV_KEYS) {
            savedEnv[key] = process.env[key];
        }
    });

    afterEach(() => {
        for (const key of ENV_KEYS) {
            if (savedEnv[key] === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = savedEnv[key];
            }
        }
    });

    // ----------------------------------------------------------------
    // Constructor and basic loading
    // ----------------------------------------------------------------

    /**
     * ApplicationConfigService constructor — instantiation with mocks.
     */
    void describe("constructor", () => {
        /**
         * WHAT: Constructor accepts an ISecretsStore mock and loads config.
         * WHY: Verifies the service can be instantiated with a mock store (AC #1).
         * STEPS:
         *   Arrange — prepare CLI args pointing to a valid temp config
         *   Act — instantiate the service
         *   Assert — service exists and loaded the correct environment
         */
        void it("accepts ISecretsStore mock and loads config", () => {
            // --- Arrange ---
            process.env.ISB_PROJECT_ENVIRONMENT = "test";

            // --- Act ---
            const service = new ApplicationConfigService({ config: validConfigPath }, noopStore);

            // --- Assert ---
            assert.ok(service);
            assert.equal(service.environment, "test");
        });
    });

    // ----------------------------------------------------------------
    // Config path resolution
    // ----------------------------------------------------------------

    /**
     * Config path resolution — --config CLI arg, ISB_CONFIG_PATH env var,
     * and default path from cwd + environment.
     */
    void describe("config path resolution", () => {
        /**
         * WHAT: Uses --config CLI arg to locate the config file.
         * WHY: CLI arg is the highest-precedence config path override.
         * STEPS:
         *   Arrange — set cliArgs.config to the temp config path
         *   Act — instantiate the service
         *   Assert — config loads successfully from the specified path
         */
        void it("uses --config CLI arg for config path", () => {
            // --- Arrange ---
            process.env.ISB_PROJECT_ENVIRONMENT = "test";

            // --- Act ---
            const service = new ApplicationConfigService({ config: validConfigPath }, noopStore);

            // --- Assert ---
            assert.equal(service.getConfig().version, 1);
            assert.equal(service.getConfig().server?.port, 3001);
        });

        /**
         * WHAT: Uses ISB_CONFIG_PATH env var when --config is not set.
         * WHY: Env var is the second-precedence config path override.
         * STEPS:
         *   Arrange — set ISB_CONFIG_PATH env var, do not set cliArgs.config
         *   Act — instantiate the service
         *   Assert — config loads from the env var path
         */
        void it("uses ISB_CONFIG_PATH env var when --config is not set", () => {
            // --- Arrange ---
            process.env.ISB_PROJECT_ENVIRONMENT = "test";
            process.env.ISB_CONFIG_PATH = validConfigPath;

            // --- Act ---
            const service = new ApplicationConfigService({}, noopStore);

            // --- Assert ---
            assert.equal(service.getConfig().version, 1);
        });

        /**
         * WHAT: Uses default path (config.<env>.yaml in cwd) when no overrides.
         * WHY: The default path must work for standard project layouts.
         * STEPS:
         *   Arrange — set environment to "test", clear config overrides
         *   Act — instantiate the service (relies on config.test.yaml in project root)
         *   Assert — config loads successfully
         */
        void it("uses default config path when no overrides are set", () => {
            // --- Arrange ---
            process.env.ISB_PROJECT_ENVIRONMENT = "test";
            delete process.env.ISB_CONFIG_PATH;

            // --- Act ---
            const service = new ApplicationConfigService({}, noopStore);

            // --- Assert ---
            // config.test.yaml in project root has version: 1
            assert.equal(service.getConfig().version, 1);
            assert.equal(service.environment, "test");
        });

        /**
         * WHAT: --config CLI arg overrides ISB_CONFIG_PATH env var.
         * WHY: CLI args must take precedence over env vars.
         * STEPS:
         *   Arrange — set ISB_CONFIG_PATH to a nonexistent path, set cliArgs.config to valid path
         *   Act — instantiate the service
         *   Assert — config loads from CLI arg path (would throw if env var path were used)
         */
        void it("--config overrides ISB_CONFIG_PATH", () => {
            // --- Arrange ---
            process.env.ISB_PROJECT_ENVIRONMENT = "test";
            // This path does not exist — if the service used it, construction would throw
            process.env.ISB_CONFIG_PATH = "/nonexistent/should-not-be-used.yaml";

            // --- Act ---
            const service = new ApplicationConfigService({ config: validConfigPath }, noopStore);

            // --- Assert ---
            // If we reach here, --config took precedence over the nonexistent ISB_CONFIG_PATH
            assert.equal(service.getConfig().version, 1);
        });
    });

    // ----------------------------------------------------------------
    // DI factory tests (ApplicationConfigModule)
    // ----------------------------------------------------------------

    /**
     * ApplicationConfigModule SECRETS_STORE factory — selects the secrets
     * backend based on CLI args.secretStore.
     */
    void describe("ApplicationConfigModule SECRETS_STORE factory", () => {
        /**
         * WHAT: Selector returns a working ISecretsStore when backend is "env".
         * WHY: AC #6 — the "env" backend must resolve to a functioning secrets store.
         * STEPS:
         *   Arrange — override CLI_ARGS with secretStore: "env" and valid config path
         *   Act — compile the module and retrieve SECRETS_STORE
         *   Assert — the resolved store is an instance of SecretsStoreSelectorService
         */
        void it('returns SecretsStoreSelectorService for "env" backend', async () => {
            // --- Arrange ---
            process.env.ISB_PROJECT_ENVIRONMENT = "test";

            // --- Act ---
            const moduleRef = await Test.createTestingModule({
                imports: [ApplicationConfigModule],
            })
                .overrideProvider(CLI_ARGS)
                .useValue({ secretStore: "env", config: validConfigPath })
                .compile();

            try {
                const store: ISecretsStore = moduleRef.get(SECRETS_STORE);

                // --- Assert ---
                assert.ok(store instanceof SecretsStoreSelectorService);
            } finally {
                await moduleRef.close();
            }
        });

        /**
         * WHAT: Factory throws ConfigurationException for unknown backend.
         * WHY: AC #7 — unsupported backends must fail fast with a clear error.
         * STEPS:
         *   Arrange — override CLI_ARGS with secretStore: "unknown"
         *   Act — attempt to compile the module
         *   Assert — compile rejects with ConfigurationException
         */
        void it("throws ConfigurationException for unknown backend", async () => {
            // --- Arrange ---
            process.env.ISB_PROJECT_ENVIRONMENT = "test";

            // --- Act & Assert ---
            await assert.rejects(
                async () => {
                    await Test.createTestingModule({
                        imports: [ApplicationConfigModule],
                    })
                        .overrideProvider(CLI_ARGS)
                        .useValue({
                            secretStore: "unknown",
                            config: validConfigPath,
                        })
                        .compile();
                },
                (err: unknown) => {
                    assert.ok(err instanceof ConfigurationException);
                    assert.match(err.message, /not implemented/);
                    return true;
                },
            );
        });

        /**
         * WHAT: Factory defaults to "env" when no secret-store flag is set.
         * WHY: AC #8 — the default backend must be "env" for zero-config usage.
         * STEPS:
         *   Arrange — override CLI_ARGS with no secretStore field
         *   Act — compile the module and retrieve SECRETS_STORE
         *   Assert — the resolved store is SecretsStoreSelectorService (env backend)
         */
        void it('defaults to "env" when no secret-store flag is set', async () => {
            // --- Arrange ---
            process.env.ISB_PROJECT_ENVIRONMENT = "test";

            // --- Act ---
            const moduleRef = await Test.createTestingModule({
                imports: [ApplicationConfigModule],
            })
                .overrideProvider(CLI_ARGS)
                .useValue({ config: validConfigPath })
                .compile();

            try {
                const store: ISecretsStore = moduleRef.get(SECRETS_STORE);
                // --- Assert ---
                assert.ok(store instanceof SecretsStoreSelectorService);
            } finally {
                await moduleRef.close();
            }
        });
    });

    // ----------------------------------------------------------------
    // getConfig() behaviour
    // ----------------------------------------------------------------

    /**
     * getConfig() — returns validated, frozen configuration.
     */
    void describe("getConfig()", () => {
        /**
         * WHAT: getConfig() returns a typed AppConfig with expected values.
         * WHY: AC #9 — the service must expose the parsed config for consumers.
         * STEPS:
         *   Arrange — instantiate service with a known config file
         *   Act — call getConfig()
         *   Assert — returned object has correct version, server.port, server.host
         */
        void it("returns typed AppConfig with expected values", () => {
            // --- Arrange ---
            process.env.ISB_PROJECT_ENVIRONMENT = "test";
            const service = new ApplicationConfigService({ config: validConfigPath }, noopStore);

            // --- Act ---
            const config = service.getConfig();

            // --- Assert ---
            assert.equal(config.version, 1);
            assert.equal(config.server?.port, 3001);
            assert.equal(config.server?.host, "127.0.0.1");
        });

        /**
         * WHAT: Config object is frozen after load (immutable).
         * WHY: AC #10 — config must not be mutated after loading to prevent runtime surprises.
         * STEPS:
         *   Arrange — instantiate service
         *   Act — call getConfig()
         *   Assert — Object.isFrozen returns true
         */
        void it("returns a frozen config object", () => {
            // --- Arrange ---
            process.env.ISB_PROJECT_ENVIRONMENT = "test";
            const service = new ApplicationConfigService({ config: validConfigPath }, noopStore);

            // --- Act ---
            const config = service.getConfig();

            // --- Assert ---
            assert.ok(Object.isFrozen(config));
        });
    });

    // ----------------------------------------------------------------
    // Secret resolution
    // ----------------------------------------------------------------

    /**
     * Secret resolution — secrets must be resolved before Zod validation.
     */
    void describe("secret resolution", () => {
        /**
         * WHAT: SECRET[xxx] values are resolved via the store before Zod validation.
         * WHY: AC #12 — secrets must be resolved so Zod sees actual values, not placeholders.
         * STEPS:
         *   Arrange — create a tracking store; use a config with SECRET[TEST_API_KEY]
         *   Act — instantiate the service
         *   Assert — getSecret was called; resolved value appears in final config
         */
        void it("resolves secrets before Zod validation", () => {
            // --- Arrange ---
            process.env.ISB_PROJECT_ENVIRONMENT = "test";
            let secretResolved = false;
            const trackingStore: ISecretsStore = {
                getSecret(_key: string): string {
                    secretResolved = true;
                    return "resolved-secret-value";
                },
            };

            // --- Act ---
            const service = new ApplicationConfigService(
                { config: secretsConfigPath },
                trackingStore,
            );

            // --- Assert ---
            // The store's getSecret must have been called during config loading
            assert.ok(secretResolved, "getSecret() should have been called during config loading");
            // The resolved value must appear in the final config
            assert.equal(service.getConfig().ollama?.apiKey, "resolved-secret-value");
        });
    });

    // ----------------------------------------------------------------
    // Error handling
    // ----------------------------------------------------------------

    /**
     * Error handling — ConfigurationException for invalid inputs.
     */
    void describe("error handling", () => {
        /**
         * WHAT: Throws ConfigurationException when Zod validation fails.
         * WHY: AC #11 — schema violations must produce clear config errors.
         * STEPS:
         *   Arrange — use a config file where version is a string (not number)
         *   Act — instantiate the service
         *   Assert — constructor throws ConfigurationException
         */
        void it("throws ConfigurationException on Zod validation failure", () => {
            // --- Arrange ---
            process.env.ISB_PROJECT_ENVIRONMENT = "test";

            // --- Act & Assert ---
            assert.throws(
                () => new ApplicationConfigService({ config: invalidSchemaPath }, noopStore),
                (err: unknown) => {
                    assert.ok(err instanceof ConfigurationException);
                    assert.match(err.message, /Config validation failed/);
                    return true;
                },
            );
        });

        /**
         * WHAT: Throws ConfigurationException when config file does not exist.
         * WHY: AC #13 — missing config files must fail fast with actionable message.
         * STEPS:
         *   Arrange — set cliArgs.config to a nonexistent path
         *   Act — instantiate the service
         *   Assert — constructor throws ConfigurationException with path in message
         */
        void it("throws ConfigurationException for missing config file", () => {
            // --- Arrange ---
            process.env.ISB_PROJECT_ENVIRONMENT = "test";

            // --- Act & Assert ---
            assert.throws(
                () =>
                    new ApplicationConfigService(
                        { config: "/nonexistent/path/config.yaml" },
                        noopStore,
                    ),
                (err: unknown) => {
                    assert.ok(err instanceof ConfigurationException);
                    assert.match(err.message, /Cannot read config file/);
                    return true;
                },
            );
        });

        /**
         * WHAT: Throws ConfigurationException when YAML content is not an object.
         * WHY: AC #14 — config files that parse to non-objects must be rejected.
         * STEPS:
         *   Arrange — use a config file containing a bare number (parses to non-object)
         *   Act — instantiate the service
         *   Assert — constructor throws ConfigurationException
         */
        void it("throws ConfigurationException for invalid YAML content", () => {
            // --- Arrange ---
            process.env.ISB_PROJECT_ENVIRONMENT = "test";

            // --- Act & Assert ---
            assert.throws(
                () => new ApplicationConfigService({ config: nonObjectYamlPath }, noopStore),
                (err: unknown) => {
                    assert.ok(err instanceof ConfigurationException);
                    assert.match(err.message, /empty or invalid YAML/);
                    return true;
                },
            );
        });
    });
});
