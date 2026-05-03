import { readdirSync, readFileSync } from "node:fs";
import { join, parse } from "node:path";

import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { SubAgent } from "deepagents";
import { parse as parseYaml } from "yaml";
import type { IAgent } from "../interfaces/agent.interface.js";
import type { IConfig } from "../interfaces/config.interface.js";
import { createOllamaLLMFromConfig } from "../llm/ollama.js";
import { type AgentConfig, AgentConfigSchema } from "./agent-config.schema.js";
import { createSharedBackend, createSharedCheckpointer } from "./agent-infrastructure.js";
import { DeepAgentWrapper } from "./deep-agent-wrapper.js";
import { getToolEntry, type ToolEntry } from "./tool-registry.js";

const agentStore = new Map<string, IAgent>();

// Tools that are loaded by defaults for DeepAgent, we don't need to load manually.
// ls: false
// grep: false
// read_file: false
// write_file: true
// edit_file: true
const defaultToolsToSkipLoading = ["read_file", "write_file", "edit_file", "ls", "grep", "glob"];

// ---------------------------------------------------------------------------
// Model alias resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a model string that may be an alias (e.g. "opus") or a
 * provider-prefixed identifier (e.g. "ollama:gemma4:27b").
 *
 * If the string is found in the config's `modelAliases`, the alias is replaced.
 * Otherwise it's returned as-is (assumed to be a valid provider:model string).
 */
function resolveModel(
    model: string,
    defaultModel: string,
    aliases: Record<string, string>,
): string {
    // If it's a known alias, resolve it
    const alias = aliases[model];
    if (alias) {
        return alias;
    }
    // If it already has a provider prefix (contains ":"), treat as resolved
    if (model.includes(":")) {
        return model;
    }
    // Unknown bare name — fall back to the app default
    return defaultModel;
}

// ---------------------------------------------------------------------------
// Environment setup for Ollama Cloud
// ---------------------------------------------------------------------------

/**
 * Set the `OLLAMA_BASE_URL` environment variable from config so that
 * deepagents' internal `initChatModel` resolver (and any other code
 * that resolves model strings) connects to the correct Ollama endpoint.
 *
 * Without this, the universal resolver defaults to `http://127.0.0.1:11434`.
 *
 * Note: We also pass pre-configured `ChatOllama` instances (with `baseUrl`
 * and `Authorization: Bearer` headers) to both main agents and subagents
 * via `createOllamaLLMFromConfig`. This env var is a safety net for any
 * code paths that still use string-based model resolution.
 */
function ensureOllamaEnvVars(config: IConfig): void {
    const baseUrl = config.ollamaBaseUrl.href.replace(/\/$/, "");
    process.env.OLLAMA_BASE_URL ??= baseUrl;
}

// ---------------------------------------------------------------------------
// Agent loading
// ---------------------------------------------------------------------------

/**
 * Two-pass YAML loader:
 * 1. Parse every `*.yaml` in `agentsConfigDir` and validate against {@link AgentConfigSchema}.
 * 2. Wire subagent references and instantiate {@link DeepAgentWrapper} instances.
 *
 * Returns a `Map<agentId, IAgent>` and stores them in a module-level map for lookup.
 */
export function loadAllAgents(config: IConfig): Map<string, IAgent> {
    // Ensure Ollama Cloud env vars are set before any model resolution.
    ensureOllamaEnvVars(config);

    const dir = join(process.cwd(), config.agentsConfigDir);
    const files = readdirSync(dir).filter((f) => f.endsWith(".yaml"));

    // Pass 1 — parse & validate
    const parsed = new Map<string, AgentConfig>();
    for (const file of files) {
        const id = parse(file).name; // e.g. "agency-director"
        const raw = readFileSync(join(dir, file), "utf-8");
        const data = parseYaml(raw) as unknown;
        const agentConfig = AgentConfigSchema.parse(data);
        parsed.set(id, agentConfig);
    }

    const backend = createSharedBackend(config);
    const checkpointer = createSharedCheckpointer();

    // Pass 2 — resolve tool entries and subagent references, then instantiate
    for (const [id, agentConfig] of parsed) {
        const toolEntries: ToolEntry[] = agentConfig.tools
            .filter((toolId) => !defaultToolsToSkipLoading.includes(toolId))
            .map((toolId) => getToolEntry(toolId));
        const resolvedModelString = resolveModel(
            agentConfig.model ?? config.defaultModel,
            config.defaultModel,
            config.modelAliases,
        );

        // Build SubAgent array for deepagents — pass ChatOllama instances
        // (not raw strings) so subagents also connect to Ollama Cloud with
        // the correct baseUrl and API key.
        let subagents: SubAgent[] | undefined;
        if (agentConfig.subagents.length > 0) {
            subagents = [];
            for (const subId of agentConfig.subagents) {
                const subConfig = parsed.get(subId);
                if (!subConfig) {
                    throw new Error(
                        `Agent "${id}" references subagent "${subId}" which was not found in ${dir}`,
                    );
                }
                const subTools = subConfig.tools
                    .filter((toolId) => !defaultToolsToSkipLoading.includes(toolId))
                    .map((toolId) => getToolEntry(toolId).tool);
                const subModelString = resolveModel(
                    subConfig.model ?? config.defaultModel,
                    config.defaultModel,
                    config.modelAliases,
                );
                const subModel = createOllamaLLMFromConfig(config, subModelString);
                subagents.push({
                    name: subConfig.display_name,
                    description: subConfig.short_description,
                    systemPrompt: subConfig.default_prompt,
                    model: subModel,
                    tools: subTools.length > 0 ? subTools : undefined,
                });
            }
        }

        // For the main agent, pass a pre-configured ChatOllama instance
        // so Ollama Cloud baseUrl and API key are used.
        const resolvedModel: string | BaseChatModel = createOllamaLLMFromConfig(
            config,
            resolvedModelString,
        );

        const agent = new DeepAgentWrapper({
            id,
            config: agentConfig,
            resolvedModel,
            toolEntries,
            backend,
            checkpointer,
            subagents,
        });

        agentStore.set(id, agent);
    }

    return agentStore;
}

export function getAgent(id: string): IAgent {
    const agent = agentStore.get(id);
    if (!agent) {
        throw new Error(
            `Agent "${id}" not loaded. Available: ${[...agentStore.keys()].join(", ")}`,
        );
    }
    return agent;
}
