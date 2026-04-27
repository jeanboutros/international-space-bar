/**
 * Director workflow state schema.
 *
 * Defines the data flowing through the top-level agency-director graph
 * that routes user input to the correct execution path, optionally triggers
 * a post-outcome council, and iterates until the outcome is satisfactory.
 *
 * ```
 * __start__
 *     │
 *     ▼
 *  classifyIntent
 *     │
 *     ├─ "query"     ──▶ orchestrator ──▶ councilGate ─┬─ yes ──▶ council ──┐
 *     │                                                 └─ no  ──────────────┤
 *     ├─ "reasoning" ──▶ reasoning    ──▶ councilGate ─┬─ yes ──▶ council ──┤
 *     │                                                 └─ no  ──────────────┤
 *     └─ "council"   ──▶ council ──────────────────────────────────────────┘
 *                                                                         │
 *                                                                         ▼
 *                                                                      evaluate
 *                                                                    ┌────────┤
 *                                              satisfied / max reached │        │ unsatisfied
 *                                                                    ▼        │
 *                                                                 present    ├──▶ back to
 *                                                                    │       │    execution
 *                                                                 __end__   ┘    node
 * ```
 */

import { MessagesValue, StateSchema } from "@langchain/langgraph";
import { z } from "zod";

/** Default maximum number of iterations before accepting the result. */
const DEFAULT_MAX_ITERATIONS = 3;

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

    // ── Iterative refinement loop fields ─────────────────────────────────

    /** Current iteration count (0-based). Incremented by the evaluate node. */
    iteration: z.number().default(0),

    /**
     * Maximum number of iterations before accepting the result regardless
     * of satisfaction score. Prevents infinite loops.
     */
    maxIterations: z.number().default(DEFAULT_MAX_ITERATIONS),

    /**
     * Satisfaction score from the evaluator (0-1).
     * Populated by the evaluate node after each execution path.
     */
    satisfactionScore: z.number().min(0).max(1).default(0),

    /**
     * Evaluator feedback explaining why the outcome is unsatisfactory.
     * Fed back into the next iteration's query to improve the result.
     * Empty string when the outcome is satisfactory.
     */
    feedback: z.string().default(""),
});
