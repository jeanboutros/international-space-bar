/**
 * Base class for application-level exceptions.
 *
 * Extends `Error` with a machine-readable `code` for programmatic handling.
 * All custom exceptions in the server should extend this class.
 */
export class ApplicationException extends Error {
    public readonly code: string;

    constructor(code: string, message: string) {
        super(message);
        this.name = "ApplicationException";
        this.code = code;
    }
}
