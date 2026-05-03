// Converts OpenResponses input items to LangChain BaseMessage[].
//
// This is the single point of LangChain coupling in the server layer.
// The port boundary (AgentInvokeRequest) uses `string | readonly unknown[]`;
// this mapper performs runtime type discrimination and translates message items
// into LangChain types. Non-message items (reasoning, function_call, etc.) are
// skipped — they don't map to conversational messages.
//
// Coupling exception: importing from @langchain/core/messages is intentional.
// Uses generated types from openresponses/generated/ — never hand-roll
// duplicates of generated schemas (see AGENTS.md "Generated types" convention).

import {
    AIMessage,
    type BaseMessage,
    HumanMessage,
    SystemMessage,
} from "@langchain/core/messages";

// ── Runtime type guards ─────────────────────────────────────────────────────
// The port passes `readonly unknown[]` to stay framework-agnostic.
// We narrow at runtime using the OpenResponses discriminants (role, content).

interface MessageLike {
    role: string;
    content: string | readonly { type: string; text?: string }[];
}

function isMessageLike(item: unknown): item is MessageLike {
    if (typeof item !== "object" || item === null) return false;
    const record = item as Record<string, unknown>;
    return typeof record.role === "string" && (typeof record.content === "string" || Array.isArray(record.content));
}

/**
 * Extracts a plain-text string from a message item's content field.
 *
 * If content is a string, returns it directly.
 * If content is an array of content parts, concatenates input_text parts.
 */
function extractContent(item: MessageLike): string {
    if (typeof item.content === "string") return item.content;
    return item.content
        .filter((part) => part.type === "input_text" && typeof part.text === "string")
        .map((part) => part.text as string)
        .join("\n");
}

/**
 * Converts an OpenResponses input (string or item array) to LangChain BaseMessage[].
 *
 * - A plain string is wrapped in a single HumanMessage.
 * - An array is filtered to message-like items (those with a `role` and `content`
 *   field), then mapped role-by-role: system/developer → SystemMessage,
 *   user → HumanMessage, assistant → AIMessage.
 * - Non-message items (reasoning, function_call, compaction, etc.) are skipped.
 */
export function toBaseMessages(input: string | readonly unknown[]): BaseMessage[] {
    if (typeof input === "string") {
        return [new HumanMessage(input)];
    }

    return input.filter(isMessageLike).map((item) => {
        const text = extractContent(item);
        switch (item.role) {
            case "system":
            case "developer":
                return new SystemMessage(text);
            case "assistant":
                return new AIMessage(text);
            case "user":
            default:
                return new HumanMessage(text);
        }
    });
}
