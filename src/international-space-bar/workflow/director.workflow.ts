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
 *     ├─ "query"     ──▶ orchestrator ──▶ councilGate ─┬─ yes ──▶ council ──▶ present
 *     │                                                 └─ no  ──────────────▶ present
 *     ├─ "reasoning" ──▶ reasoning    ──▶ councilGate ─┬─ yes ──▶ council ──▶ present
 *     │                                                 └─ no  ──────────────▶ present
 *     └─ "council"   ──▶ council ─────────────────────────────────────────────▶ present
 *                                                                                 │
 *                                                                                 ▼
 *                                                                             __end__
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
    Nodes: "classifyIntent" | "orchestrator" | "reasoning" | "councilGate" | "council" | "present";
}>;

// ---------------------------------------------------------------------------
// Node factory (needs config for the classifier)
// ---------------------------------------------------------------------------

function createNodes(config: IConfig) {
    const classify = createIntentClassifier(config);
    const classifyCouncilGate = createCouncilGateClassifier(config);
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
        logger.info({ query: state.query }, "Invoking orchestrator agent");
        const result = await getAgent("orchestrator").invoke(state.query, ctx, thread_id);
        logger.debug({ length: result.lastContent.length }, "Orchestrator agent completed");
        return { outcome: result.lastContent, messages: result.messages };
    };

    /**
     * Reasoning node — invokes the reasoner agent for chain-of-thought decomposition.
     */
    const reasoning: DirectorNode = async (state, runnableConfig) => {
        const { ctx, thread_id } = getContext(runnableConfig);
        logger.info({ query: state.query }, "Invoking reasoner agent");
        const result = await getAgent("reasoner").invoke(state.query, ctx, thread_id);
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

    return { classifyIntent, orchestrator, reasoning, councilGate, council, present };
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
 * Routes from councilGate — either into the council or straight to present.
 */
const routeCouncilGate: ConditionalEdgeRouter<
    typeof DirectorState,
    DirectorContext,
    "council" | "present"
> = (state) => {
    return state.councilTriggered ? "council" : "present";
};

// ---------------------------------------------------------------------------
// Compile the director graph
// ---------------------------------------------------------------------------

export function buildDirectorWorkflow(config: IConfig) {
    const { classifyIntent, orchestrator, reasoning, councilGate, council, present } =
        createNodes(config);

    return (
        new StateGraph(DirectorState, { context: DirectorContextSchema })
            .addNode("classifyIntent", classifyIntent, { retryPolicy: LLM_RETRY_POLICY })
            .addNode("orchestrator", orchestrator, { retryPolicy: LLM_RETRY_POLICY })
            .addNode("reasoning", reasoning, { retryPolicy: LLM_RETRY_POLICY })
            .addNode("councilGate", councilGate, { retryPolicy: LLM_RETRY_POLICY })
            .addNode("council", council, { retryPolicy: LLM_RETRY_POLICY })
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
            // Council gate → council or present
            .addConditionalEdges("councilGate", routeCouncilGate, ["council", "present"])
            // Direct council and gate-triggered council → present
            .addEdge("council", "present")
            // Present → end
            .addEdge("present", END)
            .compile()
    );
}
