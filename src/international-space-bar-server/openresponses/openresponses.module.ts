import { Module } from "@nestjs/common";
import { AGENT_RUNTIME_PORT } from "./agent-runtime.port.js";
import { PingPongRuntimeService } from "./ping-pong-runtime.service.js";
import { ResponsesController } from "./responses.controller.js";
import { ResponsesService } from "./responses.service.js";

@Module({
    controllers: [ResponsesController],
    providers: [
        ResponsesService,
        {
            provide: AGENT_RUNTIME_PORT,
            useClass: PingPongRuntimeService,
        },
    ],
})
export class OpenResponsesModule {}
