/**
 * Council LangGraph workflow.
 *
 * Implements the full council protocol as a deterministic state-graph:
 *
 * ```
 * __start__
 *     │
 *     ▼
 *  frameQuestion
 *     │
 *     ├──Send──▶ advisor (×5 in parallel)
 *     │                  │
 *     ▼                  ▼
 *  anonymise  ◀──────────┘
 *     │
 *     ├──Send──▶ reviewer (×5 in parallel)
 *     │                   │
 *     ▼                   ▼
 *  chairman   ◀───────────┘
 *     │
 *     ▼
 *  generateReport
 *     │
 *     ▼
 *  __end__
 * ```
 *
 * Routing lives in the graph edges — agent prompts no longer specify
 * where to send output next.
 */

import { END, type GraphNode, Send, START, StateGraph } from "@langchain/langgraph";
import { getAgent } from "../agent/agent-loader.js";
import { Logging } from "../logging.js";
import { ADVISOR_IDENTITIES } from "./council.advisors.js";
import { CouncilContextSchema } from "./council.context.js";
import {
    type AdvisorResponse,
    type AdvisorWorkerState,
    type AnonymisationEntry,
    CouncilState,
    type ReviewerResponse,
    type ReviewerWorkerState,
} from "./council.state.js";

const logger = Logging.getLogger("workflow.council");

/** Retry policy for nodes that call external LLM APIs. */
const LLM_RETRY_POLICY = {
    maxAttempts: 3,
    initialInterval: 500,
    backoffFactor: 2,
    maxInterval: 10_000,
};

/** Extract typed context from runnable config. Context is guaranteed by the context schema. */
function getContext(config: { context?: import("./council.context.js").CouncilContext }) {
    const ctx = config.context;
    if (!ctx)
        throw new Error("Council context is missing — was the graph invoked without a context?");
    return ctx;
}

// ---------------------------------------------------------------------------
// Types for node signatures
// ---------------------------------------------------------------------------

type CouncilNode = GraphNode<{
    InputSchema: typeof CouncilState;
    OutputSchema: typeof CouncilState;
    ContextSchema: typeof CouncilContextSchema;
    Nodes: "frameQuestion" | "advisor" | "anonymise" | "reviewer" | "chairman" | "generateReport";
}>;

type AdvisorWorkerNode = GraphNode<{
    InputSchema: typeof AdvisorWorkerState;
    OutputSchema: typeof AdvisorWorkerState;
    ContextSchema: typeof CouncilContextSchema;
    Nodes: never;
}>;

type ReviewerWorkerNode = GraphNode<{
    InputSchema: typeof ReviewerWorkerState;
    OutputSchema: typeof ReviewerWorkerState;
    ContextSchema: typeof CouncilContextSchema;
    Nodes: never;
}>;

// ---------------------------------------------------------------------------
// Node implementations
// ---------------------------------------------------------------------------

/**
 * Step 1 — Frame the raw question into a neutral, context-enriched prompt.
 *
 * Invokes the council.conductor agent which scans the workspace for context
 * (AGENTS.md, memory, recent council transcripts) and reframes the raw question
 * into a clear, neutral prompt. If the question is too vague, the conductor
 * returns a `STATUS: BLOCKED` result.
 */
const frameQuestion: CouncilNode = async (state, runnableConfig) => {
    const { ctx, thread_id } = getContext(runnableConfig);
    logger.info({ rawQuestion: state.rawQuestion }, "Framing question via council conductor");
    const result = await getAgent("council.conductor").invoke(
        `Frame the following question for council deliberation:\n\n${state.rawQuestion}`,
        ctx,
        `${thread_id}-frame`,
    );
    logger.debug({ length: result.lastContent.length }, "Question framed");
    return { framedQuestion: result.lastContent };
};

/**
 * Step 2 worker — A single advisor produces its analysis.
 *
 * Each parallel instance receives its identity via the {@link Send} payload.
 * The agent's system prompt instructs it to adopt the assigned identity.
 * The response is appended to `advisorResponses` via the concat reducer.
 */
