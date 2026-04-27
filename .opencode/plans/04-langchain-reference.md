# Documentation — LangChain/LangGraph/DeepAgents Reference

## Deep Agents (deepagents)
- Built on top of LangChain core + LangGraph runtime
- `createDeepAgent()` returns a compiled LangGraph graph with built-in: planning (`write_todos`), virtual filesystem (`ls`, `read_file`, `write_file`, `edit_file`), subagent spawning (`task` tool), auto-summarization, and human-in-the-loop (interrupts)
- Supports pluggable filesystem backends (in-memory, local disk, LangGraph store, sandboxes)
- Model format: `langchain` `createAgent` uses string model IDs like `"claude-sonnet-4-6"` or `"ollama:devstral-2"`
- This project uses `createDeepAgent` from `deepagents` which is the "batteries-included" harness

## LangGraph
- Low-level orchestration: `StateGraph`, `StateSchema`, `MessagesValue`, `ReducedValue`
- Nodes are functions `(state, config) => Partial<State>`
- Edges: `.addEdge()`, `.addConditionalEdges()`, fan-out via `Send`
- Context: passed via `{ context: ZodSchema }` to `StateGraph` constructor; accessed as `config.context`
- Streaming: `.stream()` returns `AsyncIterable` of state updates per node
- Checkpointer: `MemorySaver` for in-memory persistence; Postgres for production
- Human-in-the-loop: `Command({ resume })` + `INTERRUPT`

## LangChain
- Higher-level: `createAgent()` creates a prebuilt agent with tool-calling loop
- `tool()` function from `@langchain/core/tools` for defining custom tools
- `ChatOllama` from `@langchain/ollama` for Ollama integration
- `.withStructuredOutput(schema)` for guaranteed structured responses

## Key Patterns for This Codebase

1. **State schema convention**: Use `StateSchema` with `MessagesValue` for message fields, `ReducedValue` with concat reducer for parallel fan-out
2. **Context convention**: Zod schema passed to `StateGraph({ context })`, accessed as `config.context` in nodes
3. **Node typing**: `GraphNode<{ InputSchema, OutputSchema, ContextSchema, Nodes }>` type bag pattern
4. **Streaming**: Use `graph.stream()` instead of `graph.invoke()` for progressive TUI updates
5. **Loop pattern**: Conditional edge from evaluate node back to execution nodes, with iteration counter in state