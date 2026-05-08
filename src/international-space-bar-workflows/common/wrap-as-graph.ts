import { END, MessagesValue, START, StateGraph, StateSchema } from "@langchain/langgraph";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

/**
 * Wrap a chat model in a trivial `start → llm → end` graph so every
 * runtime exposes the same LangGraph event surface.
 *
 * Returns a compiled state graph suitable for `graph.streamEvents()`.
 */
export function wrapAsGraph(llm: BaseChatModel) {
    const schema = new StateSchema({
        messages: MessagesValue,
    });

    return new StateGraph(schema)
        .addNode("llm", async (state) => ({
            messages: [await llm.invoke(state.messages)],
        }))
        .addEdge(START, "llm")
        .addEdge("llm", END)
        .compile();
}