const advisor: AdvisorWorkerNode = async (state, runnableConfig) => {
    const { ctx, thread_id } = getContext(runnableConfig);
    logger.info({ advisor: state.advisorName }, "Invoking advisor agent");
    const result = await getAgent("council.sub.advisor").invoke(
        [
            `**Your Advisor Identity:** ${state.advisorName}`,
            `**Your Thinking Style:** ${state.advisorDescription}`,
            "",
            `**The Framed Question:**`,
            state.framedQuestion,
        ].join("\n"),
        ctx,
        `${thread_id}-advisor-${state.advisorName.toLowerCase().replace(/\s+/g, "-")}`,
    );
    logger.debug(
        { advisor: state.advisorName, length: result.lastContent.length },
        "Advisor completed",
    );
    return {
        advisorResponses: [{ advisorName: state.advisorName, response: result.lastContent }],
    };
};

/**
 * Intermediate step — anonymise advisor responses for peer review.
 *
 * Shuffles the advisor → letter mapping randomly so reviewers cannot
 * infer identities from ordering.
 */
// eslint-disable-next-line @typescript-eslint/require-await -- pure logic, no I/O
const anonymise: CouncilNode = async (state) => {
    const letters = ["A", "B", "C", "D", "E"];
    const shuffled = [...state.advisorResponses].sort(() => Math.random() - 0.5);
    const anonymisationMap: AnonymisationEntry[] = shuffled.map((entry, i) => ({
        letter: letters[i],
        advisorName: entry.advisorName,
    }));
    return { anonymisationMap };
};

/**
 * Step 3 worker — A single reviewer evaluates the anonymised responses.
 *
 * Each parallel instance receives the anonymised response block and evaluates
 * purely on merit. The reviewer does not know which advisor wrote which response.
 */
const reviewer: ReviewerWorkerNode = async (state, runnableConfig) => {
    const { ctx, thread_id } = getContext(runnableConfig);
    logger.info({ reviewerIndex: state.reviewerIndex }, "Invoking reviewer agent");
    const result = await getAgent("council.sub.reviewer").invoke(
        [
            `**The Framed Question:**`,
            state.framedQuestion,
            "",
            `**Anonymised Advisor Responses:**`,
            state.anonymisedResponses,
        ].join("\n"),
        ctx,
        `${thread_id}-reviewer-${state.reviewerIndex}`,
    );
    logger.debug(
        { reviewerIndex: state.reviewerIndex, length: result.lastContent.length },
        "Reviewer completed",
    );
    return {
        reviewerResponses: [{ reviewerIndex: state.reviewerIndex, review: result.lastContent }],
    };
};

/**
 * Step 4 — Chairman synthesises all advisor responses and peer reviews.
 *
 * Receives the full set of de-anonymised advisor responses and all peer reviews,
 * then produces a structured verdict with 5 sections per the chairman agent's
 * system prompt.
 */
const chairman: CouncilNode = async (state, runnableConfig) => {
    const { ctx, thread_id } = getContext(runnableConfig);
    const advisorBlock = state.advisorResponses
        .map((a: AdvisorResponse) => `### ${a.advisorName}\n${a.response}`)
        .join("\n\n");
    const reviewBlock = state.reviewerResponses
        .map((r: ReviewerResponse) => `### Reviewer ${r.reviewerIndex}\n${r.review}`)
        .join("\n\n");

    logger.info("Invoking chairman agent");
    const result = await getAgent("council.sub.chairman").invoke(
        [
            `**The Framed Question:**`,
            state.framedQuestion,
            "",
            `**Advisor Responses:**`,
            advisorBlock,
            "",
            `**Peer Reviews:**`,
            reviewBlock,
        ].join("\n"),
        ctx,
        `${thread_id}-chairman`,
    );
    logger.debug({ length: result.lastContent.length }, "Chairman completed");
    return { chairmanVerdict: result.lastContent };
};

/**
 * Step 5 — Generate Markdown and transcript report files.
 *
 * Writes the chairman verdict and full transcript to disk so the council
 * output is persistent and browsable outside the TUI.
 */
