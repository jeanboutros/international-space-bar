import { Injectable } from "@nestjs/common";
import type { ISecretsStore } from "../common/interfaces/index.js";

/**
 * Resolves secret references from environment variables.
 *
 * Handles `SECRET[xxx]` patterns found in YAML config values by
 * reading the corresponding environment variable. Injected into
 * {@link ApplicationConfigService} to decouple config loading from
 * the secrets backend.
 *
 * Replace this implementation with a cloud-backed store (AWS Secrets
 * Manager, Vault, 1Password) by providing a different `ISecretsStore`
 * implementation bound to the same DI token.
 */
@Injectable()
export class SecretsStoreService implements ISecretsStore {
    getSecret(key: string, defaultValue?: string): string {
        const value = process.env[key];
        if (value !== undefined && value.length > 0) {
            return value;
        }
        if (defaultValue !== undefined) {
            return defaultValue;
        }
        throw new Error(
            `Secret "${key}" not found in environment variables and no default provided. ` +
            `Set the ${key} environment variable or provide a default.`,
        );
    }
}
