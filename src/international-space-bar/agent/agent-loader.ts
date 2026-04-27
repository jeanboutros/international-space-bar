import { readdirSync, readFileSync } from "node:fs";
import { join, parse } from "node:path";

import type { SubAgent } from "deepagents";
import { parse as parseYaml } from "yaml";
import type { IAgent } from "../interfaces/agent.interface.js";
import type { IConfig } from "../interfaces/config.interface.js";
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
 * Shorthand model names used in agent YAMLs.
 *
 * YAML configs use human-readable aliases (e.g. "opus", "sonnet") to
 * decouple from specific provider/model identifiers. This mapping resolves
 * them to actual provider-prefixed model strings.
 *
 * When adding a cloud provider (Anthropic, OpenAI, etc.), update this map
 * to route aliases to the appropriate high-tier model.
 */
const MODEL_ALIASES: Record<string, string> = {
    // High-quality — used for chairman, conductor, reviewer roles
    opus: "ollama:glm-5.1",
    // Mid-tier — used for advisor roles and general tasks
    sonnet: "ollama:gemma4:e2b",
    // Fast/light — for lightweight tasks
    haiku: "ollama:gemma4:e2b",
};

/**
 * Resolve a model string that may be an alias (e.g. "opus") or a
 * provider-prefixed identifier (e.g. "ollama:gemma4:e2b").
 *
 * If the string is found in {@link MODEL_ALIASES}, the alias is replaced.
 * Otherwise it's returned as-is (assumed to be a valid provider:model string).
 */
function resolveModel(model: string, defaultModel: string): string {
    // If it's a known alias, resolve it
    const alias = MODEL_ALIASES[model];
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

/**
 * Two-pass YAML loader:
 * 1. Parse every `*.yaml` in `agentsConfigDir` and validate against {@link AgentConfigSchema}.
 * 2. Wire subagent references and instantiate {@link DeepAgentWrapper} instances.
 *
 * Returns a `Map<agentId, IAgent>` and stores them in a module-level map for lookup.
 */
export function loadAllAgents(config: IConfig): Map<string, IAgent> {
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
        const resolvedModel = resolveModel(
            agentConfig.model ?? config.defaultModel,
            config.defaultModel,
        );

        // Build SubAgent array for deepagents
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
                subagents.push({
                    name: subConfig.display_name,
                    description: subConfig.short_description,
                    systemPrompt: subConfig.default_prompt,
                    model: resolveModel(
                        subConfig.model ?? config.defaultModel,
                        config.defaultModel,
                    ),
                    tools: subTools.length > 0 ? subTools : undefined,
                });
            }
        }

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
