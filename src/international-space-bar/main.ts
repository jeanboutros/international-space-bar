import { App } from "./app.js";
// import { runGraph } from "./graph.js";
import { runAgentLoop } from "./agent/orchestrator.agent.js";

async function main() {
    const app = App.getInstance();
    // App.addInitializationTask("runGraph", runGraph);
    App.addRunnable("runGraph", runAgentLoop);
    await app.run();
}

main().catch((error) => {
    console.error("Error in main execution:", error);
    process.exit(1); // Exit the application if an error occurs
});