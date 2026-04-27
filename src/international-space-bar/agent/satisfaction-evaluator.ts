/**
 * Satisfaction evaluator agent.
 *
 * A compiled, deterministic LLM-based evaluator that assesses whether an
 * outcome produced by the director workflow is satisfactory. Uses Ollama
 * with structured output to guarantee the response conforms to the expected
 * schema.
 *
 * The evaluator checks:
 * 1. **Completeness** — Did the response address all parts of the query?
 * 2. **Accuracy** — Are claims verifiable or well-reasoned?
 * 3. **Clarity** — Is the response clear and well-structured?
 * 4. **Actionability** — Can the user act on this response?
 */

import { z } from "zod";
import type { IConfig } from "../interfaces/config.interface.js";
import { createOllamaLLM } from "../llm/ollama.js";
import { Logging } from "../logging.js";

const logger = Logging.getLogger("agent.satisfaction-evaluator");

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const SatisfactionSchema = z.object({
    score: z
        .number()
        .min(0)
        .max(1)
        .describe(
            "Satisfaction score from 0 (completely unsatisfied) to 1 (fully satisfied). " +
                ">= 0.7 means the outcome is acceptable.",
        ),
    feedback: z
        .string()
        .describe(
            "Specific, actionable feedback on why the outcome is unsatisfactory, " +
                "or 'Satisfactory' if score >= 0.7. " +
                "When unsatisfactory, this feedback is injected into the next iteration " +
                "to improve the result.",
        ),
});

export type SatisfactionResult = z.infer<typeof SatisfactionSchema>;

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a quality evaluator. Your ONLY job is to assess whether an AI-generated outcome satisfies the user's original query.

You MUST respond with a JSON object matching { "score": number, "feedback": string }. Nothing else.

## Evaluation Criteria

Score the outcome on a 0-1 scale based on these four dimensions, weighted equally:

### 1. Completeness (0-1)
- Did the response address ALL parts of the user's query?
- Were there questions left unanswered or topics ignored?
- Is anything the user explicitly asked for missing?

### 2. Accuracy (0-1)
- Are claims verifiable or well-reasoned?
- Are there factual errors, hallucinations, or unsupported assertions?
- Would an expert in this domain consider the response correct?

### 3. Clarity (0-1)
- Is the response clear, well-structured, and easy to understand?
- Is it free of unnecessary jargon or obscurity?
- Can the user immediately understand the answer?

### 4. Actionability (0-1)
- Can the user act on this response?
- Does it provide concrete next steps, or is it vague?
- Are recommendations specific enough to implement?

## Scoring Rules

- **0.7 or above**: The outcome is satisfactory. It addresses the query with reasonable completeness, accuracy, clarity, and actionability.
- **Below 0.7**: The outcome has significant shortcomings. Explain what's missing or wrong in the feedback field.

## Important

- If the outcome is a council verdict that synthesises multiple perspectives, it starts from a higher baseline (0.6) because councils are designed to produce thorough analyses.
- If the query was simple and factual, a concise correct answer should score >= 0.9.
- If the outcome contains obvious errors, contradictions, or misses major parts of the query, score below 0.5.
- Never give a perfect 1.0 unless the response is flawless.
- The feedback field is CRUCIAL when score < 0.7 — it will be fed back into the next iteration. Be specific about what needs improvement.`;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** Threshold above which the outcome is considered satisfactory. */
export const SATISFACTION_THRESHOLD = 0.7;

/**
 * Creates a satisfaction evaluator that assesses an outcome against a query.
 *
 * @param config - Application config (used to resolve the default model).
 * @param modelOverride - Optional model name to override the config default.
 * @returns A function that evaluates (query, outcome) → SatisfactionResult.
 */
export function createSatisfactionEvaluator(config: IConfig, modelOverride?: string) {
    const raw = modelOverride ?? config.defaultModel;
    const modelName = raw.startsWith("ollama:") ? raw.slice("ollama:".length) : raw;
    const llm = createOllamaLLM({ model: modelName, temperature: 0 });
    const structured = llm.withStructuredOutput(SatisfactionSchema);

    return async (
        query: string,
        outcome: string,
        iteration: number,
        previousFeedback: string,
    ): Promise<SatisfactionResult> => {
        logger.info(
            { iteration, queryLength: query.length, outcomeLength: outcome.length },
            "Evaluating satisfaction",
        );

        const previousContext =
            previousFeedback && iteration > 0
                ? `\n\n## Previous Iteration Feedback (iteration ${iteration})\n${previousFeedback}`
                : "";

        const userMessage = [
            `## Original Query\n${query}`,
            `\n## Outcome to Evaluate\n${outcome}`,
            `\n## Current Iteration: ${iteration + 1}`,
            previousContext,
        ].join("\n");

        try {
            const result = await structured.invoke([
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: userMessage },
            ]);
            logger.info(
                { score: result.score, feedbackLength: result.feedback.length, iteration },
                "Satisfaction evaluation complete",
            );
            return result;
        } catch (error) {
            logger.error(
                { err: error, iteration },
                "Satisfaction evaluation failed, defaulting to satisfied",
            );
            // If evaluation fails, accept the result to avoid infinite loops.
            return { score: 1.0, feedback: "Evaluation failed — accepting result" };
        }
    };
}