const generateReport: CouncilNode = async (state) => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");

    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const dir = path.join("logs", "council-reports");
    await fs.mkdir(dir, { recursive: true });

    // Build the full transcript (advisors → reviews → verdict)
    const advisorSection = state.advisorResponses
        .map((a: AdvisorResponse) => `### ${a.advisorName}\n${a.response}`)
        .join("\n\n");
    const reviewSection = state.reviewerResponses
        .map((r: ReviewerResponse) => `### Reviewer ${r.reviewerIndex}\n${r.review}`)
        .join("\n\n");

    const verdictPath = path.join(dir, `council-report-${ts}.md`);
    const transcriptPath = path.join(dir, `council-transcript-${ts}.md`);

    const verdictContent = [
        `# Council Report — ${new Date().toISOString()}`,
        "",
        `## Question`,
        state.framedQuestion,
        "",
        state.chairmanVerdict,
    ].join("\n");

    const transcriptContent = [
        `# Council Transcript — ${new Date().toISOString()}`,
        "",
        `## Framed Question`,
        state.framedQuestion,
        "",
        `## Advisor Responses`,
        advisorSection,
        "",
        `## Anonymisation Map`,
        state.anonymisationMap
            .map((e: AnonymisationEntry) => `- ${e.letter} → ${e.advisorName}`)
            .join("\n"),
        "",
        `## Peer Reviews`,
        reviewSection,
        "",
        `## Chairman Verdict`,
        state.chairmanVerdict,
    ].join("\n");

    await Promise.all([
        fs.writeFile(verdictPath, verdictContent, "utf-8"),
        fs.writeFile(transcriptPath, transcriptContent, "utf-8"),
    ]);

    logger.info({ verdictPath, transcriptPath }, "Council reports written");
    return { reportPaths: [verdictPath, transcriptPath] };
};

// ---------------------------------------------------------------------------
// Conditional edge routers (fan-out via Send)
// ---------------------------------------------------------------------------

/**
 * After framing, fan out to 5 advisor workers in parallel.
 */
const fanOutAdvisors = (state: { framedQuestion: string }) => {
    return ADVISOR_IDENTITIES.map(
        (identity) =>
            new Send("advisor", {
                framedQuestion: state.framedQuestion,
                advisorName: identity.name,
                advisorDescription: identity.description,
            }),
    );
};

/**
 * After anonymisation, fan out to 5 reviewer workers in parallel.
 */
const fanOutReviewers = (state: {
    framedQuestion: string;
    anonymisationMap: AnonymisationEntry[];
    advisorResponses: AdvisorResponse[];
}) => {
    const map = state.anonymisationMap;
    const anonymisedBlock = map
        .map((entry: AnonymisationEntry) => {
            const resp = state.advisorResponses.find(
                (a: AdvisorResponse) => a.advisorName === entry.advisorName,
            );
            return `**Response ${entry.letter}:**\n${resp?.response ?? "[missing]"}`;
        })
        .join("\n\n");

    return Array.from(
        { length: 5 },
        (_, i) =>
            new Send("reviewer", {
                framedQuestion: state.framedQuestion,
                anonymisedResponses: anonymisedBlock,
                reviewerIndex: i + 1,
            }),
    );
};

// ---------------------------------------------------------------------------
// Compile the council sub-graph
// ---------------------------------------------------------------------------

export function buildCouncilWorkflow() {
    return (
        new StateGraph(CouncilState, { context: CouncilContextSchema })
            .addNode("frameQuestion", frameQuestion, { retryPolicy: LLM_RETRY_POLICY })
            .addNode("advisor", advisor, { retryPolicy: LLM_RETRY_POLICY })
            .addNode("anonymise", anonymise)
            .addNode("reviewer", reviewer, { retryPolicy: LLM_RETRY_POLICY })
            .addNode("chairman", chairman, { retryPolicy: LLM_RETRY_POLICY })
            .addNode("generateReport", generateReport)
            // Step 1: start → frame
            .addEdge(START, "frameQuestion")
            // Step 2: frame → fan-out to 5 advisors in parallel
            .addConditionalEdges("frameQuestion", fanOutAdvisors, ["advisor"])
            // All advisors converge → anonymise
            .addEdge("advisor", "anonymise")
            // Step 3: anonymise → fan-out to 5 reviewers in parallel
            .addConditionalEdges("anonymise", fanOutReviewers, ["reviewer"])
            // All reviewers converge → chairman
            .addEdge("reviewer", "chairman")
            // Step 4 → Step 5
            .addEdge("chairman", "generateReport")
            // Done
            .addEdge("generateReport", END)
            .compile()
    );
}
