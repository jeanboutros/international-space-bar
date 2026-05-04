import { HumanMessage } from "@langchain/core/messages";
import {
    type GraphNode,
    StateGraph,
    START,
    END,
    StateSchema,
    MessagesValue,
} from "@langchain/langgraph";
import { z } from "zod";
import { ILogger } from "../common/interfaces/logger.port.js";
import { Logger } from "@nestjs/common";

const ApplicationContextSchema = new StateSchema({
    sessionId: z.string(),
    logger: z.custom<ILogger>().default(() => {
        return new Logger("SimpleWorkflowGraph");
    }),
});

const WorkflowStateSchema = new StateSchema({
    messages: MessagesValue,
    query: z.string().default(""),
});

type node = GraphNode<{
    InputSchema: typeof WorkflowStateSchema;
    OutputSchema: typeof WorkflowStateSchema;
    ContextSchema: typeof ApplicationContextSchema;
    Nodes: "step1";
}>;

const simpleNode: node = (state, config) => {
    const sessionId = config.context?.sessionId ?? "unknown";
    const logger = config.context?.logger;
    logger?.info(`Running simpleNode for session ${sessionId} with query: ${state.query}`);

    const hasMessages = state.messages.length > 0;
    const summary = hasMessages
        ? state.messages
              .map((m) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content)))
              .join(", ")
        : "no messages";

    return {
        messages: [new HumanMessage(`Step 1 received: ${summary}`)],
    };
};

export const simpleWorkflowGraph = new StateGraph(WorkflowStateSchema, {
    context: ApplicationContextSchema,
})
    .addNode("step1", simpleNode)
    .addEdge(START, "step1")
    .addEdge("step1", END)
    .compile();
