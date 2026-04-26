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
        const toolEntries: ToolEntry[] = agentConfig.tools.map((toolId) => getToolEntry(toolId));
        const resolvedModel = agentConfig.model ?? config.defaultModel;

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
                const subTools = subConfig.tools.map((toolId) => getToolEntry(toolId).tool);
                subagents.push({
                    name: subConfig.display_name,
                    description: subConfig.short_description,
                    systemPrompt: subConfig.default_prompt,
                    model: subConfig.model ?? config.defaultModel,
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
