// SCAFFOLD: Temporary file. Real LLM calls via ChatOllama until LangGraph is wired.
// TODO(isb-0020): Delete this file entirely when LangGraph adapter is wired.
import { randomUUID } from "node:crypto";
import { type BaseMessage, HumanMessage, ToolMessage } from "@langchain/core/messages"; // TODO: REMOVE BEFORE PRODUCTION
import { ChatOllama } from "@langchain/ollama"; // TODO: REMOVE BEFORE PRODUCTION
import { Inject, Injectable } from "@nestjs/common";
import { z } from "zod";
import type { ILogger } from "../common/interfaces/index.js";
import { LOGGER } from "../common/interfaces/logger.port.js";
import type { AgentInvokeRequest, AgentRuntimePort } from "./agent-runtime.port.js";
import { toBaseMessages } from "./input-to-messages.js";
import { responseCompletedStreamingEventSchema } from "./generated/zod/responseCompletedStreamingEventSchema.js";
import { responseContentPartAddedStreamingEventSchema } from "./generated/zod/responseContentPartAddedStreamingEventSchema.js";
import { responseContentPartDoneStreamingEventSchema } from "./generated/zod/responseContentPartDoneStreamingEventSchema.js";
import { responseCreatedStreamingEventSchema } from "./generated/zod/responseCreatedStreamingEventSchema.js";
import { responseFunctionCallArgumentsDeltaStreamingEventSchema } from "./generated/zod/responseFunctionCallArgumentsDeltaStreamingEventSchema.js";
import { responseFunctionCallArgumentsDoneStreamingEventSchema } from "./generated/zod/responseFunctionCallArgumentsDoneStreamingEventSchema.js";
import { responseOutputItemAddedStreamingEventSchema } from "./generated/zod/responseOutputItemAddedStreamingEventSchema.js";
import { responseOutputItemDoneStreamingEventSchema } from "./generated/zod/responseOutputItemDoneStreamingEventSchema.js";
import { responseOutputTextDeltaStreamingEventSchema } from "./generated/zod/responseOutputTextDeltaStreamingEventSchema.js";
import { responseOutputTextDoneStreamingEventSchema } from "./generated/zod/responseOutputTextDoneStreamingEventSchema.js";
import { responseReasoningSummaryDeltaStreamingEventSchema } from "./generated/zod/responseReasoningSummaryDeltaStreamingEventSchema.js";
import { responseReasoningSummaryDoneStreamingEventSchema } from "./generated/zod/responseReasoningSummaryDoneStreamingEventSchema.js";
import { responseReasoningSummaryPartAddedStreamingEventSchema } from "./generated/zod/responseReasoningSummaryPartAddedStreamingEventSchema.js";
import { responseReasoningSummaryPartDoneStreamingEventSchema } from "./generated/zod/responseReasoningSummaryPartDoneStreamingEventSchema.js";
import { responseResourceSchema } from "./generated/zod/responseResourceSchema.js";
import type { ResponseResource, ResponseStreamEvent } from "./responses.types.js";

// ── SCAFFOLD TYPES — delete with file (TODO isb-0020) ───────────────────────
// These schemas validate the item payloads built inside stream() events.
// Using .parse() here throws a ZodError with a named path if an item shape is
// wrong — surfacing structural bugs immediately rather than silently forwarding
// a malformed event payload downstream.
const ReasoningItemShape = z.object({
    id: z.string(),
    type: z.literal("reasoning"),
    summary: z.array(z.unknown()),
    // content is omitted in output_item.done events (only present in .added as [])
    content: z.array(z.unknown()).optional(),
});

const MessageItemShape = z.object({
    id: z.string(),
    type: z.literal("message"),
    status: z.enum(["in_progress", "completed"]),
    role: z.literal("assistant"),
    content: z.array(z.unknown()),
});

const FunctionCallItemShape = z.object({
    id: z.string(),
    type: z.literal("function_call"),
    call_id: z.string(),
    name: z.string(),
    arguments: z.string(),
    status: z.enum(["in_progress", "completed"]),
});
// ────────────────────────────────────────────────────────────────────────────

@Injectable()
export class PingPongRuntimeService implements AgentRuntimePort {
    constructor(@Inject(LOGGER) private readonly logger: ILogger) { }

