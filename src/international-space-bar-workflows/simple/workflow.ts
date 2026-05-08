import { wrapAsGraph } from "../common/wrap-as-graph.js";
import type { WorkflowModule, WorkflowRequest, WorkflowManifest } from "../interfaces/index.js";
import { ChatOllama } from "@langchain/ollama";

import type { WorkflowChunk, WorkflowLoadContext, WorkflowRunner } from "../interfaces/index.js";

interface StremableGraph {
    streamEvents(): AsyncIterable<WorkflowChunk>;
}

// async function* workflowChunks(graph: StremableGraph): AsyncGenerator<IWorkflowStreamingChunk> {
//     const producer =  async () => {

//     }
//     for await (const chunk of graph.streamEvents()) {
//         yield chunk;
//     }
// }
const SimpleWorkflowManifest: WorkflowManifest = {
    id: "simple",
    description: "Simple Workflow",
    skills: [
        { id: "skill1", role: "system", path: new URL("./skills/skill1.md", import.meta.url).pathname, required: true },
        { id: "skill2", role: "agent", path: new URL("./skills/skill2.md", import.meta.url).pathname, required: true },
    ],
    persistence: { kind: "none" },
    llm: {
        ollama: {
            baseUrl: "http://localhost:11434",
            model: "gemma4:e2b",
        },
    },
};

class SimpleWorkflowRunner implements WorkflowRunner {
    constructor(private context: WorkflowLoadContext,
        private manifest: WorkflowManifest) { }


    async *stream(request: WorkflowRequest): AsyncIterable<WorkflowChunk> {

        // ── LangGraph-based streaming (Ollama reachable) ────────────────────
        const logger = this.context.logger;
        const baseUrl = this.manifest.llm.ollama.baseUrl;
        const model = this.manifest.llm.ollama.model;
        logger.debug(`Creating Ollama client with baseUrl=${baseUrl} and model=${model}`);

        const llm = new ChatOllama({ model, baseUrl });
        const graph = wrapAsGraph(llm);
        const messages = request.input;
        const stream = graph.streamEvents({ messages }, { version: "v2", streamMode: "values", debug: true });
        for await (const chunk of stream) {
            logger.debug(`Yielding chunk from workflow: ${JSON.stringify(chunk)}`);
            yield chunk;
        }


        // yield* workflowChunks(graph);//, input, { hasReasoning: true }, logger));
    }
}



class SimpleWorkflowModule implements WorkflowModule {
    manifest = SimpleWorkflowManifest;

    createRunner(context: WorkflowLoadContext): Promise<WorkflowRunner> {
        return Promise.resolve(new SimpleWorkflowRunner(context, this.manifest));
    }
}


export { SimpleWorkflowModule };