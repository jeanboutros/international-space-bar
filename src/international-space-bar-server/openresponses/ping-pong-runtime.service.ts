// SCAFFOLD: Temporary runtime. Demonstrates ResponseStream + block architecture.
// TODO(isb-0020): Delete this file entirely when the real LangGraph adapter is wired.
import { Inject, Injectable } from "@nestjs/common";

import type { ILogger } from "../common/interfaces/index.js";
import { LOGGER } from "../common/interfaces/logger.port.js";
import type { AgentInvokeRequest, AgentRuntimePort } from "./agent-runtime.port.js";
import type { ResponseResource, ResponseStreamEvent } from "./responses.types.js";
import { ApplicationConfigService } from "../application-config/application-config.service.js";
import { APPLICATION_CONFIG } from "../common/interfaces/application-config.interface.js";

@Injectable()
export class PingPongRuntimeService implements AgentRuntimePort {
    constructor(
        @Inject(LOGGER) private readonly logger: ILogger,
        @Inject(APPLICATION_CONFIG) private readonly configService: ApplicationConfigService,
    ) { }

    // TODO(isb-0020): Implement when LangGraph adapter is wired.
    invoke(_request: AgentInvokeRequest): Promise<ResponseResource> {
        throw new Error("invoke() not implemented in scaffold runtime");
    }

    async *stream(request: AgentInvokeRequest): AsyncIterable<ResponseStreamEvent> { }
}
