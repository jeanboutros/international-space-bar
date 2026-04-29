import { Inject, Injectable } from "@nestjs/common";
import { ConfigurationException } from "../common/exceptions/index.js";
import type { ISecretsStore } from "../common/interfaces/index.js";
import { CLI_ARGS, type CliArgs } from "./cli-args.js";
import { SecretsStoreService } from "./secrets-store.service.js";

const SUPPORTED_BACKENDS = ["env"] as const;

/**
 * Proxy that selects the concrete {@link ISecretsStore} implementation
 * based on the `--secret-store` CLI arg (defaults to `"env"`).
 *
 * Registered as the `SECRETS_STORE` provider so the rest of the app
 * only depends on the `ISecretsStore` interface.
 */
@Injectable()
export class SecretsStoreSelectorService implements ISecretsStore {
    private readonly delegate: ISecretsStore;

    constructor(@Inject(CLI_ARGS) cliArgs: CliArgs) {
        const backend = cliArgs.secretStore ?? "env";

        switch (backend) {
            case "env":
                this.delegate = new SecretsStoreService();
                break;
            default:
                throw new ConfigurationException(
                    `Secret store backend "${backend}" is not implemented. ` +
                        `Available: ${SUPPORTED_BACKENDS.join(", ")}`,
                );
        }
    }

    getSecret(key: string, defaultValue?: string): string {
        return this.delegate.getSecret(key, defaultValue);
    }
}
