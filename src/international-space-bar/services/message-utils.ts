/**
 * Shared utilities for parsing LangGraph messages.
 *
 * These helpers transform raw LangGraph message objects into typed data
 * used by both the agent layer (extracting results) and the TUI layer
 * (rendering messages). Living in `services/` ensures neither layer
 * depends on the other.
 *
 * Messages may arrive in two shapes:
 * 1. **Class instances** — have `_getType()`, direct `.content`, `.additional_kwargs`, `.usage_metadata`
 * 2. **Serialized LC objects** — `{ lc, type:"constructor", id:["langchain_core","messages","AIMessage"], kwargs:{ content, additional_kwargs, usage_metadata } }`
 *
 * All helpers normalise both shapes transparently.
 */

import type { TokenUsage } from "../interfaces/agent.interface.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Normalised message fields after unwrapping LC serialization. */
export interface NormalisedMessage {
    readonly messageType: string | undefined;
    readonly content: unknown;
    readonly additional_kwargs: Record<string, unknown> | undefined;
    readonly usage_metadata: { input_tokens?: number; output_tokens?: number } | undefined;
}

/** Shape of a raw LangGraph message as seen at runtime (class instance). */
export interface RawLangGraphMessage {
    readonly _getType?: () => string;
    readonly content?: unknown;
    readonly additional_kwargs?: {
        readonly reasoning_content?: string;
        readonly [key: string]: unknown;
    };
    readonly usage_metadata?: {
        readonly input_tokens?: number;
        readonly output_tokens?: number;
    };
}

/** Shape of a serialized LangChain constructor message. */
interface SerializedLCMessage {
    readonly lc: number;
    readonly type: "constructor";
    readonly id: readonly string[];
    readonly kwargs: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Internal normaliser
// ---------------------------------------------------------------------------

function isSerializedLC(msg: unknown): msg is SerializedLCMessage {
    const m = msg as Record<string, unknown>;
    return m.lc !== undefined && m.type === "constructor" && Array.isArray(m.id);
}

/**
 * Normalise a message from either the class-instance or serialized-LC shape
 * into a uniform struct.
 */
export function normaliseMessage(raw: unknown): NormalisedMessage {
    if (isSerializedLC(raw)) {
        // Serialized LC format: id is e.g. ["langchain_core","messages","AIMessage"]
        const className = raw.id.at(-1) ?? "";
        const kwargs = raw.kwargs;
        return {
            messageType: classNameToType(className),
            content: kwargs.content,
            additional_kwargs: kwargs.additional_kwargs as Record<string, unknown> | undefined,
            usage_metadata: kwargs.usage_metadata as NormalisedMessage["usage_metadata"],
        };
    }

    // Class instance format
    const msg = raw as RawLangGraphMessage;
    return {
        messageType: typeof msg._getType === "function" ? msg._getType() : undefined,
        content: msg.content,
        additional_kwargs: msg.additional_kwargs,
        usage_metadata: msg.usage_metadata,
    };
}

function classNameToType(name: string): string | undefined {
    switch (name) {
        case "HumanMessage":
            return "human";
        case "AIMessage":
            return "ai";
        case "SystemMessage":
            return "system";
        case "ToolMessage":
            return "tool";
        default:
            return undefined;
    }
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/**
 * Accumulate token usage across an array of LangGraph messages.
 */
export function extractTokenUsage(messages: unknown[]): TokenUsage | undefined {
    let inputTokens = 0;
    let outputTokens = 0;
    for (const entry of messages) {
        const { usage_metadata: meta } = normaliseMessage(entry);
        if (meta) {
            inputTokens += meta.input_tokens ?? 0;
            outputTokens += meta.output_tokens ?? 0;
        }
    }
    if (inputTokens === 0 && outputTokens === 0) return undefined;
    return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens };
}

/**
 * Extract the text content from a LangGraph message's content field.
 *
 * Handles plain strings, multi-part arrays (text + tool-use parts), and
 * falls back to JSON serialisation for unknown shapes.
 */
export function extractMessageContent(content: unknown): string {
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
        return content
            .filter((part): part is { type: "text"; text: string } => {
                const p = part as Record<string, unknown>;
                return p.type === "text" && typeof p.text === "string";
            })
            .map((part) => part.text)
            .join("");
    }
    return typeof content === "undefined" || content === null ? "" : JSON.stringify(content);
}

/**
 * Resolve a LangGraph message to a UI-friendly role.
 *
 * Returns `null` for internal message types (tool, function) that should
 * not be shown to end-users.
 */
export function resolveMessageRole(msg: unknown): "user" | "agent" | "system" | null {
    const { messageType } = normaliseMessage(msg);
    switch (messageType) {
        case "human":
            return "user";
        case "ai":
            return "agent";
        case "system":
            return "system";
        default:
            return null;
    }
}
