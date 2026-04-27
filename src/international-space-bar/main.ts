import { randomUUID } from "node:crypto";
import { getAgent, loadAllAgents } from "./agent/agent-loader.js";
import { App } from "./app.js";
import { printBanner } from "./banner.js";
import type {
    IWorkflowRunner,
    WorkflowEvent,
    WorkflowResult,
} from "./interfaces/agent.interface.js";
import { renderTui } from "./tui/render.js";
import { buildDirectorWorkflow } from "./workflow/index.js";

const ENTRY_AGENT = "agency-director";

/**
 * Creates a streaming wrapper around the LangGraph director graph.
 *
 * Uses `graph.stream()` with `stream_mode: "updates"` to yield
 * `WorkflowEvent`s as each node completes, so the TUI can show
 * real-time progress during long-running workflows.
 */
function createWorkflowRunner(
    graph: ReturnType<typeof buildDirectorWorkflow>,
    ctx: import("./interfaces/app-context.interface.js").AppContext,
    threadId: string,
): IWorkflowRunner {
    return {
        async invoke(query: string): Promise<WorkflowResult> {
            const result = (await graph.invoke(
                { messages: [], query },
                { context: { ctx, thread_id: threadId } },
            )) as {
                messages: unknown[];
                finalResponse: string;
                iteration: number;
                satisfactionScore: number;
            };
            return {
                messages: result.messages ?? [],
                finalResponse: result.finalResponse ?? "",
            };
        },

        async *stream(query: string): AsyncIterable<WorkflowEvent> {
            const stream = await graph.stream(
                { messages: [], query },
                { context: { ctx, thread_id: threadId }, streamMode: "updates" },
            );

            let finalState: { messages: unknown[]; finalResponse: string } = {
                messages: [],
                finalResponse: "",
            };

            for await (const chunk of stream) {
                // Each chunk is `{ [nodeName]: partialState }` in "updates" mode
                const entries = Object.entries(chunk) as Array<[string, Record<string, unknown>]>;

                for (const [nodeName, nodeOutput] of entries) {
                    yield { type: "node_start", node: nodeName };

                    // Track specific fields for richer events
                    if (nodeName === "evaluate" && nodeOutput.satisfactionScore !== undefined) {
                        const score = nodeOutput.satisfactionScore as number;
                        const iteration = ((nodeOutput.iteration as number) ?? 0) - 1;

                        yield {
                            type: "satisfaction_check",
                            score,
                            iteration,
                        };

                        // If unsatisfied, signal a retry
                        if (
                            score < 0.7 &&
                            (nodeOutput.iteration as number) <
                                ((nodeOutput.maxIterations as number) ?? 3)
                        ) {
                            yield {
                                type: "loop_retry",
                                iteration: nodeOutput.iteration as number,
                                feedback: (nodeOutput.feedback as string) ?? "",
                            };
                        }
                    }

                    // Capture final state from the present node
                    if (nodeName === "present") {
                        finalState = {
                            messages: (chunk.classifyIntent?.messages ??
                                chunk.orchestrator?.messages ??
                                chunk.reasoning?.messages ??
                                chunk.council?.messages ??
                                chunk.evaluate?.messages ??
                                []) as unknown[],
                            finalResponse: (nodeOutput.finalResponse as string) ?? "",
                        };
                    }

                    // Also accumulate messages from any node that produces them
                    if (nodeOutput.messages) {
                        finalState.messages = nodeOutput.messages as unknown[];
                    }
                    if (nodeOutput.finalResponse) {
                        finalState.finalResponse = nodeOutput.finalResponse as string;
                    }

                    yield {
                        type: "node_complete",
                        node: nodeName,
                        output:
                            typeof nodeOutput.outcome === "string" ? nodeOutput.outcome : undefined,
                    };
                }
            }

            yield { type: "complete", result: finalState };
        },
    };
}

async function main() {
    const app = App.getInstance();

    // 1. Register the banner init task in the dev environment
    process.env.NODE_ENV === "development" &&
        App.addInitializationTask("banner", () => printBanner(App.getContext()));

    // 2. Load all agent configs from YAML — runs once during init
    App.addInitializationTask("agents", () => {
        const ctx = App.getContext();
        loadAllAgents(ctx.config);
        ctx.logger.info("All agents loaded from YAML");
    });

    // 3. Launch the interactive TUI
    App.addRunnable("tui", () => {
        const ctx = App.getContext();
        const director = getAgent(ENTRY_AGENT);
        const threadId = randomUUID();

        // Build the workflow and wrap it in an IWorkflowRunner adapter.
        // This keeps workflow construction in the composition root — the TUI
        // only depends on the IWorkflowRunner interface.
        const graph = buildDirectorWorkflow(ctx.config);
        const workflow = createWorkflowRunner(graph, ctx, threadId);

        renderTui(director, ctx, threadId, workflow);
    });

    // 4. Run — init executes first, then runnables
    await app.run();
}

main().catch((error) => {
    // biome-ignore lint/suspicious/noConsole: top-level error handler before logger is available
    console.error("Error in main execution:", error);
    process.exit(1);
});
