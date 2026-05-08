import { Module, Global } from "@nestjs/common";
import { APPLICATION_CONTEXT } from "../common/interfaces/application-context.interface.js";
import { ILogger, LOGGER } from "../common/interfaces/logger.port.js";
import { ISecretsStore, SECRETS_STORE } from "../common/interfaces/index.js";
import {
    APPLICATION_CONFIG,
    IApplicationConfig,
} from "../common/interfaces/application-config.interface.js";
import { ApplicationConfigModule } from "./application-config.module.js";
import { LoggingModule } from "../logging/logging.module.js";

@Global()
@Module({
    imports: [ApplicationConfigModule, LoggingModule],
    providers: [
        {
            inject: [APPLICATION_CONFIG, SECRETS_STORE, LOGGER],
            provide: APPLICATION_CONTEXT,
            useFactory: (
                applicationConfig: IApplicationConfig<Record<string, unknown>>,
                secretsStore: ISecretsStore,
                logger: ILogger,
            ) => ({
                config: applicationConfig,
                secretsStore,
                logger,
            }),
        },
    ],
    exports: [APPLICATION_CONTEXT],
})
export class ApplicationContextModule {}
