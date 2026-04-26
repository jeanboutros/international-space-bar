import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import { END, type GraphNode, MemorySaver, MessagesValue, START, StateGraph, StateSchema } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { z } from "zod";
import { deepSeekLLM } from "./llm/ollama.js";
import { getWeather } from "./tool/weather.js";
import { AppContext } from "./interfaces/app-context.interface.js";


const InputSchema = new StateSchema({
    messages: MessagesValue,
    query: z.string().min(1, "Query cannot be empty")
});

type InputSchemaType = typeof InputSchema;

const OutputSchema = new StateSchema({
    messages: MessagesValue
});

type OutputSchemaType = typeof OutputSchema;

const AgentContext = z.object({
});

type AgentContextType = z.infer<typeof AgentContext>;

type AgentNodes = "answer" | "steer";

const deepSeekLLMWithTools = deepSeekLLM.bindTools([getWeather]);

const mockLLMPostToolSummary: GraphNode<{ InputSchema: InputSchemaType, OutputSchema: OutputSchemaType, ContextSchema: AgentContextType, Nodes: AgentNodes }> = async (state, config) => {
    const systemMessage = new SystemMessage("Check the tool outputs and previous messages and priovide a concise summary of the information you have.");
    const response = await deepSeekLLMWithTools.invoke([...state.messages, systemMessage])
    return {
        messages: [response]
    }
}

const mockLLM: GraphNode<{ InputSchema: InputSchemaType, OutputSchema: OutputSchemaType, ContextSchema: AgentContextType, Nodes: AgentNodes }> = async (state, config) => {
    console.log("State:", state);

    const systemMessage = new SystemMessage(
        `You are a specialised weather and meteorology expert assistant. 
        You are rude and ruthless, and you don't hesitate to criticize the weather conditions in any location, especially if it's bad.
        You don't like being asked about the weather in London, and you always respond with a negative comment about it before providing the actual weather information.
        
        Always provide accurate and helpful information based on the user's query and the tool's output.
        If the user asks about the weather in london ALWAYS say the wather in london is shit then check 
        the temprature using your tool.

        Check the <context> section for information about the user. if the user asks a question user the <context> to infer information about them.

        Check the <user_query> for additional requests the user has.

        ensure to use the "get_weather" tool when you need to get the weather information.
        `
    );
    const contextMessage = new SystemMessage(`<CONTEXT>The user is in the city: ${config.configurable?.city ?? "unknown"}</CONTEXT>`)
    const userQuery = new HumanMessage(`<USER_QUERY>${state.query}</USER_QUERY>`)

    console.debug("Invoking LLM with message:", [systemMessage, ...state.messages, userQuery, contextMessage]);

    const responseMessage = await deepSeekLLMWithTools.invoke([systemMessage, contextMessage, ...state.messages, userQuery], {
        metadata: {
            city: "London"
        }
    });
    console.debug("LLM response:", responseMessage);

    return {
        messages: [responseMessage]
    };
}

const toolNode = new ToolNode([getWeather]);

const shouldCallTool = (state: typeof InputSchema.State) => {
    const last = state.messages[state.messages.length - 1] as AIMessage;
    return last.tool_calls?.length ? "tools" : "summary";
};

const checkpointer = new MemorySaver();

const graph = new StateGraph({ state: InputSchema, context: AgentContext, output: OutputSchema })
    .addNode("answer", mockLLM)
    .addNode("tools", toolNode)
    .addNode("summary", mockLLMPostToolSummary)
    .addEdge(START, "answer")
    .addConditionalEdges("answer", shouldCallTool)
    .addEdge("tools", "answer")
    .addEdge("summary", END)
    .compile({ checkpointer });

export const runGraph = async (ctx: AppContext) => {
    await graph.invoke(
        { messages: [{ role: "user", content: "Hello, how are you?" }], query: "What is the weather like today in london?" },
        {
            configurable: {
                thread_id: "thread-123",
                city: "London"
            }
        }
    ).then((output) => {
        console.log("Output:", output);

        output.messages.forEach((message) => {
            if (message instanceof AIMessage) {
                console.log(`AI: ${message.content}`);
            } else if (message instanceof HumanMessage) {
                console.log(`Human: ${message.content}`);
            } else if (message instanceof SystemMessage) {
                console.log(`System: ${message.content}`);
            } else if (message instanceof ToolMessage) {
                console.log(`Tool (${message.name}): ${message.content}`);
            } else {
                console.log(`Unspecified: ${message.content}`);
            }
        });
    }).catch((error) => {
        console.error("Error:", error);
    });
};
