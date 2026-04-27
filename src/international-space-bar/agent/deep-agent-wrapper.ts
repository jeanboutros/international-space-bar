import type { MemorySaver } from "@langchain/langgraph";
import { Command, INTERRUPT, type Interrupt } from "@langchain/langgraph";
import type { FilesystemBackend, SubAgent } from "deepagents";
import { createDeepAgent } from "deepagents";
import type { AgentResult, IAgent, InterruptInfo } from "../interfaces/agent.interface.js";
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

function parseInterrupts(raw: Interrupt[]): InterruptInfo[] {
    return raw.map((entry) => {
        const val = entry.value as Record<string, unknown> | undefined;
        const actionRequests = (val?.actionRequests ?? []) as {
            name: string;
            args: unknown;
            description?: string;
        }[];
        const reviewConfigs = (val?.reviewConfigs ?? []) as {
            actionName: string;
            allowedDecisions: string[];
        }[];

        const first = actionRequests[0];
        const review = reviewConfigs.find((r) => r.actionName === first?.name);

        return {
            id: entry.id ?? "",
            toolName: first?.name ?? "unknown",
            args: first?.args ?? {},
            description: first?.description ?? "",
            allowedDecisions: review?.allowedDecisions ?? ["approve", "reject"],
        };
    });
}

function extractResult(result: Record<string, unknown>, logger: AppContext["logger"]): AgentResult {
    const interruptData = result[INTERRUPT] as Interrupt[] | undefined;
    const interrupts =
        interruptData && interruptData.length > 0 ? parseInterrupts(interruptData) : undefined;

    const messages = (result.messages ?? []) as unknown[];
    logger.debug(
        { messageCount: messages.length, hasInterrupts: !!interrupts },
        "Extracting result",
    );

    const last = messages.at(-1) as { content?: unknown } | undefined;
    const lastContent =
        typeof last?.content === "string" ? last.content : JSON.stringify(last?.content ?? "");

    return { messages, lastContent, interrupts };
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

    async invoke(query: string, ctx: AppContext, threadId: string): Promise<AgentResult> {
        ctx.logger.info({ agentId: this.id, query, threadId }, "Invoking agent");

        const result = (await this.inner.invoke(
            { messages: [{ role: "user", content: query }] },
            { configurable: { thread_id: threadId } },
        )) as Record<string, unknown>;

        return extractResult(result, ctx.logger);
    }

    async resume(
        decision: Record<string, unknown>,
        ctx: AppContext,
        threadId: string,
    ): Promise<AgentResult> {
        ctx.logger.info({ agentId: this.id, decision, threadId }, "Resuming agent from interrupt");

        const result = (await this.inner.invoke(new Command({ resume: decision }), {
            configurable: { thread_id: threadId },
        })) as Record<string, unknown>;

        return extractResult(result, ctx.logger);
    }
}
