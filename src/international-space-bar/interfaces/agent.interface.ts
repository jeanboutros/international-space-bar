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

// ---------------------------------------------------------------------------
// Workflow events (streamed from the director graph)
// ---------------------------------------------------------------------------

export type WorkflowEvent =
    | { readonly type: "node_start"; readonly node: string; readonly iteration?: number }
    | { readonly type: "node_complete"; readonly node: string; readonly output?: string }
    | { readonly type: "satisfaction_check"; readonly score: number; readonly iteration: number }
    | { readonly type: "loop_retry"; readonly iteration: number; readonly feedback: string }
    | { readonly type: "complete"; readonly result: WorkflowResult };

// ---------------------------------------------------------------------------
// Workflow runner interface
// ---------------------------------------------------------------------------

/**
 * A compiled workflow that can be invoked or streamed with a user query.
 *
 * The TUI depends on this contract — the composition root provides the
 * concrete implementation (backed by a LangGraph `CompiledStateGraph`).
 */
export interface IWorkflowRunner {
    /** Invoke the workflow and wait for the final result. */
    invoke(query: string): Promise<WorkflowResult>;

    /**
     * Stream the workflow, yielding events as nodes complete.
     *
     * Each yielded value is a `WorkflowEvent` describing what happened.
     * The stream ends with a `{ type: "complete" }` event containing the
     * full result.
     */
    stream(query: string): AsyncIterable<WorkflowEvent>;
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
