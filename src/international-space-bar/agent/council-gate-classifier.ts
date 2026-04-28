/**
 * Council gate classifier.
 *
 * An LLM-based binary classifier that evaluates whether the outcome of an
 * orchestrator or reasoning node warrants a full council deliberation.
 * Uses structured output to guarantee a deterministic boolean response.
 */

import { z } from "zod";
import type { IConfig } from "../interfaces/config.interface.js";
import { createOllamaLLMFromConfig } from "../llm/ollama.js";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const CouncilGateSchema = z.object({
    shouldTrigger: z
        .boolean()
        .describe("Whether the outcome warrants a full council deliberation."),
});

export type CouncilGateResult = z.infer<typeof CouncilGateSchema>;

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a council gate classifier. Your ONLY job is to decide whether an outcome warrants a full multi-perspective council deliberation.

You MUST respond with a JSON object matching { "shouldTrigger": true/false }. Nothing else.

## Trigger the council (true) when:
- The outcome involves a complex architectural or strategic decision with multiple valid approaches
- The outcome proposes a significant trade-off that could benefit from adversarial analysis
- The outcome is speculative, uncertain, or explicitly notes areas of doubt
- The outcome affects multiple stakeholders, systems, or long-term direction
- The outcome is longer than a few paragraphs and covers multiple interacting concerns

## Do NOT trigger the council (false) when:
- The outcome is a straightforward factual answer
- The outcome is a simple lookup, definition, or single-step task
- The outcome is a clear, unambiguous action with no meaningful alternatives
- The user explicitly said "no council" or "skip council" in their query
- The outcome is short and decisive with high confidence

## Rules
- Always return exactly one JSON object
- When in doubt, lean toward NOT triggering (false) to avoid unnecessary deliberation
- Never explain your choice — return only the JSON object`;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a council gate classifier that evaluates an outcome.
 *
 * @param config - Application config (used to resolve the default model).
 * @returns A function that classifies whether an outcome should trigger the council.
 */
export function createCouncilGateClassifier(config: IConfig) {
    const llm = createOllamaLLMFromConfig(config, config.defaultModel);
    const structured = llm.withStructuredOutput(CouncilGateSchema);

    return async (query: string, outcome: string): Promise<CouncilGateResult> => {
        const userMessage = `## Original Query\n${query}\n\n## Outcome to Evaluate\n${outcome}`;
        const result = await structured.invoke([
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userMessage },
        ]);
        return result;
    };
}
