import type { ILogger } from "./logger.port.js";
import { IApplicationConfig } from "./application-config.interface.js";
import { ISecretsStore } from "./secrets-store.interface.js";
interface ApplicationContext<ConfigType extends Record<string, unknown> = Record<string, unknown>> {
    logger: ILogger;
    secretsStore: ISecretsStore;
    config: IApplicationConfig<ConfigType>;
}

export const APPLICATION_CONTEXT = Symbol("APPLICATION_CONTEXT");

export type { ApplicationContext };