    // TODO(isb-0020): Implement when LangGraph adapter is wired.
    invoke(_request: AgentInvokeRequest): Promise<ResponseResource> {
        throw new Error("invoke() not implemented in scaffold runtime");
    }

    // stream() — scaffold implementation.
    // When OLLAMA_BASE_URL is set and Ollama is reachable, produces full LLM streaming.
    // Otherwise, falls back to a minimal "pong" streaming sequence for compliance testing.
    // TODO(isb-0020): Delete this entire method when LangGraph adapter is wired.
    async *stream(request: AgentInvokeRequest): AsyncIterable<ResponseStreamEvent> {
        // TODO: Not in a ticket yet. The name of the model, should define which llm or workflow to 
        // invoke. For example, if the model is "simple-workflow", we should invoke the simpleWorkflowGraph.
        // The user should be able to switch between different workflows and llms by changing the model name 
        // in the request.
        // TODO: Identify how the list of models can be shared with 
        const v1 = this.streamSimplePong(
            request,
            `res_${randomUUID()}`,
            0,
            Math.floor(Date.now() / 1000),
            new AbortController().signal,
        )

        const v1Iterator = v1[Symbol.iterator]();

        const { value, done } = v1Iterator.next();

        this.logger.debug({ request, response: value, done }, "Request received in PingPongRuntimeService.stream()");

        yield* await Promise.resolve(v1);
        return;
        // yield responseOutputTextDoneStreamingEventSchema.parse({
        //     type: "response.output_text.done",
        //     sequence_number: seq++,
        //     item_id: msgId,
        //     output_index: outputIndex,
        //     content_index: 0,
        //     text: accumulated,
        // });
        // simpleWorkflowGraph.invoke(request.input, { sessionId: request.requestId, logger: this.logger });
        // yield Promise.resolve(null as unknown as ResponseStreamEvent); // TODO: REMOVE BEFORE PRODUCTION
    }

