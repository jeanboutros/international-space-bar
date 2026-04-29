import { Body, Controller, HttpCode, Inject, Post, Res, UseGuards, UsePipes } from "@nestjs/common";
import type { Response as ExpressResponse } from "express";
import { BearerAuthGuard } from "../common/bearer-auth.guard.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { CreateResponseSchema } from "./responses.schemas.js";
import { ResponsesService } from "./responses.service.js";
import type { CreateResponseBody } from "./responses.types.js";

@Controller("v1/responses")
@UseGuards(BearerAuthGuard)
export class ResponsesController {
    private readonly responses: ResponsesService;

    constructor(@Inject(ResponsesService) responses: ResponsesService) {
        this.responses = responses;
    }

    @Post()
    @HttpCode(200)
    @UsePipes(new ZodValidationPipe(CreateResponseSchema))
    async create(
        @Body() body: CreateResponseBody,
        @Res({ passthrough: false }) res: ExpressResponse,
    ) {
        if (body.stream) {
            res.setHeader("Content-Type", "text/event-stream");
            res.setHeader("Cache-Control", "no-cache");
            res.setHeader("Connection", "keep-alive");

            for await (const event of this.responses.createStream(body)) {
                res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
            }

            res.write("data: [DONE]\n\n");
            res.end();
            return;
        }

        res.json(await this.responses.create(body));
    }
}
