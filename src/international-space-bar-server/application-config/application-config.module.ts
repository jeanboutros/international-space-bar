import { Global, Module } from "@nestjs/common";
import { SECRETS_STORE } from "../common/interfaces/index.js";
import { ApplicationConfigService } from "./application-config.service.js";
import { SecretsStoreService } from "./secrets-store.service.js";

@Global()
@Module({
    providers: [
        { provide: SECRETS_STORE, useClass: SecretsStoreService },
        ApplicationConfigService,
    ],
    exports: [SECRETS_STORE, ApplicationConfigService],
})
export class ApplicationConfigModule {}