    async * _old(request: AgentInvokeRequest): AsyncIterable<ResponseStreamEvent> {
        const messages = toBaseMessages(request.input);
        const inputSummary = typeof request.input === "string" ? request.input : `[${messages.length} messages]`;
        this.logger.info(`Received streaming ping with input: ${inputSummary}`);
        const respId = `resp_${randomUUID()}`;
        let seq = 0;
        const now = Math.floor(Date.now() / 1000);
        const abortSignal = request.abortSignal ?? new AbortController().signal;

        // Check if Ollama is available for the full streaming experience.
        // If not, fall back to a minimal ping-pong streaming sequence.
        const ollamaBaseUrl = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
        const useOllama = await this.isOllamaReachable(ollamaBaseUrl);

        if (!useOllama) {
            yield* this.streamSimplePong(request, respId, seq, now, abortSignal);
            return;
        }

        // ── Full LLM streaming (Ollama reachable) ───────────────────────────────
        const llm = new ChatOllama({ model: "gemma4:e2b", baseUrl: ollamaBaseUrl });

        
        // ── Tool for index 3 ────────────────────────────────────────────────────
        const weatherTool = {
            type: "function" as const,
            function: {
                name: "get_weather",
                description: "Get the current weather for a location",
                parameters: {
                    type: "object",
                    properties: {
                        location: { type: "string", description: "City name" },
                        unit: { type: "string", enum: ["celsius", "fahrenheit"] },
                    },
                    required: ["location"],
                },
            },
        };

        // TODO: REMOVE BEFORE PRODUCTION
        const llmWithTools = llm.bindTools([weatherTool]);

        // ── Inner helpers closing over `seq` ────────────────────────────────────

        async function* streamReasoningBlock(
            model: typeof llm,
            messages: BaseMessage[],
            outputIndex: number,
            abortSignal: AbortSignal,
        ): AsyncIterable<ResponseStreamEvent> {
            const reasoningId = `rs__${randomUUID()}`;

            // output_item.added
            yield responseOutputItemAddedStreamingEventSchema.parse({
                type: "response.output_item.added",
                sequence_number: seq++,
                output_index: outputIndex,
                item: ReasoningItemShape.parse({
                    id: reasoningId,
                    type: "reasoning",
                    summary: [],
                    content: [],
                }),
            });

            // reasoning_summary_part.added
            yield responseReasoningSummaryPartAddedStreamingEventSchema.parse({
                type: "response.reasoning_summary_part.added",
                sequence_number: seq++,
                item_id: reasoningId,
                output_index: outputIndex,
                summary_index: 0,
                part: { type: "summary_text" as const, text: "" },
            });

            // stream deltas
            let accumulated = "";
            // TODO: REMOVE BEFORE PRODUCTION
            for await (const chunk of await model.stream(messages, { signal: abortSignal })) {
                // chunk.content is typed as MessageContent = string | MessageContentComplex[].
                // It is a plain string for text-only streaming deltas (the common case with
                // text-generation models). It is a MessageContentComplex[] when the model returns
                // structured content — e.g. image parts ({type:"image_url"}), tool call
                // descriptions ({type:"tool_use"}), or tool result parts ({type:"tool_result"}).
                // Non-string content is silently dropped here ("") because this scaffold only
                // forwards text deltas for reasoning/message blocks.
                // TODO(isb-0020): When LangGraph is wired, route non-string content parts through
                // the appropriate streaming event types (e.g. image → response.output_item.added
                // with type:"image_url"; tool call → response.function_call_arguments.delta).
                const text = typeof chunk.content === "string" ? chunk.content : "";
                if (text) {
                    accumulated += text;
                    yield responseReasoningSummaryDeltaStreamingEventSchema.parse({
                        type: "response.reasoning_summary_text.delta",
                        sequence_number: seq++,
                        item_id: reasoningId,
                        output_index: outputIndex,
                        summary_index: 0,
                        delta: text,
                    });
                }
            }

            // reasoning_summary.done
            yield responseReasoningSummaryDoneStreamingEventSchema.parse({
                type: "response.reasoning_summary_text.done",
                sequence_number: seq++,
                item_id: reasoningId,
                output_index: outputIndex,
                summary_index: 0,
                text: accumulated,
            });

            // reasoning_summary_part.done
            yield responseReasoningSummaryPartDoneStreamingEventSchema.parse({
                type: "response.reasoning_summary_part.done",
                sequence_number: seq++,
                item_id: reasoningId,
                output_index: outputIndex,
                summary_index: 0,
                part: {
                    type: "summary_text" as const,
                    text: accumulated,
                },
            });

            // output_item.done
            yield responseOutputItemDoneStreamingEventSchema.parse({
                type: "response.output_item.done",
                sequence_number: seq++,
                output_index: outputIndex,
                item: ReasoningItemShape.parse({
                    id: reasoningId,
                    type: "reasoning",
                    summary: [{ type: "summary_text", text: accumulated }],
                }),
            });
        }

        async function* streamMessageBlock(
            model: typeof llm,
            prompt: string,
            outputIndex: number,
            abortSignal: AbortSignal,
        ): AsyncIterable<ResponseStreamEvent> {
            const msgId = `msg_${randomUUID()}`;

            // output_item.added
            yield responseOutputItemAddedStreamingEventSchema.parse({
                type: "response.output_item.added",
                sequence_number: seq++,
                output_index: outputIndex,
                item: MessageItemShape.parse({
                    id: msgId,
                    type: "message",
                    status: "in_progress",
                    role: "assistant",
                    content: [],
                }),
            });

            // content_part.added
            yield responseContentPartAddedStreamingEventSchema.parse({
                type: "response.content_part.added",
                sequence_number: seq++,
                item_id: msgId,
                output_index: outputIndex,
                content_index: 0,
                part: {
                    type: "output_text" as const,
                    text: "",
                    annotations: [],
                },
            });

            // stream deltas
            let accumulated = "";
            // TODO: REMOVE BEFORE PRODUCTION
            for await (const chunk of await model.stream([new HumanMessage(prompt)], {
                signal: abortSignal,
            })) {
                // chunk.content is typed as MessageContent = string | MessageContentComplex[].
                // It is a plain string for text-only streaming deltas (the common case with
                // text-generation models). It is a MessageContentComplex[] when the model returns
                // structured content — e.g. image parts ({type:"image_url"}), tool call
                // descriptions ({type:"tool_use"}), or tool result parts ({type:"tool_result"}).
                // Non-string content is silently dropped here ("") because this scaffold only
                // forwards text deltas for reasoning/message blocks.
                // TODO(isb-0020): When LangGraph is wired, route non-string content parts through
                // the appropriate streaming event types (e.g. image → response.output_item.added
                // with type:"image_url"; tool call → response.function_call_arguments.delta).
                const text = typeof chunk.content === "string" ? chunk.content : "";
                if (text) {
                    accumulated += text;
                    yield responseOutputTextDeltaStreamingEventSchema.parse({
                        type: "response.output_text.delta",
                        sequence_number: seq++,
                        item_id: msgId,
                        output_index: outputIndex,
                        content_index: 0,
                        delta: text,
                    });
                }
            }

            // output_text.done
            yield responseOutputTextDoneStreamingEventSchema.parse({
                type: "response.output_text.done",
                sequence_number: seq++,
                item_id: msgId,
                output_index: outputIndex,
                content_index: 0,
                text: accumulated,
            });

            // content_part.done
            yield responseContentPartDoneStreamingEventSchema.parse({
                type: "response.content_part.done",
                sequence_number: seq++,
                item_id: msgId,
                output_index: outputIndex,
                content_index: 0,
                part: {
                    type: "output_text" as const,
                    text: accumulated,
                    annotations: [],
                },
            });

            // output_item.done
            yield responseOutputItemDoneStreamingEventSchema.parse({
                type: "response.output_item.done",
                sequence_number: seq++,
                output_index: outputIndex,
                item: MessageItemShape.parse({
                    id: msgId,
                    type: "message",
                    status: "completed",
                    role: "assistant",
                    content: [{ type: "output_text", text: accumulated, annotations: [] }],
                }),
            });
        }

        // ── response.created ────────────────────────────────────────────────────
        const inProgressResponse: ResponseResource = responseResourceSchema.parse({
            id: respId,
            object: "response",
            created_at: now,
            completed_at: null,
            status: "in_progress",
            model: request.model,
            previous_response_id: null,
            instructions: null,
            output: [],
            error: null,
            tools: [],
            tool_choice: "auto",
            truncation: "disabled",
            parallel_tool_calls: true,
            text: { format: { type: "text" } },
            top_p: 1,
            presence_penalty: 0,
            frequency_penalty: 0,
            top_logprobs: 0,
            temperature: 1,
            reasoning: null,
            usage: {
                input_tokens: 0,
                output_tokens: 0,
                total_tokens: 0,
                input_tokens_details: { cached_tokens: 0 },
                output_tokens_details: { reasoning_tokens: 0 },
            },
            max_output_tokens: null,
            max_tool_calls: null,
            store: true,
            background: false,
            service_tier: "default",
            metadata: {},
            safety_identifier: null,
            prompt_cache_key: null,
            incomplete_details: null,
        });

        if (abortSignal.aborted) return;
        yield responseCreatedStreamingEventSchema.parse({
            type: "response.created",
            sequence_number: seq++,
            response: inProgressResponse,
        });

        // ── OUTPUT 0: reasoning ─────────────────────────────────────────────────
        if (abortSignal.aborted) return;
        yield* streamReasoningBlock(
            llm,
            [
                ...messages,
                new HumanMessage(
                    "Think step by step about what the user is asking.",
                ),
            ],
            0,
            abortSignal,
        );

        // ── OUTPUT 1: message ───────────────────────────────────────────────────
        if (abortSignal.aborted) return;
        yield* streamMessageBlock(llm, `Respond helpfully to: ${inputSummary}`, 1, abortSignal);

        // ── OUTPUT 2: reasoning ─────────────────────────────────────────────────
        if (abortSignal.aborted) return;
        yield* streamReasoningBlock(
            llm,
            [...messages, new HumanMessage("Think about what tool you need to fully answer this.")],
            2,
            abortSignal,
        );

        // ── OUTPUT 3: function_call ─────────────────────────────────────────────
        const fnCallId = `fc_${randomUUID()}`;
        const callId = `call_${randomUUID()}`;

        yield responseOutputItemAddedStreamingEventSchema.parse({
            type: "response.output_item.added",
            sequence_number: seq++,
            output_index: 3,
            item: FunctionCallItemShape.parse({
                id: fnCallId,
                type: "function_call",
                call_id: callId,
                name: "get_weather",
                arguments: "",
                status: "in_progress",
            }),
        });

        let argsAccumulated = "";
        // TODO: REMOVE BEFORE PRODUCTION
        for await (const chunk of await llmWithTools.stream(
            [
                new HumanMessage(
                    `You must call the get_weather function. The user asked: ${inputSummary}`,
                ),
            ],
            { signal: abortSignal },
        )) {
            if (abortSignal.aborted) return;
            // Collect tool call argument fragments from the chunk
            const toolCalls =
                (chunk.tool_calls as { args?: string }[] | undefined) ??
                (
                    chunk.additional_kwargs as
                    | { tool_calls?: { function?: { arguments?: string } }[] }
                    | undefined
                )?.tool_calls;

            if (toolCalls && toolCalls.length > 0) {
                const tc = toolCalls[0];
                const fragment =
                    typeof (tc as { function?: { arguments?: string } }).function?.arguments ===
                        "string"
                        ? ((tc as { function?: { arguments?: string } }).function?.arguments ?? "")
                        : "";
                if (fragment) {
                    argsAccumulated += fragment;

                    if (abortSignal.aborted) return;
                    yield responseFunctionCallArgumentsDeltaStreamingEventSchema.parse({
                        type: "response.function_call_arguments.delta",
                        sequence_number: seq++,
                        item_id: fnCallId,
                        output_index: 3,
                        delta: fragment,
                    });
                }
            }
        }

        const finalArgs = argsAccumulated || "{}";

        if (abortSignal.aborted) return;
        yield responseFunctionCallArgumentsDoneStreamingEventSchema.parse({
            type: "response.function_call_arguments.done",
            sequence_number: seq++,
            item_id: fnCallId,
            output_index: 3,
            arguments: finalArgs,
        });

        if (abortSignal.aborted) return;
        yield responseOutputItemDoneStreamingEventSchema.parse({
            type: "response.output_item.done",
            sequence_number: seq++,
            output_index: 3,
            item: FunctionCallItemShape.parse({
                id: fnCallId,
                type: "function_call",
                call_id: callId,
                name: "get_weather",
                arguments: finalArgs,
                status: "completed",
            }),
        });

        // ── OUTPUT 4: reasoning ─────────────────────────────────────────────────
        yield* streamReasoningBlock(
            llm,
            [
                ...messages,
                new ToolMessage({
                    content: `{"temperature": 22, "unit": "celsius", "description": "Partly cloudy"}`,
                    tool_call_id: callId,
                    name: "get_weather",
                }),
                new HumanMessage("Reflect on the tool result and how to use it in your answer."),
            ],
            4,
            abortSignal,
        );

        // ── OUTPUT 5: message ───────────────────────────────────────────────────
        yield* streamMessageBlock(
            llm,
            `Give a final helpful answer incorporating weather info for: ${inputSummary}`,
            5,
            abortSignal,
        );

        // ── response.completed ──────────────────────────────────────────────────
        yield responseCompletedStreamingEventSchema.parse({
            type: "response.completed",
            sequence_number: seq++,
            response: {
                ...inProgressResponse,
                status: "completed",
                completed_at: Math.floor(Date.now() / 1000),
            },
        });
    }

