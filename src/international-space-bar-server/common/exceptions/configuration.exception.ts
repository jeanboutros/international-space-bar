import { ApplicationException } from "./application.exception.js";

/**
 * Thrown when a required configuration value is missing or invalid.
 *
 * This exception prevents the application from starting in an
 * undefined state. It should be caught at the bootstrap level
 * and result in a non-zero exit code.
 */
export class ConfigurationException extends ApplicationException {
    constructor(message: string) {
        super("CONFIGURATION_ERROR", message);
        this.name = "ConfigurationException";
    }
}
