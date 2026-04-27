import type { AppContext } from "./app-context.interface.js";

export interface InterruptInfo {
    readonly id: string;
    readonly toolName: string;
    readonly args: unknown;
    readonly description: string;
    readonly allowedDecisions: string[];
}

export interface TokenUsage {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly totalTokens: number;
}

export interface AgentResult {
    readonly messages: unknown[];
    readonly lastContent: string;
    readonly interrupts?: InterruptInfo[];
    readonly tokenUsage?: TokenUsage;
}

export interface IAgent {
    readonly id: string;
    readonly displayName: string;
    invoke(query: string, ctx: AppContext, threadId: string): Promise<AgentResult>;
    resume(
        decision: Record<string, unknown>,
        ctx: AppContext,
        threadId: string,
    ): Promise<AgentResult>;
}

/**
 * A compiled workflow that can be invoked with a user query.
 *
 * The TUI depends on this contract — the composition root provides the
 * concrete implementation (backed by a LangGraph `CompiledStateGraph`).
 */
export interface IWorkflowRunner {
    invoke(query: string): Promise<WorkflowResult>;
}

/**
 * The raw output from a workflow invocation.
 *
 * Contains the full LangGraph message array (for reasoning extraction
 * and token counting) plus a pre-assembled final response.
 */
export interface WorkflowResult {
    readonly messages: unknown[];
    readonly finalResponse: string;
}
