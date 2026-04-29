import type { ISecretsStore } from "../common/interfaces/index.js";

const SECRET_PATTERN = /^SECRET\[([^\]]+)\]$/;

/**
 * Recursively walk a config object and resolve all `SECRET[xxx]` values
 * via the provided secrets store. Modifies the object in-place and
 * returns it for chaining.
 *
 * **Limitation:** Arrays are not traversed — only plain objects are
 * walked recursively. Secret references inside array elements will
 * not be resolved.
 */
export function resolveConfigSecrets(
    config: Record<string, unknown>,
    store: ISecretsStore,
): Record<string, unknown> {
    for (const [key, value] of Object.entries(config)) {
        if (typeof value === "string") {
            const match = SECRET_PATTERN.exec(value);
            if (match?.[1]) {
                config[key] = store.getSecret(match[1]);
            }
        } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
            resolveConfigSecrets(value as Record<string, unknown>, store);
        }
    }
    return config;
}
