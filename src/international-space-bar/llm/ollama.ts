/**
 * LLM factory for Ollama models.
 *
 * Supports both local Ollama and Ollama Cloud via the `baseUrl` parameter.
 * When connecting to Ollama Cloud, an API key must be provided via
 * `ollamaApiKey` in the config — it's passed as an `Authorization` header.
 *
 * ## Ollama Cloud
 * - Base URL: `https://ollama.com`
 * - Auth: `Authorization: Bearer <API_KEY>`
 * - Models: Use the `ollama:` prefix (e.g. `ollama:gemma4:27b`)
 */

import { ChatOllama } from "@langchain/ollama";
import type { IConfig } from "../interfaces/config.interface.js";

export interface CreateOllamaLLMOptions {
    readonly model: string;
    readonly temperature?: number;
    readonly topP?: number;
    readonly frequencyPenalty?: number;
    readonly presencePenalty?: number;
    /** Override the base URL (defaults to config.ollamaBaseUrl). */
    readonly baseUrl?: string;
    /** API key for Ollama Cloud auth. */
    readonly apiKey?: string;
}

/**
 * Strip the `ollama:` prefix from model identifiers.
 *
 * ChatOllama expects just the model name (e.g. `gemma4:27b`),
 * but the config uses `ollama:` as a provider prefix (e.g. `ollama:gemma4:27b`).
 */
function stripOllamaPrefix(model: string): string {
    return model.startsWith("ollama:") ? model.slice("ollama:".length) : model;
}

/**
 * Generic factory for creating a {@link ChatOllama} instance.
 *
 * When `baseUrl` or `apiKey` are not provided, they're read from the
 * application config (which comes from YAML).
 */
export function createOllamaLLM({
    model,
    temperature = 0.9,
    topP = 1,
    frequencyPenalty = 0,
    presencePenalty = 0,
    baseUrl,
    apiKey,
}: CreateOllamaLLMOptions): ChatOllama {
    const modelName = stripOllamaPrefix(model);

    const options: Record<string, unknown> = {
        model: modelName,
        temperature,
        topP,
        frequencyPenalty,
        presencePenalty,
    };

    if (baseUrl) {
        options.baseUrl = baseUrl;
    }

    // Ollama Cloud requires Bearer auth
    if (apiKey) {
        options.headers = { Authorization: `Bearer ${apiKey}` };
    }

    return new ChatOllama(options);
}

/**
 * Create an Ollama LLM using the application config.
 *
 * Reads the base URL and API key from config so all agents
 * connect to the same Ollama instance (local or cloud).
 */
export function createOllamaLLMFromConfig(config: IConfig, model: string): ChatOllama {
    return createOllamaLLM({
        model,
        baseUrl: config.ollamaBaseUrl.href.replace(/\/$/, ""), // strip trailing slash
        apiKey: config.ollamaApiKey,
    });
}
