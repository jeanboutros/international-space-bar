import { Global, Module } from "@nestjs/common";
import { SECRETS_STORE } from "../common/interfaces/index.js";
import { ApplicationConfigService } from "./application-config.service.js";
import { CLI_ARGS, parseCliArgs } from "./cli-args.js";
import { SecretsStoreSelectorService } from "./secrets-store-selector.service.js";
import { APPLICATION_CONFIG } from "../common/interfaces/application-config.interface.js";

@Global()
@Module({
    providers: [
        { provide: CLI_ARGS, useFactory: () => parseCliArgs() },
        { provide: SECRETS_STORE, useClass: SecretsStoreSelectorService },
        { provide: APPLICATION_CONFIG, useClass: ApplicationConfigService },
    ],
    exports: [CLI_ARGS, SECRETS_STORE, APPLICATION_CONFIG],
})
export class ApplicationConfigModule {}
