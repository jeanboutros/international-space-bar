import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Inject, Injectable } from "@nestjs/common";
import { parse as parseYaml } from "yaml";
import { ConfigurationException } from "../common/exceptions/index.js";
import {
    type ISecretsStore,
    type ProjectEnvironment,
    SECRETS_STORE,
    VALID_ENVIRONMENTS,
} from "../common/interfaces/index.js";
import { CLI_ARGS, type CliArgs } from "./cli-args.js";
import { type AppConfig, ConfigSchema } from "./config.schema.js";
import { resolveConfigSecrets } from "./resolve-config-secrets.js";

// ---------------------------------------------------------------------------
// Typed key-path helpers
// ---------------------------------------------------------------------------

/**
 * Strips index signatures from an object type, preserving only named keys.
 * Required because z.looseObject() adds [key: string]: unknown to the inferred
 * type — without stripping it, DotKeys<T> collapses to plain string.
 */
type StripIndex<T> = {
    [K in keyof T as string extends K ? never : K]: T[K];
};

/**
 * Recursively generates dot-separated key paths for all named properties of T.
 * NonNullable is applied at each recursion level so that optional parent objects
 * (e.g. server?: { port: number }) are traversed without collapsing to never.
 */
type DotKeys<T> = {
    [K in keyof StripIndex<T> & string]: NonNullable<StripIndex<T>[K]> extends Record<
        string,
        unknown
    >
        ? `${K}` | `${K}.${DotKeys<NonNullable<StripIndex<T>[K]>>}`
        : `${K}`;
}[keyof StripIndex<T> & string];

/**
 * Resolves the leaf value type for a given dot-notation path K within type T.
 *
 * NOTE: For paths where a parent is optional (e.g. server?: { port: number }),
 * the resolved type may include undefined even if the leaf field itself is
 * required. At runtime, Sig1 throws and Sig2 returns the supplied default.
 */
type DotValue<T, K extends string> = K extends `${infer Head}.${infer Tail}`
    ? Head extends keyof StripIndex<T>
        ? DotValue<NonNullable<StripIndex<T>[Head]>, Tail>
        : never
    : K extends keyof StripIndex<T>
      ? StripIndex<T>[K]
      : never;

/** Sentinel that distinguishes "no default argument" from "default is undefined". */
const MISSING = Symbol("MISSING");

/**
 * Resolves the project environment from CLI args (`-e` / `--environment`)
 * or the `ISB_PROJECT_ENVIRONMENT` env var. Loads `config.<env>.yaml` and
 * resolves `SECRET[xxx]` references via the injected secrets store.
 *
 * Instantiated once as a global singleton.
 */
@Injectable()
export class ApplicationConfigService {
    public readonly environment: ProjectEnvironment;
    private readonly config: Readonly<AppConfig>;

    constructor(
        @Inject(CLI_ARGS) private readonly cliArgs: CliArgs,
        @Inject(SECRETS_STORE) private readonly secretsStore: ISecretsStore,
    ) {
        this.environment = this.resolveEnvironment();
        this.config = Object.freeze(this.loadConfig(this.environment));
    }

    /**
     * Returns the validated, readonly configuration object.
     */
    getConfig(): Readonly<AppConfig> {
        return this.config;
    }

