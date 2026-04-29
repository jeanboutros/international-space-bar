/**
 * A pluggable secrets store for resolving secret references in config.
 *
 * Implementations may read from environment variables, cloud secret
 * managers, encrypted files, or any other backend.
 */
export interface ISecretsStore {
    /**
     * Resolve a secret value by its key.
     *
     * @param key - The secret identifier (e.g. the `xxx` inside `SECRET[xxx]`).
     * @param defaultValue - Optional fallback if the secret is not found.
     * @returns The resolved secret value, or the default.
     * @throws If the secret is not found and no default is provided.
     */
    getSecret(key: string, defaultValue?: string): string;
}

export const SECRETS_STORE = Symbol("SecretsStore");
