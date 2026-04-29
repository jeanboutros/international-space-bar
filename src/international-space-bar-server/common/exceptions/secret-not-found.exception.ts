import { ApplicationException } from "./application.exception.js";

/**
 * Thrown when a required secret is not found in the active secrets store
 * and no default value was provided.
 */
export class SecretNotFoundException extends ApplicationException {
    constructor(key: string) {
        super(
            "SECRET_NOT_FOUND",
            `Secret "${key}" not found in environment variables and no default provided. ` +
                `Set the ${key} environment variable or provide a default.`,
        );
        this.name = "SecretNotFoundException";
    }
}
