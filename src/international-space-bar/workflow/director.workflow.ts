/**
 * Director LangGraph workflow.
 *
 * Top-level graph that models the agency-director routing logic.
 * Edges — not agent prompts — control where output flows next.
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

import {
    type ConditionalEdgeRouter,
    END,
    type GraphNode,
    START,
    StateGraph,
} from "@langchain/langgraph";
import { getAgent } from "../agent/agent-loader.js";
import { createCouncilGateClassifier } from "../agent/council-gate-classifier.js";
import { createIntentClassifier } from "../agent/intent-classifier.js";
import {
    createSatisfactionEvaluator,
    SATISFACTION_THRESHOLD,
} from "../agent/satisfaction-evaluator.js";
import type { IConfig } from "../interfaces/config.interface.js";
import { Logging } from "../logging.js";
import { buildCouncilWorkflow } from "./council.workflow.js";
import { type DirectorContext, DirectorContextSchema } from "./director.context.js";
import { DirectorState } from "./director.state.js";

const logger = Logging.getLogger("workflow.director");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Retry policy for nodes that call external LLM APIs. */
const LLM_RETRY_POLICY = {
    maxAttempts: 3,
    initialInterval: 500,
    backoffFactor: 2,
    maxInterval: 10_000,
};

/** Extract typed context from runnable config. Context is guaranteed by the context schema. */
function getContext(config: { context?: DirectorContext }) {
    const ctx = config.context;
    if (!ctx)
        throw new Error("Director context is missing — was the graph invoked without a context?");
    return ctx;
}

type DirectorNode = GraphNode<{
    InputSchema: typeof DirectorState;
    OutputSchema: typeof DirectorState;
    ContextSchema: typeof DirectorContextSchema;
    Nodes:
        | "classifyIntent"
        | "orchestrator"
        | "reasoning"
        | "councilGate"
        | "council"
        | "evaluate"
        | "present";
}>;

// ---------------------------------------------------------------------------
// Node factory (needs config for the classifier)
// ---------------------------------------------------------------------------

