// References for Ollama implementation:
// - https://docs.langchain.com/oss/javascript/integrations/chat/ollama
// - https://reference.langchain.com/javascript/langchain-ollama/ChatOllama

import { ChatOllama } from "@langchain/ollama";

export interface CreateOllamaLLMOptions {
    readonly model: string;
    readonly temperature?: number;
    readonly topP?: number;
    readonly frequencyPenalty?: number;
    readonly presencePenalty?: number;
}

/**
 * Generic factory for creating a {@link ChatOllama} instance.
 *
 * Callers supply at minimum a `model` name; all other parameters have sensible
 * defaults matching the original `deepSeekLLM` configuration.
 */
export function createOllamaLLM({
    model,
    temperature = 0.9,
    topP = 1,
    frequencyPenalty = 0,
    presencePenalty = 0,
}: CreateOllamaLLMOptions): ChatOllama {
    return new ChatOllama({ model, temperature, topP, frequencyPenalty, presencePenalty });
}

export const deepSeekLLM = createOllamaLLM({ model: "qwen3-coder:latest" });
