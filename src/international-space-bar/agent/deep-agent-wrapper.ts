import { randomUUID } from "node:crypto";
import type { MemorySaver } from "@langchain/langgraph";
import type { FilesystemBackend, SubAgent } from "deepagents";
import { createDeepAgent } from "deepagents";
import type { AgentResult, IAgent } from "../interfaces/agent.interface.js";
import type { AppContext } from "../interfaces/app-context.interface.js";
import type { AgentConfig } from "./agent-config.schema.js";
import type { ToolEntry } from "./tool-registry.js";

export interface DeepAgentWrapperOpts {
    readonly id: string;
    readonly config: AgentConfig;
    readonly resolvedModel: string;
    readonly toolEntries: ToolEntry[];
    readonly backend: FilesystemBackend;
    readonly checkpointer: MemorySaver;
    readonly subagents?: SubAgent[];
}

export class DeepAgentWrapper implements IAgent {
    readonly id: string;
    readonly displayName: string;

    private readonly inner: ReturnType<typeof createDeepAgent>;

    constructor(opts: DeepAgentWrapperOpts) {
        this.id = opts.id;
        this.displayName = opts.config.display_name;

        const tools = opts.toolEntries.map((e) => e.tool);
        const toolInstructions = opts.toolEntries.map((e) => e.instruction).join("\n\n");

        const systemPrompt = toolInstructions
            ? `${opts.config.default_prompt}\n\n${toolInstructions}`
            : opts.config.default_prompt;

        this.inner = createDeepAgent({
            model: opts.resolvedModel,
            tools,
            systemPrompt,
            backend: opts.backend,
            checkpointer: opts.checkpointer,
            skills: opts.config.skills.length > 0 ? opts.config.skills : undefined,
            subagents: opts.subagents && opts.subagents.length > 0 ? opts.subagents : undefined,
            interruptOn:
                Object.keys(opts.config.interrupt_on).length > 0
                    ? opts.config.interrupt_on
                    : undefined,
        });
    }

    async invoke(query: string, ctx: AppContext): Promise<AgentResult> {
        ctx.logger.info({ agentId: this.id, query }, "Invoking agent");

        const result = await this.inner.invoke(
            { messages: [{ role: "user", content: query }] },
            { configurable: { thread_id: randomUUID() } },
        );

        ctx.logger.info({ result }, "Raw agent response");
        ctx.logger.info({ agentId: this.id }, "Agent invocation complete");
        
        const messages = result.messages ?? [];
        ctx.logger.debug({ messages }, "Raw agent messages");

        const last = messages.at(-1);
        const lastContent =
            typeof last?.content === "string" ? last.content : JSON.stringify(last?.content ?? "");

        return { messages, lastContent };
    }
}
