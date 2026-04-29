import { Global, Module } from "@nestjs/common";
import { ConfigurationException } from "../common/exceptions/index.js";
import { SECRETS_STORE } from "../common/interfaces/index.js";
import { ApplicationConfigService } from "./application-config.service.js";
import { CLI_ARGS, type CliArgs, parseCliArgs } from "./cli-args.js";
import { SecretsStoreService } from "./secrets-store.service.js";

@Global()
@Module({
    providers: [
        { provide: CLI_ARGS, useFactory: () => parseCliArgs() },
        {
            provide: SECRETS_STORE,
            useFactory: (args: CliArgs) => {
                const backend = args.secretStore ?? "env";
                if (backend === "env") return new SecretsStoreService();
                throw new ConfigurationException(
                    `Secret store backend "${backend}" is not implemented. Available: env`,
                );
            },
            inject: [CLI_ARGS],
        },
        ApplicationConfigService,
    ],
    exports: [CLI_ARGS, SECRETS_STORE, ApplicationConfigService],
})
export class ApplicationConfigModule {}
