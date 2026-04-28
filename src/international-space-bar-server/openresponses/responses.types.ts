import type { z } from "zod";
import type { CreateResponseSchema } from "./responses.schemas.js";

export type CreateResponseBody = z.infer<typeof CreateResponseSchema>;

export interface ResponseResource {
    id: string;
    object: "response";
    created_at: number;
    model: string;
    status: "completed" | "in_progress" | "failed";
    output: OutputMessage[];
    usage: Usage;
}

export interface OutputMessage {
    id: string;
    type: "message";
    status: "completed";
    role: "assistant";
    content: OutputContent[];
}

export interface OutputContent {
    type: "output_text";
    text: string;
    annotations: unknown[];
}

export interface Usage {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
}
