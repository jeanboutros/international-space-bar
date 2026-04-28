import type { z } from "zod";
import type { components } from "./openresponses.generated.js";
import type { CreateResponseSchema } from "./responses.schemas.js";

type Schemas = components["schemas"];

// ─── Input (validated by Zod schema — intentionally a subset) ───
export type CreateResponseBody = z.infer<typeof CreateResponseSchema>;

// ─── Full-spec input body (all fields from the OpenAPI spec) ───
export type SpecCreateResponseBody = Schemas["CreateResponseBody"];

// ─── Output types (auto-generated from OpenAPI spec) ───
export type ResponseResource = Schemas["ResponseResource"];
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
