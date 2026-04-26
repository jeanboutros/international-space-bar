// References for Ollama implementation:
// - https://docs.langchain.com/oss/javascript/integrations/chat/ollama
// - https://reference.langchain.com/javascript/langchain-ollama/ChatOllama

import { ChatOllama } from "@langchain/ollama";

export const deepSeekLLM = new ChatOllama({
    // model: "deepseek-v4-flash:cloud",
    model: "qwen3-coder:latest",
    temperature: 0.9,
    topP: 1,
    frequencyPenalty: 0,
    presencePenalty: 0,
});