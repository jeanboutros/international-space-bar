import { randomUUID } from "node:crypto";
import { getAgent, loadAllAgents } from "./agent/agent-loader.js";
import { App } from "./app.js";
import { printBanner } from "./banner.js";
import type { IWorkflowRunner, WorkflowResult } from "./interfaces/agent.interface.js";
import { renderTui } from "./tui/render.js";
import { buildDirectorWorkflow } from "./workflow/index.js";

const ENTRY_AGENT = "agency-director";

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
        const workflow: IWorkflowRunner = {
            async invoke(query: string): Promise<WorkflowResult> {
                const result = (await graph.invoke(
                    { messages: [], query },
                    { context: { ctx, thread_id: threadId } },
                )) as { messages: unknown[]; finalResponse: string };
                return {
                    messages: result.messages ?? [],
                    finalResponse: result.finalResponse ?? "",
                };
            },
        };

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
