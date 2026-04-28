/**
 * Secrets store abstraction.
 *
 * Provides a pluggable interface for resolving secret values referenced
 * in configuration files using the `SECRET[xxx]` syntax.
 *
 * The default implementation ({@link EnvironmentVariablesSecretsStore})
 * reads secrets from `process.env`, but the interface allows swapping
 * in any backend (AWS Secrets Manager, Vault, 1Password, etc.)
 * without changing the config loading logic.
 */

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

/**
 * A secrets store that can resolve secret references.
 *
 * Implementations may read from environment variables, cloud secret
 * managers, encrypted files, or any other backend.
 */
export interface ISecretsStore {
    /**
     * Resolve a secret value by its key.
     *
     * @param key - The secret identifier (the `xxx` inside `SECRET[xxx]`).
     * @param defaultValue - Optional fallback if the secret is not found.
     * @returns The resolved secret value, or the default.
     * @throws If the secret is not found and no default is provided.
     */
    getSecret(key: string, defaultValue?: string): string;
}

// ---------------------------------------------------------------------------
// Regex for SECRET[xxx] references
// ---------------------------------------------------------------------------

/**
 * Matches `SECRET[xxx]` patterns in configuration values.
 * Captures the key name inside the brackets.
 */
export const SECRET_PATTERN = /^SECRET\[([^\]]+)\]$/;

/**
 * Check if a value is a secret reference.
 */
export function isSecretReference(value: string): boolean {
    return SECRET_PATTERN.test(value);
}

/**
 * Extract the secret key from a `SECRET[xxx]` reference.
 *
 * @returns The key name, or `null` if the value is not a secret reference.
 */
export function extractSecretKey(value: string): string | null {
    const match = SECRET_PATTERN.exec(value);
    return match?.[1] ?? null;
}

/**
 * Recursively walk a config object and resolve all `SECRET[xxx]` values
 * using the provided secrets store.
 *
 * Modifies the object in-place for efficiency and returns it for chaining.
 */
export function resolveSecrets(
    config: Record<string, unknown>,
    store: ISecretsStore,
): Record<string, unknown> {
    for (const [key, value] of Object.entries(config)) {
        if (typeof value === "string" && isSecretReference(value)) {
            const secretKey = extractSecretKey(value);
            if (secretKey) {
                config[key] = store.getSecret(secretKey);
            }
        } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
            resolveSecrets(value as Record<string, unknown>, store);
        }
    }
    return config;
}

// ---------------------------------------------------------------------------
// Environment Variables implementation
// ---------------------------------------------------------------------------

/**
 * A secrets store that reads from `process.env`.
 *
 * This is the default store used when no other backend is configured.
 * It's suitable for development and simple deployments where secrets
 * are injected via environment variables (e.g. Docker, Kubernetes).
 */
export class EnvironmentVariablesSecretsStore implements ISecretsStore {
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