    // ── Simple pong streaming (no Ollama required) ──────────────────────────
    // Produces a minimal streaming sequence for compliance testing:
    //   response.created → content_part.added → output_text.delta →
    //   output_text.done → content_part.done → output_item.done → response.completed
    //
    // This mirrors the structure of a real streaming response but uses
    // a hardcoded "pong" text instead of LLM output.
    private *streamSimplePong(
        request: AgentInvokeRequest,
        respId: string,
        seq: number,
        now: number,
        abortSignal: AbortSignal,
    ): Iterable<ResponseStreamEvent> {
        const msgId = `msg_${randomUUID()}`;

        const inProgressResponse = responseResourceSchema.parse({
            id: respId,
            object: "response",
            created_at: now,
            completed_at: null,
            status: "in_progress",
            model: request.model,
            previous_response_id: null,
            instructions: null,
            output: [],
            error: null,
            tools: [],
            tool_choice: "auto",
            truncation: "disabled",
            parallel_tool_calls: true,
            text: { format: { type: "text" } },
            top_p: 1,
            presence_penalty: 0,
            frequency_penalty: 0,
            top_logprobs: 0,
            temperature: 1,
            reasoning: null,
            usage: {
                input_tokens: 0,
                output_tokens: 0,
                total_tokens: 0,
                input_tokens_details: { cached_tokens: 0 },
                output_tokens_details: { reasoning_tokens: 0 },
            },
            max_output_tokens: null,
            max_tool_calls: null,
            store: true,
            background: false,
            service_tier: "default",
            metadata: {},
            safety_identifier: null,
            prompt_cache_key: null,
            incomplete_details: null,
        });

        // response.created
        if (abortSignal.aborted) return;
        yield responseCreatedStreamingEventSchema.parse({
            type: "response.created",
            sequence_number: seq++,
            response: inProgressResponse,
        });

        // output_item.added
        if (abortSignal.aborted) return;
        yield responseOutputItemAddedStreamingEventSchema.parse({
            type: "response.output_item.added",
            sequence_number: seq++,
            output_index: 0,
            item: MessageItemShape.parse({
                id: msgId,
                type: "message",
                status: "in_progress",
                role: "assistant",
                content: [],
            }),
        });

        // content_part.added
        if (abortSignal.aborted) return;
        yield responseContentPartAddedStreamingEventSchema.parse({
            type: "response.content_part.added",
            sequence_number: seq++,
            item_id: msgId,
            output_index: 0,
            content_index: 0,
            part: {
                type: "output_text" as const,
                text: "",
                annotations: [],
            },
        });

        // output_text.delta
        if (abortSignal.aborted) return;
        yield responseOutputTextDeltaStreamingEventSchema.parse({
            type: "response.output_text.delta",
            sequence_number: seq++,
            item_id: msgId,
            output_index: 0,
            content_index: 0,
            delta: "pong",
        });

        // output_text.done
        if (abortSignal.aborted) return;
        yield responseOutputTextDoneStreamingEventSchema.parse({
            type: "response.output_text.done",
            sequence_number: seq++,
            item_id: msgId,
            output_index: 0,
            content_index: 0,
            text: "pong",
        });

        // content_part.done
        if (abortSignal.aborted) return;
        yield responseContentPartDoneStreamingEventSchema.parse({
            type: "response.content_part.done",
            sequence_number: seq++,
            item_id: msgId,
            output_index: 0,
            content_index: 0,
            part: {
                type: "output_text" as const,
                text: "pong",
                annotations: [],
            },
        });

        // output_item.done
        if (abortSignal.aborted) return;
        yield responseOutputItemDoneStreamingEventSchema.parse({
            type: "response.output_item.done",
            sequence_number: seq++,
            output_index: 0,
            item: MessageItemShape.parse({
                id: msgId,
                type: "message",
                status: "completed",
                role: "assistant",
                content: [{ type: "output_text", text: "pong", annotations: [] }],
            }),
        });

        // response.completed
        if (abortSignal.aborted) return;
        yield responseCompletedStreamingEventSchema.parse({
            type: "response.completed",
            sequence_number: seq++,
            response: {
                ...inProgressResponse,
                status: "completed",
                completed_at: Math.floor(Date.now() / 1000),
                output: [
                    {
                        id: msgId,
                        type: "message",
                        status: "completed",
                        role: "assistant",
                        content: [{ type: "output_text", text: "pong", annotations: [] }],
                    },
                ],
                usage: {
                    input_tokens: 1,
                    output_tokens: 1,
                    total_tokens: 2,
                    input_tokens_details: { cached_tokens: 0 },
                    output_tokens_details: { reasoning_tokens: 0 },
                },
            },
        });
    }

    // ── Ollama reachability check ──────────────────────────────────────────
    private async isOllamaReachable(baseUrl: string): Promise<boolean> {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => {
                controller.abort();
            }, 2000);
            const response = await fetch(`${baseUrl}/api/tags`, {
                signal: controller.signal,
            });
            clearTimeout(timeoutId);
            return response.ok;
        } catch {
            return false;
        }
    }
}
