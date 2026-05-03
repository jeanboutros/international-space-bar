import {
    Body,
    Controller,
    HttpCode,
    Inject,
    Post,
    Req,
    Res,
    UseGuards,
    UsePipes,
} from "@nestjs/common";
import type { Request as ExpressRequest, Response as ExpressResponse } from "express";
import { BearerAuthGuard } from "../common/bearer-auth.guard.js";
import { type ILogger, LOGGER } from "../common/interfaces/logger.port.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { RESPONSES_ROUTE } from "../constants.js";
import { CreateResponseSchema } from "./responses.schemas.js";
import { ResponsesService } from "./responses.service.js";
import type { CreateResponseBody } from "./responses.types.js";
import { randomUUID } from "crypto";

/**
 * Handles POST /responses — the OpenResponses protocol entry point.
 *
 * Supports two response modes determined by `body.stream`:
 *   - Non-streaming: delegates to ResponsesService.create() and returns a single JSON object.
 *   - Streaming: delegates to ResponsesService.createStream() and writes Server-Sent Events
 *     (SSE) frames to the raw response, one per agent event, terminated with `data: [DONE]`.
 *
 * All requests require a valid Bearer token (enforced by BearerAuthGuard) and are validated
 * against CreateResponseSchema before reaching the handler (ZodValidationPipe).
 */
@Controller(RESPONSES_ROUTE)
@UseGuards(BearerAuthGuard)
export class ResponsesController {
    private readonly responses: ResponsesService;

    constructor(
        @Inject(ResponsesService) responses: ResponsesService,
        @Inject(LOGGER) private readonly logger: ILogger,
    ) {
        this.responses = responses;
    }

    @Post()
    @HttpCode(200)
    @UsePipes(new ZodValidationPipe(CreateResponseSchema))
    async create(
        @Body() body: CreateResponseBody,
        @Req() req: ExpressRequest,
        // passthrough: false — we own the response lifecycle entirely (required for SSE).
        @Res({ passthrough: false }) res: ExpressResponse,
    ) {
        // x-session-affinity is a custom header set by OpenCode's client. In the future
        // we should handle other client types.
        const requestId =
            (req.headers["x-session-affinity"] as string | undefined) ?? `req_${randomUUID()}`;

        this.logger.debug({ requestId }, `Received request`);

        // One AbortController per request. Its signal is passed down to the service so that
        // long-running LLM calls and async generators can be cancelled cooperatively.
        const abortController = new AbortController();

        // The "close" event fires when the client disconnects (browser tab closed, network
        // drop, explicit cancellation). We abort the signal immediately so the service layer
        // can stop work as soon as possible and avoid wasting LLM tokens.
        res.on("close", () => {
            abortController.abort();

            this.logger.info(
                `Client disconnected, aborting response stream (requestId: ${requestId})`,
            );
        });

        if (body.stream) {
            // SSE requires these three headers. "Connection: keep-alive" is redundant on
            // HTTP/2 but harmless, and required for HTTP/1.1 clients.
            res.setHeader("Content-Type", "text/event-stream");
            res.setHeader("Cache-Control", "no-cache");
            res.setHeader("Connection", "keep-alive");

            try {
                // Iterate over agent events as they are produced. Each event is written as an
                // SSE frame: "event: <type>\ndata: <json>\n\n". We check the abort signal on
                // every iteration so we stop writing to a closed socket immediately.
                for await (const event of this.responses.createStream(
                    body,
                    abortController.signal,
                    requestId,
                )) {
                    if (abortController.signal.aborted) break;
                    res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
                }
            } catch (err) {
                // The service (or an underlying fetch/LangGraph call) throws an AbortError
                // when the signal fires. This is expected on client disconnect — swallow it.
                // Any other error is a genuine failure and must propagate to NestJS's exception
                // handler.
                if ((err as DOMException).name !== "AbortError") throw err;
            }

            // Only send the terminal [DONE] sentinel if the stream completed naturally.
            // Omitting it on abort prevents writing to an already-closed socket.
            if (!abortController.signal.aborted) {
                res.write("data: [DONE]\n\n");
            }

            res.end();
            return;
        }

        // Non-streaming path: delegate to the service and let NestJS serialise the result.
        res.json(await this.responses.create(body, requestId));
    }
}
