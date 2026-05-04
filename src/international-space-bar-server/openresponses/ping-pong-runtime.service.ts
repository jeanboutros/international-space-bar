// SCAFFOLD: Temporary runtime. Demonstrates ResponseStream + block architecture.
// TODO(isb-0020): Delete this file entirely when the real LangGraph adapter is wired.
import { HumanMessage } from "@langchain/core/messages";
import { ChatOllama } from "@langchain/ollama";
import { Inject, Injectable } from "@nestjs/common";

import type { ILogger } from "../common/interfaces/index.js";
import { LOGGER } from "../common/interfaces/logger.port.js";
import type { AgentInvokeRequest, AgentRuntimePort } from "./agent-runtime.port.js";
import { messageBlock } from "./blocks/index.js";
import { toBaseMessages } from "./input-to-messages.js";
import { langGraphBlocks } from "./lang-graph-blocks.js";
import { ResponseStream } from "./response-stream.js";
import type { ResponseResource, ResponseStreamEvent } from "./responses.types.js";
import { wrapAsGraph } from "./wrap-as-graph.js";

@Injectable()
export class PingPongRuntimeService implements AgentRuntimePort {
    constructor(@Inject(LOGGER) private readonly logger: ILogger) { }

    // TODO(isb-0020): Implement when LangGraph adapter is wired.
    invoke(_request: AgentInvokeRequest): Promise<ResponseResource> {
        throw new Error("invoke() not implemented in scaffold runtime");
    }

    async *stream(request: AgentInvokeRequest): AsyncIterable<ResponseStreamEvent> {
        const ollamaBaseUrl = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
        const useOllama = await this.isOllamaReachable(ollamaBaseUrl);

        const rs = new ResponseStream(request);

        if (!useOllama) {
            this.logger.debug("Ollama not reachable — falling back to pong");
            yield* rs.run([messageBlock("pong")]);
            return;
        }

        // ── LangGraph-based streaming (Ollama reachable) ────────────────────
        const messages = toBaseMessages(request.input);
        const inputSummary =
            typeof request.input === "string" ? request.input : `[${messages.length} messages]`;
        this.logger.info(`Streaming with LangGraph for input: ${inputSummary}`);

        const llm = new ChatOllama({ model: 'gemma4:e2b', baseUrl: ollamaBaseUrl });
        const graph = wrapAsGraph(llm);
        const input = messages.length > 0 ? messages : [new HumanMessage(request.input as string)];

        yield* rs.run(langGraphBlocks(graph, input, undefined, this.logger));
    }

    private async isOllamaReachable(baseUrl: string): Promise<boolean> {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => {
                controller.abort();
            }, 2000);
            const response = await fetch(`${baseUrl}/api/tags`, {
                signal: controller.signal,
            });
            clearTimeout(timeoutId);
            return response.ok;
        } catch {
            return false;
        }
    }
}
