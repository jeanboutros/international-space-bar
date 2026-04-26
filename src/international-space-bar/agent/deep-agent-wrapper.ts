import type { StructuredToolInterface } from "@langchain/core/tools";
import type { MemorySaver } from "@langchain/langgraph";
import type { FilesystemBackend } from "deepagents";
import { createDeepAgent } from "deepagents";
import type { AgentResult, IAgent } from "../interfaces/agent.interface.js";
import type { AppContext } from "../interfaces/app-context.interface.js";
import type { AgentConfig } from "./agent-config.schema.js";
import type { ToolEntry } from "./tool-registry.js";

export interface SubAgentEntry {
    readonly name: string;
    readonly description: string;
    readonly systemPrompt: string;
    readonly model: string;
    readonly tools?: StructuredToolInterface[];
}

export interface DeepAgentWrapperOpts {
    readonly id: string;
    readonly config: AgentConfig;
    readonly resolvedModel: string;
    readonly toolEntries: ToolEntry[];
    readonly backend: FilesystemBackend;
    readonly checkpointer: MemorySaver;
    readonly subagents?: Record<string, SubAgentEntry>;
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
            subagents: opts.subagents,
            interruptOn:
                Object.keys(opts.config.interrupt_on).length > 0
                    ? opts.config.interrupt_on
                    : undefined,
        });
    }

    async invoke(query: string, ctx: AppContext): Promise<AgentResult> {
        ctx.logger.info({ agentId: this.id, query }, "Invoking agent");

        const result = await this.inner.invoke({
            messages: [{ role: "user", content: query }],
        });

        const messages = result.messages ?? [];
        const last = messages.at(-1);
        const lastContent =
            typeof last?.content === "string" ? last.content : JSON.stringify(last?.content ?? "");

        ctx.logger.info({ agentId: this.id }, "Agent invocation complete");

        return { messages, lastContent };
    }
}
