import { Inject, Injectable } from "@nestjs/common";
import type {
    CreateResponseBody,
    ResponseStreamEvent,
} from "./responses.types.js";
import { toBaseMessages } from "../../international-space-bar-openresponses/utils/input-to-messages.js";
import type {
    WorkflowLoadContext,
    WorkflowRequest,
    WorkflowInferenceHints,
} from "../../international-space-bar-workflows/interfaces/index.js";
import { LazyWorkflowRuntime, WorkflowModuleLoader } from "../../international-space-bar-workflows/lazy-workflow-runtime.service.js";
import { LOGGER, type ILogger } from "../common/interfaces/logger.port.js";
import workflowRegistryEntries from "../../international-space-bar-workflows/registry.js";

@Injectable()
export class ResponsesService {
    private readonly workflowRuntime: LazyWorkflowRuntime;

    constructor(@Inject(LOGGER) private readonly logger: ILogger) {
        const context: WorkflowLoadContext = {
            logger: this.logger,
            now: () => new Date(),
        };

        const registry = workflowRegistryEntries;
        this.workflowRuntime = new LazyWorkflowRuntime(registry, context);
    }

    // Body is guaranteed to be valid by the controller's ZodValidationPipe.
    async *createStream(
        body: CreateResponseBody,
        abortSignal: AbortSignal,
        requestId: string,
    ): AsyncIterable<ResponseStreamEvent> {

        // Build the workflow request from the incoming body and other parameters.
        const request = this.buildWorkflowRequest(body, requestId, abortSignal);
        // Get a runner for the specified workflow/model.
        const runner = await this.workflowRuntime.runnerForModel(body.model as string);

        for await (const chunk of runner.stream(request)) {
            // TODO: replace with workflowChunkToOpenResponsesEvents() once the
            // conversion package is implemented (§12 of the design).
            yield {
                type: "error",
                sequence_number: 0,
                error: {
                    type: "WorkflowChunk",
                    message: "Received a chunk from the workflow",
                    details: JSON.stringify(chunk),
                },
            };
        }
    }

    private buildWorkflowRequest(
        body: CreateResponseBody,
        requestId: string,
        abortSignal: AbortSignal,
    ): WorkflowRequest {
        const input = toBaseMessages(body.input as string | readonly unknown[]);
        const instructions =
            body.instructions && typeof body.instructions === "string"
                ? body.instructions
                : body.instructions != null
                    ? JSON.stringify(body.instructions)
                    : undefined;

        return {
            requestId,
            workflowId: body.model as string,
            input,
            instructions,
            abortSignal,
            metadata: (body.metadata as Record<string, unknown> | undefined) ?? undefined,
            inferenceHints: this.buildInferenceHints(body),
        };
    }

    private buildInferenceHints(body: CreateResponseBody): WorkflowInferenceHints | undefined {
        const hints: WorkflowInferenceHints = {
            temperature: body.temperature as number | undefined,
            topP: body.top_p as number | undefined,
            maxOutputTokens: body.max_output_tokens as number | undefined,
            clientTools: (body.tools as readonly unknown[] | undefined),
            clientToolChoice: body.tool_choice ?? undefined,
        };

        // Only attach hints if at least one field is present.
        const hasAny = Object.values(hints).some((v) => v !== undefined);
        return hasAny ? hints : undefined;
    }
}
