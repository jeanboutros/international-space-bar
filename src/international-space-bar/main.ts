import { loadAllAgents } from "./agent/agent-loader.js";
import { App } from "./app.js";
import { printBanner } from "./banner.js";

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

    // 3. Run — init executes first, then runnables
    await app.run();
}

main().catch((error) => {
    // biome-ignore lint/suspicious/noConsole: top-level error handler before logger is available
    console.error("Error in main execution:", error);
    process.exit(1);
});
