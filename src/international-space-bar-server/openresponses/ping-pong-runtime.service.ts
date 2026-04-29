// SCAFFOLD: Temporary file. Real LLM calls via ChatOllama until LangGraph is wired.
// TODO(isb-0020): Delete this file entirely when LangGraph adapter is wired.
import { randomUUID } from "node:crypto";
import { type BaseMessage, HumanMessage, ToolMessage } from "@langchain/core/messages"; // TODO: REMOVE BEFORE PRODUCTION
import { ChatOllama } from "@langchain/ollama"; // TODO: REMOVE BEFORE PRODUCTION
import { Injectable } from "@nestjs/common";
import { z } from "zod";

import type { AgentInvokeRequest, AgentRuntimePort } from "./agent-runtime.port.js";
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
    // constructor(@Inject(LOGGER) private readonly logger: ILogger) {}
    invoke(request: AgentInvokeRequest): Promise<ResponseResource> {
        const now = Math.floor(Date.now() / 1000);
        return Promise.resolve(
            responseResourceSchema.parse({
                id: `resp_${randomUUID()}`,
                object: "response",
                created_at: now,
                completed_at: now,
                status: "completed",
                model: request.model,
                previous_response_id: null,
                instructions: null,
                output: [
                    {
                        id: `msg_${randomUUID()}`,
                        type: "message",
                        status: "completed",
                        role: "assistant",
                        content: [
                            {
                                type: "output_text",
                                text: "pong",
                                annotations: [],
                            },
                        ],
                    },
                ],
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
                    output_tokens: 1,
                    total_tokens: 1,
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
            }),
        );
    }

    // stream() — scaffold implementation using ChatOllama.
    // Fires 6 LLM calls producing: reasoning → message → reasoning → function_call → reasoning → message
    // TODO(isb-0020): Delete this entire method when LangGraph adapter is wired.
    async *stream(request: AgentInvokeRequest): AsyncIterable<ResponseStreamEvent> {
        const respId = `resp_${randomUUID()}`;
        let seq = 0;
        const now = Math.floor(Date.now() / 1000);

        // TODO: REMOVE BEFORE PRODUCTION
        const llm = new ChatOllama({ model: "gemma4:e2b", baseUrl: "http://localhost:11434" });

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
            for await (const chunk of await model.stream(messages)) {
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
            for await (const chunk of await model.stream([new HumanMessage(prompt)])) {
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

        yield responseCreatedStreamingEventSchema.parse({
            type: "response.created",
            sequence_number: seq++,
            response: inProgressResponse,
        });

        // ── OUTPUT 0: reasoning ─────────────────────────────────────────────────
        yield* streamReasoningBlock(
            llm,
            [
                new HumanMessage(
                    `Think step by step about what the user is asking: ${request.input}`,
                ),
            ],
            0,
        );

        // ── OUTPUT 1: message ───────────────────────────────────────────────────
        yield* streamMessageBlock(llm, `Respond helpfully to: ${request.input}`, 1);

        // ── OUTPUT 2: reasoning ─────────────────────────────────────────────────
        yield* streamReasoningBlock(
            llm,
            [new HumanMessage(`Think about what tool you need to fully answer: ${request.input}`)],
            2,
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
        for await (const chunk of await llmWithTools.stream([
            new HumanMessage(
                `You must call the get_weather function. The user asked: ${request.input}`,
            ),
        ])) {
            // Collect tool call argument fragments from the chunk
            const toolCalls =
                (chunk.tool_calls as Array<{ args?: string }> | undefined) ??
                (
                    chunk.additional_kwargs as
                        | { tool_calls?: Array<{ function?: { arguments?: string } }> }
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

        yield responseFunctionCallArgumentsDoneStreamingEventSchema.parse({
            type: "response.function_call_arguments.done",
            sequence_number: seq++,
            item_id: fnCallId,
            output_index: 3,
            arguments: finalArgs,
        });

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
                new HumanMessage(String(request.input)),
                new ToolMessage({
                    content: `{"temperature": 22, "unit": "celsius", "description": "Partly cloudy"}`,
                    tool_call_id: callId,
                    name: "get_weather",
                }),
                new HumanMessage("Reflect on the tool result and how to use it in your answer."),
            ],
            4,
        );

        // ── OUTPUT 5: message ───────────────────────────────────────────────────
        yield* streamMessageBlock(
            llm,
            `Give a final helpful answer incorporating weather info for: ${request.input}`,
            5,
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
}
