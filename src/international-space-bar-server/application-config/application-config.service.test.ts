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

    // ----------------------------------------------------------------
    // get() — typed key-path accessor (isb-0063)
    // ----------------------------------------------------------------

    /**
     * get() — two-overload type-safe dot-notation accessor (isb-0063).
     * Sig1 (required): throws ConfigurationException when key is absent or malformed.
     * Sig2 (with default): returns defaultValue when absent; throws when malformed.
     * Compile-time: DotKeys<AppConfig> constrains the key parameter to valid paths only.
     */
    void describe("get()", () => {
        let tmpGetDir: string;
        /** Config with server.port, server.host, server.enableCors, server.corsOrigins. */
        let fullGetConfigPath: string;
        /** Config with only version — no server block present. */
        let noServerGetConfigPath: string;

        before(() => {
            tmpGetDir = mkdtempSync(join(tmpdir(), "isb-get-test-"));

            fullGetConfigPath = join(tmpGetDir, "full.yaml");
            writeFileSync(
                fullGetConfigPath,
                [
                    "version: 1",
                    "server:",
                    "  port: 3001",
                    '  host: "127.0.0.1"',
                    "  enableCors: true",
                    "  corsOrigins:",
                    '    - "http://example.com"',
                ].join("\n") + "\n",
            );

            noServerGetConfigPath = join(tmpGetDir, "no-server.yaml");
            writeFileSync(noServerGetConfigPath, "version: 1\n");
        });

        after(() => {
            rmSync(tmpGetDir, { recursive: true });
        });

        /**
         * WHAT: Sig1 returns the configured port as a number.
         * WHY: T-01 — AC-1/AC-2: get("server.port") must return the typed port value.
         * STEPS:
         *   Arrange — service with config containing server.port: 3001
         *   Act — call get("server.port") with no default (Sig1)
         *   Assert — returns 3001 (number)
         */
        void it("T-01: get('server.port') returns the configured port number", () => {
            // --- Arrange ---
            process.env.ISB_PROJECT_ENVIRONMENT = "test";
            const service = new ApplicationConfigService({ config: fullGetConfigPath }, noopStore);

            // --- Act ---
            const port = service.get("server.port");

            // --- Assert ---
            // Must return the number from config, not undefined
            assert.equal(port, 3001);
        });

        /**
         * WHAT: Sig1 returns the configured host as a string.
         * WHY: T-02 — typed Sig1 must work for string leaf values.
         * STEPS:
         *   Arrange — service with config containing server.host: "127.0.0.1"
         *   Act — call get("server.host")
         *   Assert — returns "127.0.0.1"
         */
        void it("T-02: get('server.host') returns the configured host string", () => {
            // --- Arrange ---
            process.env.ISB_PROJECT_ENVIRONMENT = "test";
            const service = new ApplicationConfigService({ config: fullGetConfigPath }, noopStore);

            // --- Act ---
            const host = service.get("server.host");

            // --- Assert ---
            // Must return the string value, not undefined
            assert.equal(host, "127.0.0.1");
        });

        /**
         * WHAT: Sig2 returns the config value (not the default) when the key is present.
         * WHY: T-03 — AC-7: Sig2 must prefer the loaded value over the supplied default.
         * STEPS:
         *   Arrange — service with config containing server.port: 3001; default is 4000
         *   Act — call get("server.port", 4000) (Sig2)
         *   Assert — returns 3001, not 4000
         */
        void it("T-03: get('server.port', 4000) returns configured value when present", () => {
            // --- Arrange ---
            process.env.ISB_PROJECT_ENVIRONMENT = "test";
            const service = new ApplicationConfigService({ config: fullGetConfigPath }, noopStore);

            // --- Act ---
            const port = service.get("server.port", 4000);

            // --- Assert ---
            // The loaded config value (3001) must take precedence over the default (4000)
            assert.equal(port, 3001);
        });

        /**
         * WHAT: Sig2 returns defaultValue when the server block is absent from config.
         * WHY: T-04 — AC-7: Sig2 must return the default instead of throwing when absent.
         * STEPS:
         *   Arrange — service with config that has no server block (version: 1 only)
         *   Act — call get("server.port", 4000)
         *   Assert — returns 4000, no throw
         */
        void it("T-04: get('server.port', 4000) returns default when server block is absent", () => {
            // --- Arrange ---
            process.env.ISB_PROJECT_ENVIRONMENT = "test";
            const service = new ApplicationConfigService(
                { config: noServerGetConfigPath },
                noopStore,
            );

            // --- Act ---
            const port = service.get("server.port", 4000);

            // --- Assert ---
            // Traversal hits undefined at "server" → Sig2 returns the default, not throws
            assert.equal(port, 4000);
        });

        /**
         * WHAT: Empty key "" throws ConfigurationException immediately (malformation guard).
         * WHY: T-05 — AC-8: Malformed keys must be rejected before any traversal.
         *      Empty string is never a valid config path.
         * STEPS:
         *   Arrange — service with valid full config
         *   Act — call get("") which triggers the malformation guard
         *   Assert — throws ConfigurationException with a message identifying the bad key
         *
         * NOTE: @ts-expect-error suppresses the compile-time error; the malformation
         * guard fires at runtime before any traversal occurs.
         */
        void it("T-05: get('') throws ConfigurationException for empty key", () => {
            // --- Arrange ---
            process.env.ISB_PROJECT_ENVIRONMENT = "test";
            const service = new ApplicationConfigService({ config: fullGetConfigPath }, noopStore);

            // --- Act & Assert ---
            assert.throws(
                () => {
                    // @ts-expect-error — T-05: "" is not in DotKeys<AppConfig>; malformation guard tested at runtime
                    service.get("");
                },
                (err: unknown) => {
                    // Malformation guard must throw ConfigurationException, not traverse
                    assert.ok(err instanceof ConfigurationException);
                    assert.match(err.message, /Malformed config key/);
                    return true;
                },
            );
        });

        /**
         * WHAT: Leading-dot key ".server.port" throws ConfigurationException (malformation guard).
         * WHY: T-06 — AC-8: Keys that start with a dot are syntactically invalid;
         *      the guard must catch them before traversal.
         * STEPS:
         *   Arrange — service with valid full config
         *   Act — call get(".server.port") which triggers startsWith(".") check
         *   Assert — throws ConfigurationException with a message identifying the bad key
         *
         * NOTE: @ts-expect-error suppresses the compile-time error.
         */
        void it("T-06: get('.server.port') throws ConfigurationException for leading dot", () => {
            // --- Arrange ---
            process.env.ISB_PROJECT_ENVIRONMENT = "test";
            const service = new ApplicationConfigService({ config: fullGetConfigPath }, noopStore);

            // --- Act & Assert ---
            assert.throws(
                () => {
                    // @ts-expect-error — T-06: ".server.port" is not in DotKeys<AppConfig>; malformation guard tested at runtime
                    service.get(".server.port");
                },
                (err: unknown) => {
                    // Leading dot must be rejected by the malformation guard
                    assert.ok(err instanceof ConfigurationException);
                    assert.match(err.message, /Malformed config key/);
                    return true;
                },
            );
        });

        /**
         * WHAT: Trailing-dot key "server.port." throws ConfigurationException (malformation guard).
         * WHY: T-07 — AC-8: Keys that end with a dot are syntactically invalid;
         *      the guard must catch them before traversal.
         * STEPS:
         *   Arrange — service with valid full config
         *   Act — call get("server.port.") which triggers endsWith(".") check
         *   Assert — throws ConfigurationException with a message identifying the bad key
         *
         * NOTE: @ts-expect-error suppresses the compile-time error.
         */
        void it("T-07: get('server.port.') throws ConfigurationException for trailing dot", () => {
            // --- Arrange ---
            process.env.ISB_PROJECT_ENVIRONMENT = "test";
            const service = new ApplicationConfigService({ config: fullGetConfigPath }, noopStore);

            // --- Act & Assert ---
            assert.throws(
                () => {
                    // @ts-expect-error — T-07: "server.port." is not in DotKeys<AppConfig>; malformation guard tested at runtime
                    service.get("server.port.");
                },
                (err: unknown) => {
                    // Trailing dot must be rejected by the malformation guard
                    assert.ok(err instanceof ConfigurationException);
                    assert.match(err.message, /Malformed config key/);
                    return true;
                },
            );
        });

        /**
         * WHAT: Consecutive-dots key "server..port" throws ConfigurationException (malformation guard).
         * WHY: T-08 — AC-8: Double dots are syntactically invalid;
         *      the guard must catch them before traversal.
         * STEPS:
         *   Arrange — service with valid full config
         *   Act — call get("server..port") which triggers includes("..") check
         *   Assert — throws ConfigurationException with a message identifying the bad key
         *
         * NOTE: @ts-expect-error suppresses the compile-time error.
         */
        void it("T-08: get('server..port') throws ConfigurationException for consecutive dots", () => {
            // --- Arrange ---
            process.env.ISB_PROJECT_ENVIRONMENT = "test";
            const service = new ApplicationConfigService({ config: fullGetConfigPath }, noopStore);

            // --- Act & Assert ---
            assert.throws(
                () => {
                    // @ts-expect-error — T-08: "server..port" is not in DotKeys<AppConfig>; malformation guard tested at runtime
                    service.get("server..port");
                },
                (err: unknown) => {
                    // Consecutive dots must be rejected by the malformation guard
                    assert.ok(err instanceof ConfigurationException);
                    assert.match(err.message, /Malformed config key/);
                    return true;
                },
            );
        });

        /**
         * WHAT: Sig2 with a malformed key throws ConfigurationException even when a defaultValue is supplied.
         * WHY: T-09 — AC-8: The malformation guard fires before the absent-key fallback.
         *      defaultValue must NOT suppress malformation errors — only absent-key errors.
         * STEPS:
         *   Arrange — service with valid full config; use empty key "" with a default of 4000
         *   Act — call get("", 4000) (Sig2 with malformed key)
         *   Assert — throws ConfigurationException; the default is never returned
         *
         * NOTE: @ts-expect-error suppresses the compile-time error.
         */
        void it("T-09: get('', 4000) throws ConfigurationException for malformed key even with default", () => {
            // --- Arrange ---
            process.env.ISB_PROJECT_ENVIRONMENT = "test";
            const service = new ApplicationConfigService({ config: fullGetConfigPath }, noopStore);

            // --- Act & Assert ---
            assert.throws(
                () => {
                    // @ts-expect-error — T-09: "" is not in DotKeys<AppConfig>; malformation guard fires before absent-key fallback
                    service.get("", 4000);
                },
                (err: unknown) => {
                    // Malformation guard must override the Sig2 default-value fallback
                    assert.ok(err instanceof ConfigurationException);
                    assert.match(err.message, /Malformed config key/);
                    return true;
                },
            );
        });

        /**
         * WHAT: Sig1 returns a boolean for server.enableCors when the flag is set.
         * WHY: T-05b — typed access must work for optional boolean leaf fields.
         * STEPS:
         *   Arrange — service with config containing server.enableCors: true
         *   Act — call get("server.enableCors")
         *   Assert — returns true (boolean)
         */
        void it("T-05b: get('server.enableCors') returns boolean when present", () => {
            // --- Arrange ---
            process.env.ISB_PROJECT_ENVIRONMENT = "test";
            const service = new ApplicationConfigService({ config: fullGetConfigPath }, noopStore);

            // --- Act ---
            const enableCors = service.get("server.enableCors");

            // --- Assert ---
            // Must return the boolean true from config, not undefined
            assert.equal(enableCors, true);
        });

        /**
         * WHAT: Sig1 returns a string array for server.corsOrigins when present.
         * WHY: T-06b — typed access must work for optional array leaf fields.
         * STEPS:
         *   Arrange — service with config containing server.corsOrigins: ["http://example.com"]
         *   Act — call get("server.corsOrigins")
         *   Assert — returns a string array with the configured origin
         */
        void it("T-06b: get('server.corsOrigins') returns string array when present", () => {
            // --- Arrange ---
            process.env.ISB_PROJECT_ENVIRONMENT = "test";
            const service = new ApplicationConfigService({ config: fullGetConfigPath }, noopStore);

            // --- Act ---
            const corsOrigins = service.get("server.corsOrigins");

            // --- Assert ---
            assert.ok(Array.isArray(corsOrigins), "corsOrigins must be an array");
            // The array must contain exactly the one origin from the config
            assert.equal(corsOrigins?.length, 1);
            assert.equal(corsOrigins?.[0], "http://example.com");
        });

        /**
         * WHAT: TypeScript rejects get("server.nonExistentKey") with a type error.
         * WHY: T-07b — AC-1: DotKeys<AppConfig> must exclude invalid key paths at compile time.
         * STEPS:
         *   Arrange — service with valid config
         *   Act — call get("server.nonExistentKey") guarded with @ts-expect-error
         *   Assert — compile-time gate: @ts-expect-error is consumed by the type error;
         *            runtime: the absent key also throws ConfigurationException via Sig1
         *
         * NOTE: tsx strips types so the call executes at runtime — it throws because
         * "server.nonExistentKey" is absent from the loaded config (Sig1 behaviour).
         * The @ts-expect-error confirms the compile-time rejection. If DotKeys<AppConfig>
         * is broadened to plain string, the directive becomes unused and tsc emits TS2578.
         */
        void it("T-07b: compile-time — 'server.nonExistentKey' is rejected by the type system", () => {
            // --- Arrange ---
            process.env.ISB_PROJECT_ENVIRONMENT = "test";
            const service = new ApplicationConfigService({ config: fullGetConfigPath }, noopStore);

            // --- Act & Assert ---
            // Compile-time gate: @ts-expect-error consumed by type error
            // Runtime behaviour: Sig1 throws because the key is absent in the loaded config
            assert.throws(
                () => {
                    // @ts-expect-error — T-07b: "server.nonExistentKey" is not in DotKeys<AppConfig>
                    service.get("server.nonExistentKey");
                },
                (err: unknown) => {
                    assert.ok(err instanceof ConfigurationException);
                    return true;
                },
            );
        });

        /**
         * WHAT: Sig1 throws ConfigurationException when server block is absent from config.
         * WHY: T-08b — AC-6: Sig1 (no default) must throw for any absent key path.
         * STEPS:
         *   Arrange — service with config that has no server block
         *   Act — call get("server.port") with no default (Sig1)
         *   Assert — throws ConfigurationException referencing the missing key
         */
        void it("T-08b: get('server.port') throws ConfigurationException when key is absent", () => {
            // --- Arrange ---
            process.env.ISB_PROJECT_ENVIRONMENT = "test";
            const service = new ApplicationConfigService(
                { config: noServerGetConfigPath },
                noopStore,
            );

            // --- Act & Assert ---
            assert.throws(
                () => service.get("server.port"),
                (err: unknown) => {
                    // Must throw ConfigurationException, not a generic error
                    assert.ok(err instanceof ConfigurationException);
                    // Message must name the missing key so the caller can diagnose the gap
                    assert.match(err.message, /server\.port/);
                    return true;
                },
            );
        });

        /**
         * WHAT: Sig2 returns the default when the entire server block is absent.
         * WHY: T-09b — AC-7: Sig2 must handle absent parent objects gracefully.
         * STEPS:
         *   Arrange — service with config that has no server block (version: 1 only)
         *   Act — call get("server.port", 3000) (Sig2 with default 3000)
         *   Assert — returns 3000 (the default), no throw
         */
        void it("T-09b: get('server.port', 3000) returns default when entire server block is absent", () => {
            // --- Arrange ---
            process.env.ISB_PROJECT_ENVIRONMENT = "test";
            const service = new ApplicationConfigService(
                { config: noServerGetConfigPath },
                noopStore,
            );

            // --- Act ---
            const port = service.get("server.port", 3000);

            // --- Assert ---
            // With no server block, traversal hits undefined; Sig2 returns the default
            assert.equal(port, 3000);
        });

        /**
         * WHAT: TypeScript rejects get("environment") — the virtual key was removed from get().
         * WHY: T-10 — AC-4: "environment" is not in DotKeys<AppConfig>; access it via .environment.
         * STEPS:
         *   Arrange — service with valid config
         *   Act — call get("environment") wrapped in assert.throws (compile + runtime gate)
         *         assert .environment is still accessible as a direct field
         *   Assert — compile-time: @ts-expect-error consumed; runtime: throws + .environment = "test"
         *
         * NOTE: tsx strips types so the call executes at runtime — "environment" is not in
         * ConfigSchema, so traversal returns undefined and Sig1 throws ConfigurationException.
         * The @ts-expect-error confirms the compile-time rejection.
         * The direct .environment assertion proves the correct access pattern still works.
         */
        void it("T-10: 'environment' is not accessible via get() — only via .environment", () => {
            // --- Arrange ---
            process.env.ISB_PROJECT_ENVIRONMENT = "test";
            const service = new ApplicationConfigService({ config: fullGetConfigPath }, noopStore);

            // --- Act & Assert (compile-time gate + runtime throw) ---
            assert.throws(
                () => {
                    // @ts-expect-error — T-10: "environment" is not in DotKeys<AppConfig>
                    service.get("environment");
                },
                (err: unknown) => {
                    assert.ok(err instanceof ConfigurationException);
                    return true;
                },
            );

            // Direct property access is the correct pattern — runtime assertion
            assert.equal(service.environment, "test");
        });

        /**
         * WHAT: TypeScript rejects get("server.port", "3000") — wrong type for defaultValue.
         * WHY: T-11 — AC-2: Sig2 must enforce that defaultValue matches DotValue<AppConfig, K>.
         * STEPS:
         *   Arrange — service with valid config
         *   Act — call get("server.port", "3000") guarded with @ts-expect-error
         *   Assert — compile-time gate: DotValue<AppConfig, "server.port"> is number, not string
         *
         * NOTE: No runtime assertion — compile-time gate only.
         * The @ts-expect-error proves the overload enforces type alignment between
         * the key path and its default value.
         */
        void it("T-11: compile-time — get('server.port', '3000') rejects string default for number key", () => {
            process.env.ISB_PROJECT_ENVIRONMENT = "test";
            const service = new ApplicationConfigService({ config: fullGetConfigPath }, noopStore);

            // @ts-expect-error — T-11: "3000" (string) is not assignable to DotValue<AppConfig, "server.port"> (number)
            service.get("server.port", "3000");
        });
    });
});
