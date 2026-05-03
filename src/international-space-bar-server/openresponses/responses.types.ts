import type { z } from "zod";
import type {
    errorStreamingEventSchema,
    responseCompletedStreamingEventSchema,
    responseContentPartAddedStreamingEventSchema,
    responseContentPartDoneStreamingEventSchema,
    responseCreatedStreamingEventSchema,
    responseFailedStreamingEventSchema,
    responseFunctionCallArgumentsDeltaStreamingEventSchema,
    responseFunctionCallArgumentsDoneStreamingEventSchema,
    responseIncompleteStreamingEventSchema,
    responseInProgressStreamingEventSchema,
    responseOutputItemAddedStreamingEventSchema,
    responseOutputItemDoneStreamingEventSchema,
    responseOutputTextDeltaStreamingEventSchema,
    responseOutputTextDoneStreamingEventSchema,
    responseReasoningDeltaStreamingEventSchema,
    responseReasoningDoneStreamingEventSchema,
    responseReasoningSummaryDeltaStreamingEventSchema,
    responseReasoningSummaryDoneStreamingEventSchema,
    responseReasoningSummaryPartAddedStreamingEventSchema,
    responseReasoningSummaryPartDoneStreamingEventSchema,
    responseResourceSchema,
} from "./generated/zod/index.js";
import type { components } from "./openresponses.generated.js";
import type { CreateResponseSchema } from "./responses.schemas.js";

type Schemas = components["schemas"];

// ─── Input (validated by Zod schema — intentionally a subset) ───
export type CreateResponseBody = z.infer<typeof CreateResponseSchema>;

// ─── Full-spec input body (all fields from the OpenAPI spec) ───
export type SpecCreateResponseBody = Schemas["CreateResponseBody"];

// ─── Output types ───
export type ResponseResource = z.infer<typeof responseResourceSchema>;
export type Usage = Schemas["Usage"];
export type InputTokensDetails = Schemas["InputTokensDetails"];
export type OutputTokensDetails = Schemas["OutputTokensDetails"];
export type ItemField = Schemas["ItemField"];
export type Message = Schemas["Message"];
export type FunctionCall = Schemas["FunctionCall"];
export type FunctionCallOutput = Schemas["FunctionCallOutput"];
export type ReasoningBody = Schemas["ReasoningBody"];
export type CompactionBody = Schemas["CompactionBody"];
export type OutputTextContent = Schemas["OutputTextContent"];
export type IncompleteDetails = Schemas["IncompleteDetails"];
export type Reasoning = Schemas["Reasoning"];
export type Tool = Schemas["Tool"];

// ─── Streaming event union (matches text/event-stream response in OpenAPI spec) ───
export type ResponseStreamEvent =
    | z.infer<typeof responseCreatedStreamingEventSchema>
    | z.infer<typeof responseInProgressStreamingEventSchema>
    | z.infer<typeof responseOutputItemAddedStreamingEventSchema>
    | z.infer<typeof responseOutputItemDoneStreamingEventSchema>
    | z.infer<typeof responseContentPartAddedStreamingEventSchema>
    | z.infer<typeof responseContentPartDoneStreamingEventSchema>
    | z.infer<typeof responseOutputTextDeltaStreamingEventSchema>
    | z.infer<typeof responseOutputTextDoneStreamingEventSchema>
    | z.infer<typeof responseFunctionCallArgumentsDeltaStreamingEventSchema>
    | z.infer<typeof responseFunctionCallArgumentsDoneStreamingEventSchema>
    | z.infer<typeof responseReasoningSummaryPartAddedStreamingEventSchema>
    | z.infer<typeof responseReasoningSummaryPartDoneStreamingEventSchema>
    | z.infer<typeof responseReasoningDeltaStreamingEventSchema>
    | z.infer<typeof responseReasoningDoneStreamingEventSchema>
    | z.infer<typeof responseReasoningSummaryDeltaStreamingEventSchema>
    | z.infer<typeof responseReasoningSummaryDoneStreamingEventSchema>
    | z.infer<typeof responseCompletedStreamingEventSchema>
    | z.infer<typeof responseFailedStreamingEventSchema>
    | z.infer<typeof responseIncompleteStreamingEventSchema>
    | z.infer<typeof errorStreamingEventSchema>;
