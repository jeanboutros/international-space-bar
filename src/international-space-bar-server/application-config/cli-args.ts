import { parseArgs } from "node:util";

export interface CliArgs {
    environment?: string;
    config?: string;
    secretStore?: string;
}

export const CLI_ARGS: unique symbol = Symbol("CliArgs");

export function parseCliArgs(): CliArgs {
    try {
        const { values } = parseArgs({
            options: {
                environment: { type: "string", short: "e" },
                config: { type: "string", short: "c" },
                "secret-store": { type: "string" },
            },
            strict: false,
        });
        return {
            environment: values.environment as string | undefined,
            config: values.config as string | undefined,
            secretStore: values["secret-store"] as string | undefined,
        };
    } catch {
        return {};
    }
}
