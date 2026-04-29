import { Global, Module } from "@nestjs/common";
import { SECRETS_STORE } from "../common/interfaces/index.js";
import { ApplicationConfigService } from "./application-config.service.js";
import { CLI_ARGS, parseCliArgs } from "./cli-args.js";
import { SecretsStoreSelectorService } from "./secrets-store-selector.service.js";

@Global()
@Module({
    providers: [
        { provide: CLI_ARGS, useFactory: () => parseCliArgs() },
        { provide: SECRETS_STORE, useClass: SecretsStoreSelectorService },
        ApplicationConfigService,
    ],
    exports: [CLI_ARGS, SECRETS_STORE, ApplicationConfigService],
})
export class ApplicationConfigModule {}
