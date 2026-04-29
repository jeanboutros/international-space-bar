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
import { resolveConfigSecrets } from "./resolve-config-secrets.js";

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
    private readonly config: Readonly<Record<string, unknown>>;

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
    getConfig(): Readonly<Record<string, unknown>> {
        return this.config;
    }

    /**
     * Type-safe accessor for a top-level config key.
     */
    get<T = unknown>(key: string): T | undefined {
        return this.config[key] as T | undefined;
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
     * Load and parse `config.<env>.yaml`, then resolve secret references.
     */
    private loadConfig(env: ProjectEnvironment): Record<string, unknown> {
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

        return parsed;
    }
}
