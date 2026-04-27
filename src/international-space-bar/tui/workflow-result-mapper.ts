/**
 * Transforms raw LangGraph workflow output into UI-ready chat messages.
 *
 * This module sits between the workflow layer (which returns `DirectorState`)
 * and the TUI (which renders `ChatMessage[]`). It handles:
 *
 * - Extracting `reasoning_content` from `additional_kwargs` on messages
 *   and surfacing it as a separate "reasoning" entry before each message.
 * - Mapping LangGraph message roles to `ChatMessage` roles.
 *
 * Token extraction and message parsing utilities live in `services/message-utils.ts`
 * and are re-exported here for convenience.
 */

import {
    extractMessageContent,
    extractTokenUsage,
    normaliseMessage,
    resolveMessageRole,
} from "../services/message-utils.js";
import type { ChatMessage } from "./MessageList.js";

/**
 * Map LangGraph messages into displayable `ChatMessage[]`.
 *
 * For each message that carries `additional_kwargs.reasoning_content`,
 * a "reasoning" message is emitted immediately before the message itself.
 */
export function mapWorkflowMessages(raw: unknown[]): ChatMessage[] {
    const out: ChatMessage[] = [];

    for (const entry of raw) {
        const role = resolveMessageRole(entry);

        // Skip tool and system messages that aren't useful for the end-user.
        if (role === null) continue;

        const normalised = normaliseMessage(entry);

        // Surface reasoning / chain-of-thought content before the message.
        const reasoning = normalised.additional_kwargs?.reasoning_content;
        if (reasoning && typeof reasoning === "string" && reasoning.trim().length > 0) {
            out.push({ role: "reasoning", content: reasoning });
        }

        const content = extractMessageContent(normalised.content);
        if (content.length > 0) {
            out.push({ role, content });
        }
    }

    return out;
}

export { extractTokenUsage };