    /**
     * Type-safe accessor for a dot-notation config key path.
     *
     * Sig1 (required): throws ConfigurationException if the key is absent or malformed.
     * Sig2 (with default): returns defaultValue if the key is absent; throws if malformed.
     *
     * Malformed keys (empty string, leading/trailing dot, consecutive dots) always throw,
     * regardless of whether a defaultValue is supplied.
     */
    get<K extends DotKeys<AppConfig>>(key: K): DotValue<AppConfig, K>;
    /* eslint-disable @typescript-eslint/unified-signatures -- separate overloads for distinct caller intent (required vs optional default) */
    get<K extends DotKeys<AppConfig>>(
        key: K,
        defaultValue: DotValue<AppConfig, K>,
    ): DotValue<AppConfig, K>;
    /* eslint-enable @typescript-eslint/unified-signatures */
    get<K extends DotKeys<AppConfig>>(
        key: K,
        defaultValue: DotValue<AppConfig, K> | typeof MISSING = MISSING,
    ): DotValue<AppConfig, K> {
        if (key === "" || key.startsWith(".") || key.endsWith(".") || key.includes("..")) {
            throw new ConfigurationException(
                `Malformed config key "${key}": must not be empty, start or end with a dot, or contain consecutive dots.`,
            );
        }

        const parts = key.split(".");
        let current: unknown = this.config;
        for (const part of parts) {
            if (current === null || typeof current !== "object") {
                if (defaultValue !== MISSING) return defaultValue;
                throw new ConfigurationException(
                    `Config key "${key}" is not present in the loaded configuration.`,
                );
            }
            current = (current as Record<string, unknown>)[part];
        }

        if (current === undefined) {
            if (defaultValue !== MISSING) return defaultValue;
            throw new ConfigurationException(
                `Config key "${key}" is not present in the loaded configuration.`,
            );
        }

        return current as DotValue<AppConfig, K>;
    }

    // ------------------------------------------------------------------
    // Private helpers
    // ------------------------------------------------------------------

    /**
     * Resolve environment from CLI args first, then env var.
     * CLI args take precedence over env var.
     */
    private resolveEnvironment(): ProjectEnvironment {
        const cliEnv = this.cliArgs.environment;
        const envVar = process.env.ISB_PROJECT_ENVIRONMENT?.trim();
        const raw = cliEnv ?? envVar;

        if (!raw) {
            throw new ConfigurationException(
                "Project environment is not set. " +
                    "Provide it via CLI (--environment or -e) or set the ISB_PROJECT_ENVIRONMENT environment variable. " +
                    `Valid values: ${VALID_ENVIRONMENTS.join(", ")}`,
            );
        }

        if (!VALID_ENVIRONMENTS.includes(raw as ProjectEnvironment)) {
            throw new ConfigurationException(
                `Invalid project environment "${raw}". ` +
                    `Valid values: ${VALID_ENVIRONMENTS.join(", ")}`,
            );
        }

        return raw as ProjectEnvironment;
    }

    /**
     * Load and parse `config.<env>.yaml`, then resolve secret references
     * and validate against the config schema.
     *
     * Pipeline: parse YAML → resolve secrets → Zod validate → return result.data
     */
    private loadConfig(env: ProjectEnvironment): AppConfig {
        // Config path precedence: --config CLI arg > ISB_CONFIG_PATH env var > default
        // NOTE: search-upward strategy is intentionally deferred; use explicit overrides for now
        const configPath =
            this.cliArgs.config ??
            process.env.ISB_CONFIG_PATH ??
            join(process.cwd(), `config.${env}.yaml`);

        let raw: string;
        try {
            raw = readFileSync(configPath, "utf-8");
        } catch (err) {
            throw new ConfigurationException(
                `Cannot read config file at "${configPath}": ${(err as Error).message}. ` +
                    "Override the path with --config <path> or ISB_CONFIG_PATH env var.",
            );
        }

        const parsed = parseYaml(raw) as Record<string, unknown> | null;
        if (!parsed || typeof parsed !== "object") {
            throw new ConfigurationException(
                `Config file "${configPath}" is empty or invalid YAML.`,
            );
        }

        // Resolve SECRET[xxx] references via the injected secrets store
        resolveConfigSecrets(parsed, this.secretsStore);

        // Validate against the config schema — uses result.data (new object from Zod)
        const result = ConfigSchema.safeParse(parsed);
        if (!result.success) {
            throw new ConfigurationException(
                `Config validation failed for "${configPath}":\n${JSON.stringify(result.error.issues, null, 2)}`,
            );
        }

        return result.data;
    }
}
