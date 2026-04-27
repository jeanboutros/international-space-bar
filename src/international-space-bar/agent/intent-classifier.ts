/**
 * Intent classifier agent.
 *
 * A compiled, deterministic LLM-based agent that classifies user input
 * into one of a fixed set of intent categories. Uses Ollama with structured
 * output to guarantee the response conforms to the expected schema.
 *
 * Unlike YAML-loaded agents, this is defined entirely in TypeScript and
 * compiled at import time — no dynamic loading required.
 */

import { z } from "zod";
import type { IConfig } from "../interfaces/config.interface.js";
import { createOllamaLLM } from "../llm/ollama.js";

// ---------------------------------------------------------------------------
// Intent schema
// ---------------------------------------------------------------------------

export const IntentSchema = z.object({
    intent: z
        .enum(["council", "reasoning", "query"])
        .describe("The classified intent category for the user's input."),
});

export type Intent = z.infer<typeof IntentSchema>;

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an intent classification agent. Your ONLY job is to read the user's input and classify it into exactly one of three categories.

You MUST respond with a JSON object matching { "intent": "<category>" }. Nothing else.

## Categories

### "council"
Choose this when the user explicitly requests a council deliberation or multi-perspective analysis.

Conditions:
- The input contains trigger phrases such as: "/council", "council this", "run the council", "war room this", "pressure-test this", "stress-test this", "debate this"
- The user is asking for a decision to be examined from multiple angles
- The user wants peer review, adversarial analysis, or a structured verdict on a complex decision
- Do NOT choose this for simple yes/no questions, factual lookups, or straightforward tasks

### "reasoning"
Choose this when the user needs complex, multi-step analysis or structured thinking.

Conditions:
- The input involves breaking a problem into parts, planning, analysing trade-offs, or systematic decomposition
- The user uses phrases like: "think through", "analyse", "analyze", "reason about", "break down", "plan how to", "what are the trade-offs", "compare approaches"
- The problem has multiple interacting variables that need step-by-step consideration
- Do NOT choose this for simple lookups or when the user explicitly asks for a council

### "query"
Choose this for everything else — straightforward questions, information retrieval, factual lookups, simple tasks.

Conditions:
- The user asks a question with a known or retrievable answer
- The user requests information: "what is", "how does", "find out", "search for", "tell me about"
- The task is a single-step action or a simple factual lookup
- When in doubt, default to this category

## Rules
- Always choose exactly one category
- If the input matches multiple categories, prefer the most specific: council > reasoning > query
- Never explain your choice — return only the JSON object`;

// ---------------------------------------------------------------------------
// Agent factory
// ---------------------------------------------------------------------------

/**
 * Creates an intent classifier that uses an Ollama model with structured output.
 *
 * @param config - Application config (used to resolve the default model).
 * @param modelOverride - Optional model name to override the config default.
 * @returns A function that classifies a user query into an {@link Intent}.
 */
export function createIntentClassifier(config: IConfig, modelOverride?: string) {
    const raw = modelOverride ?? config.defaultModel;
    // config.defaultModel uses "provider:model" format (e.g. "ollama:gemma4:e2b").
    // ChatOllama expects just the model portion.
    const modelName = raw.startsWith("ollama:") ? raw.slice("ollama:".length) : raw;
    const llm = createOllamaLLM({ model: modelName, temperature: 0 });
    const structured = llm.withStructuredOutput(IntentSchema);

    return async (query: string): Promise<Intent> => {
        const result = await structured.invoke([
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: query },
        ]);
        return result;
    };
}