function createNodes(config: IConfig) {
    const classify = createIntentClassifier(config);
    const classifyCouncilGate = createCouncilGateClassifier(config);
    const evaluateSatisfaction = createSatisfactionEvaluator(config);
    const councilGraph = buildCouncilWorkflow();

    /**
     * Classify the user's intent using an LLM-based structured-output agent.
     */
    const classifyIntent: DirectorNode = async (state) => {
        logger.info({ query: state.query }, "Classifying user intent");
        const { intent } = await classify(state.query);
        logger.debug({ intent }, "Classified intent");
        return { intent };
    };

    /**
     * Orchestrator node — delegates to the orchestrator agent for query-mode work.
     */
    const orchestrator: DirectorNode = async (state, runnableConfig) => {
        const { ctx, thread_id } = getContext(runnableConfig);
        logger.info(
            { query: state.query, iteration: state.iteration },
            "Invoking orchestrator agent",
        );

        const enhancedQuery = state.feedback
            ? `${state.query}\n\n---\n[Refinement feedback from iteration ${state.iteration}: ${state.feedback}]`
            : state.query;

        const result = await getAgent("orchestrator").invoke(enhancedQuery, ctx, thread_id);
        logger.debug({ length: result.lastContent.length }, "Orchestrator agent completed");
        return { outcome: result.lastContent, messages: result.messages };
    };

    /**
     * Reasoning node — invokes the reasoner agent for chain-of-thought decomposition.
     */
    const reasoning: DirectorNode = async (state, runnableConfig) => {
        const { ctx, thread_id } = getContext(runnableConfig);
        logger.info({ query: state.query, iteration: state.iteration }, "Invoking reasoner agent");

        const enhancedQuery = state.feedback
            ? `${state.query}\n\n---\n[Refinement feedback from iteration ${state.iteration}: ${state.feedback}]`
            : state.query;

        const result = await getAgent("reasoner").invoke(enhancedQuery, ctx, thread_id);
        logger.debug({ length: result.lastContent.length }, "Reasoner agent completed");
        return { outcome: result.lastContent, messages: result.messages };
    };

    /**
     * Post-outcome council gate — LLM-based evaluation of whether the outcome
     * warrants a full council deliberation.
     */
    const councilGate: DirectorNode = async (state) => {
        const lower = state.query.toLowerCase();
        if (lower.includes("no council") || lower.includes("skip council")) {
            logger.debug("Council explicitly suppressed by user");
            return { councilTriggered: false };
        }
        logger.info("Evaluating outcome for council gate");
        const { shouldTrigger } = await classifyCouncilGate(state.query, state.outcome);
        logger.debug({ shouldTrigger }, "Council gate decision");
        return { councilTriggered: shouldTrigger };
    };

    /**
     * Council node — runs the full council sub-graph.
     *
     * The council sub-graph has a different state schema (CouncilState) from
     * the director (DirectorState), so we invoke it inside a node function
     * and transform state at the boundary per LangGraph subgraph best practices.
     */
    const council: DirectorNode = async (state, runnableConfig) => {
        const { ctx, thread_id } = getContext(runnableConfig);
        const question =
            state.intent === "council"
                ? state.query
                : `${state.query}\n\n---\nInitial outcome:\n${state.outcome}`;

        logger.info({ intent: state.intent }, "Invoking council sub-graph");
        const result = (await councilGraph.invoke(
            { rawQuestion: question },
            { context: { ctx, thread_id: `${thread_id}-council` } },
        )) as { chairmanVerdict: string };
        logger.debug(
            { verdictLength: result.chairmanVerdict.length },
            "Council sub-graph completed",
        );
        return { councilVerdict: result.chairmanVerdict };
    };

    /**
     * Evaluate node — assesses whether the outcome is satisfactory.
     *
     * If the satisfaction score is below the threshold and the maximum
     * number of iterations has not been reached, the workflow loops back
     * to the execution path with feedback injected into the query.
     *
     * If the score meets the threshold or max iterations is reached,
     * the workflow proceeds to present the result.
     */
    const evaluate: DirectorNode = async (state) => {
        // Skip evaluation if there's no outcome yet (shouldn't happen, but guard).
        if (!state.outcome && !state.councilVerdict) {
            logger.warn("Evaluate called with no outcome or council verdict — accepting as-is");
            return { satisfactionScore: 1, feedback: "" };
        }

        // Accept the result if we've reached max iterations.
        if (state.iteration >= state.maxIterations) {
            logger.info({ iteration: state.iteration }, "Max iterations reached, accepting result");
            return { satisfactionScore: 1, feedback: "" };
        }

        const outcomeToEvaluate = state.councilVerdict || state.outcome;

        logger.info({ iteration: state.iteration }, "Evaluating satisfaction");
        const { score, feedback } = await evaluateSatisfaction(
            state.query,
            outcomeToEvaluate,
            state.iteration,
            state.feedback,
        );

        logger.info(
            { score, feedback: feedback.slice(0, 100), iteration: state.iteration },
            "Satisfaction evaluation complete",
        );

        return {
            satisfactionScore: score,
            feedback: score < SATISFACTION_THRESHOLD ? feedback : "",
            iteration: state.iteration + 1,
        };
    };

    /**
     * Present node — assembles the final response for the user.
     */
    // eslint-disable-next-line @typescript-eslint/require-await -- pure logic, no I/O
    const present: DirectorNode = async (state) => {
        if (state.councilVerdict) {
            const parts = state.outcome
                ? [
                      `**Initial Outcome:**\n${state.outcome}`,
                      `**Council Verdict:**\n${state.councilVerdict}`,
                  ]
                : [`**Council Verdict:**\n${state.councilVerdict}`];
            return { finalResponse: parts.join("\n\n---\n\n") };
        }
        return { finalResponse: state.outcome };
    };

    return { classifyIntent, orchestrator, reasoning, councilGate, council, evaluate, present };
}

