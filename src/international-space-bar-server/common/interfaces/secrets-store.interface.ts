/**
 * A pluggable secrets store for resolving secret references in config.
 *
 * Implementations may read from environment variables, cloud secret
 * managers, encrypted files, or any other backend.
 */
export type { ISecretsStore } from "../../../international-space-bar-common/interfaces/secrets-store.interface.js";
export const SECRETS_STORE = Symbol("SecretsStore");
