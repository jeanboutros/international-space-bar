import { getAgent, loadAllAgents } from "./agent/agent-loader.js";
import { App } from "./app.js";
import { printBanner } from "./banner.js";

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

    // 3. Register the main runnable — invokes the entry-point agent
    App.addRunnable("agency-director", async () => {
        const ctx = App.getContext();
        const director = getAgent(ENTRY_AGENT);
        const result = await director.invoke(
            "What was the weather like when tupac was announced dead?",
            ctx,
        );
        ctx.logger.info({ lastContent: result.lastContent }, "Director finished");
    });

    // 4. Run — init executes first, then runnables
    await app.run();
}

main().catch((error) => {
    // biome-ignore lint/suspicious/noConsole: top-level error handler before logger is available
    console.error("Error in main execution:", error);
    process.exit(1);
});