// ---------------------------------------------------------------------------
// Conditional edge routers
// ---------------------------------------------------------------------------

/**
 * Routes from classifyIntent to the correct execution path.
 */
const routeIntent: ConditionalEdgeRouter<
    typeof DirectorState,
    DirectorContext,
    "orchestrator" | "reasoning" | "council"
> = (state) => {
    if (state.intent === "council") return "council";
    if (state.intent === "reasoning") return "reasoning";
    return "orchestrator";
};

/**
 * Routes from councilGate — either into the council or straight to evaluate.
 */
const routeCouncilGate: ConditionalEdgeRouter<
    typeof DirectorState,
    DirectorContext,
    "council" | "evaluate"
> = (state) => {
    return state.councilTriggered ? "council" : "evaluate";
};

/**
 * Routes from evaluate — back to the execution path if unsatisfied,
 * or to present if satisfied or max iterations reached.
 */
const routeAfterEvaluate: ConditionalEdgeRouter<
    typeof DirectorState,
    DirectorContext,
    "orchestrator" | "reasoning" | "council" | "present"
> = (state) => {
    if (state.satisfactionScore >= SATISFACTION_THRESHOLD) {
        logger.info(
            { score: state.satisfactionScore },
            "Outcome satisfactory, proceeding to present",
        );
        return "present";
    }
    if (state.iteration >= state.maxIterations) {
        logger.info(
            { iteration: state.iteration },
            "Max iterations reached, presenting best result",
        );
        return "present";
    }

    // Route back to the original execution path with feedback
    logger.info(
        { score: state.satisfactionScore, iteration: state.iteration, intent: state.intent },
        "Outcome unsatisfactory, re-executing with feedback",
    );
    if (state.intent === "council") return "council";
    if (state.intent === "reasoning") return "reasoning";
    return "orchestrator";
};

// ---------------------------------------------------------------------------
// Compile the director graph
// ---------------------------------------------------------------------------

export function buildDirectorWorkflow(config: IConfig) {
    const { classifyIntent, orchestrator, reasoning, councilGate, council, evaluate, present } =
        createNodes(config);

    return (
        new StateGraph(DirectorState, { context: DirectorContextSchema })
            .addNode("classifyIntent", classifyIntent, { retryPolicy: LLM_RETRY_POLICY })
            .addNode("orchestrator", orchestrator, { retryPolicy: LLM_RETRY_POLICY })
            .addNode("reasoning", reasoning, { retryPolicy: LLM_RETRY_POLICY })
            .addNode("councilGate", councilGate, { retryPolicy: LLM_RETRY_POLICY })
            .addNode("council", council, { retryPolicy: LLM_RETRY_POLICY })
            .addNode("evaluate", evaluate, { retryPolicy: LLM_RETRY_POLICY })
            .addNode("present", present)
            // Entry
            .addEdge(START, "classifyIntent")
            // Intent routing
            .addConditionalEdges("classifyIntent", routeIntent, [
                "orchestrator",
                "reasoning",
                "council",
            ])
            // Query / reasoning → council gate
            .addEdge("orchestrator", "councilGate")
            .addEdge("reasoning", "councilGate")
            // Council gate → council or evaluate
            .addConditionalEdges("councilGate", routeCouncilGate, ["council", "evaluate"])
            // Council → evaluate (instead of directly to present)
            .addEdge("council", "evaluate")
            // Evaluate → satisfy? present; unsatisfy? loop back
            .addConditionalEdges("evaluate", routeAfterEvaluate, [
                "orchestrator",
                "reasoning",
                "council",
                "present",
            ])
            // Present → end
            .addEdge("present", END)
            .compile()
    );
}
