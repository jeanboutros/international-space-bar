import { Body, Controller, HttpCode, Inject, Post, UseGuards, UsePipes } from "@nestjs/common";
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
    create(@Body() body: CreateResponseBody) {
        return this.responses.create(body);
    }
}
