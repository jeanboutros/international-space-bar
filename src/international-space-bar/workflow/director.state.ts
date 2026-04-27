/**
 * Director workflow state schema.
 *
 * Defines the data flowing through the top-level agency-director graph
 * that routes user input to the correct execution path and optionally
 * triggers a post-outcome council.
 */

import { MessagesValue, StateSchema } from "@langchain/langgraph";
import { z } from "zod";

export const DirectorState = new StateSchema({
    /** Conversation messages (uses built-in LangGraph message reducer). */
    messages: MessagesValue,

    /** The user's original query text. */
    query: z.string(),

    /**
     * Classified intent — set by the director routing node.
     * "council" triggers the council sub-graph directly.
     * "query" and "reasoning" go through their respective paths first,
     * then hit the post-outcome council gate.
     */
    intent: z.enum(["query", "reasoning", "council"]).default("query"),

    /** Output produced by the orchestrator or reasoning path. */
    outcome: z.string().default(""),

    /** Whether the post-outcome council gate decided to trigger the council. */
    councilTriggered: z.boolean().default(false),

    /** Council verdict (populated only when the council runs). */
    councilVerdict: z.string().default(""),

    /** Final response presented to the user. */
    finalResponse: z.string().default(""),
});
