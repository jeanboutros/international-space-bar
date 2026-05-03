import { describe, it } from "node:test";
import { simpleWorkflowGraph } from "./simple-workflow.graph.js";

void describe("simpleWorkflowGraph", () => {
    void it("should fail if the message is empty", async () => {
        const initialState = {
            messages: [],
        };

        const result = await simpleWorkflowGraph.invoke({ messages: [], query: "query" }, { runId: "test-run" });
        console.log("Result with empty messages:", result);
    });
});


