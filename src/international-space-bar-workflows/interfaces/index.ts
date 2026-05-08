import type { ILogger } from "../../international-space-bar-common/interfaces/logger.interface.js";
import type { BaseMessage } from "@langchain/core/messages";

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export type WorkflowPersistenceDescriptor =
    | { readonly kind: "none" }
    | { readonly kind: "memory"; readonly namespace: string }
    | { readonly kind: "file"; readonly directory: string }
    | { readonly kind: "database"; readonly connectionName: string }
    | { readonly kind: "custom"; readonly description: string };

// ---------------------------------------------------------------------------
// Skills — markdown files loaded at runner-creation time (§6)
//
// Skills describe agent behaviour: personas, system instructions, capability
// descriptions. A skill may reference a tool by name in its prose, but it is
// NOT a tool definition. Skills are never executable; they are text assets.
//
// Three distinct tool concepts exist in this system — skills are none of them:
//   • Agent tools  — LangGraph DynamicStructuredTool instances wired into the
//                    graph inside createRunner(). Never declared here.
//   • Client tools — Function schemas the caller sends per-request so the LLM
//                    can ask the client to execute them. See WorkflowRequest.
//   • Skills       — Markdown text loaded once when the workflow is created.
// ---------------------------------------------------------------------------

export type WorkflowSkillRole =
    | "system"      // injected as the system/developer prompt
    | "agent"       // agent persona or capability description
    | "subworkflow" // describes a sub-graph this workflow may invoke
    | "reference";  // supplementary reference material (RAG, docs, etc.)

export interface WorkflowSkillAsset {
    readonly id: string;
    readonly role: WorkflowSkillRole;
    /** Absolute path to the markdown file. Use `new URL("./skills/x.md", import.meta.url).pathname`. */
    readonly path: string;
    readonly required: boolean;
}

export interface LoadedWorkflowSkill {
    readonly id: string;
    readonly role: WorkflowSkillRole;
    readonly markdown: string;
}

// ---------------------------------------------------------------------------
// LLM provider config
//
// Each workflow declares its LLM providers directly in its manifest with
// actual values. Workflows that need environment-controlled URLs read from
// WorkflowLoadContext.llm instead and ignore manifest.llm.
//
// Example:
//   llm: {
//     ollama:    { baseUrl: "http://localhost:11434", model: "gemma4:e2b" },
//     anthropic: { baseUrl: "https://api.anthropic.com", token: "sk-..." },
//   }
// ---------------------------------------------------------------------------

/**
 * Per-provider config. `baseUrl` is required on every provider.
 * Additional provider-specific fields (e.g. `token`, `model`) are allowed.
 */
export interface WorkflowLlmProviderConfig {
    readonly baseUrl: string;
    readonly [key: string]: string;
}

/** Full LLM config: provider name → provider fields. */
export type WorkflowLlmConfig = Readonly<Record<string, WorkflowLlmProviderConfig>>;

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

export interface WorkflowManifest {
    readonly id: string;
    readonly description: string;
    readonly skills: readonly WorkflowSkillAsset[];
    readonly persistence: WorkflowPersistenceDescriptor;
    readonly llm: WorkflowLlmConfig;
}

// ---------------------------------------------------------------------------
// Load context — provided by the runtime when creating a runner
// ---------------------------------------------------------------------------

export interface WorkflowLoadContext {
    readonly logger: ILogger;
    readonly now: () => Date;
}

// ---------------------------------------------------------------------------
// Request — passed to runner.stream()
// ---------------------------------------------------------------------------

/**
 * Optional per-request hints that workflows may honour when configuring their
 * LLM. Workflows are not required to respect these — they own their model
 * configuration. Callers should treat these as advisory, not authoritative.
 *
 * `clientTools` and `clientToolChoice` carry function schemas declared by the
 * caller. The LLM may emit tool_call outputs for these, which the client is
 * expected to execute and return results for. These are NOT agent tools (which
 * are wired into the LangGraph graph inside createRunner()).
 */
export interface WorkflowInferenceHints {
    readonly temperature?: number;
    readonly topP?: number;
    readonly maxOutputTokens?: number;
    /** Client-declared tool schemas. The LLM may request the client to call these. */
    readonly clientTools?: readonly unknown[];
    /** Controls which client tool (if any) the LLM must/may call. */
    readonly clientToolChoice?: unknown;
}

export interface WorkflowRequest {
    readonly requestId: string;
    readonly workflowId: string;
    readonly input: readonly BaseMessage[];
    readonly instructions?: string;
    readonly metadata?: Readonly<Record<string, unknown>>;
    readonly abortSignal?: AbortSignal;
    readonly inferenceHints?: WorkflowInferenceHints;
}

// ---------------------------------------------------------------------------
// Chunks — protocol-neutral stream emitted by workflows (§8)
// ---------------------------------------------------------------------------

export interface WorkflowChunkBase {
    readonly workflowId: string;
    readonly runId: string;
    readonly node?: string;
    readonly subgraphPath?: readonly string[];
    readonly sequence?: number;
    readonly raw?: unknown;
}

export interface WorkflowLifecycleChunk extends WorkflowChunkBase {
    readonly type: "workflow.started" | "workflow.completed" | "workflow.incomplete";
}

export interface WorkflowMessageChunk extends WorkflowChunkBase {
    readonly type: "message.start" | "message.delta" | "message.done";
    readonly messageId: string;
    readonly role: "assistant" | "user" | "system" | "developer" | "tool";
    readonly delta?: string;
    readonly text?: string;
}

export interface WorkflowReasoningChunk extends WorkflowChunkBase {
    readonly type: "reasoning.start" | "reasoning.delta" | "reasoning.done";
    readonly reasoningId: string;
    readonly summaryIndex: number;
    readonly delta?: string;
    readonly text?: string;
}

export interface WorkflowToolCallChunk extends WorkflowChunkBase {
    readonly type: "tool_call.start" | "tool_call.arguments.delta" | "tool_call.arguments.done";
    readonly callId: string;
    readonly name: string;
    readonly delta?: string;
    readonly argumentsText?: string;
}

export interface WorkflowToolProgressChunk extends WorkflowChunkBase {
    readonly type: "tool.progress";
    readonly callId?: string;
    readonly name: string;
    readonly state: "starting" | "running" | "completed" | "error";
    readonly data?: unknown;
}

export interface WorkflowStateChunk extends WorkflowChunkBase {
    readonly type: "state.values" | "state.updates" | "state.debug";
    readonly data: unknown;
}

export interface WorkflowCustomChunk extends WorkflowChunkBase {
    readonly type: "custom";
    readonly data: unknown;
}

export interface WorkflowTaskChunk extends WorkflowChunkBase {
    readonly type: "task";
    readonly data: unknown;
}

export interface WorkflowCheckpointChunk extends WorkflowChunkBase {
    readonly type: "checkpoint";
    readonly data: unknown;
}

export interface WorkflowMetadataChunk extends WorkflowChunkBase {
    readonly type: "metadata" | "feedback";
    readonly data: unknown;
}

export interface WorkflowErrorChunk extends WorkflowChunkBase {
    readonly type: "error";
    readonly code: string;
    readonly safeMessage: string;
    readonly cause?: unknown;
}

export type WorkflowChunk =
    | WorkflowLifecycleChunk
    | WorkflowMessageChunk
    | WorkflowReasoningChunk
    | WorkflowToolCallChunk
    | WorkflowToolProgressChunk
    | WorkflowStateChunk
    | WorkflowCustomChunk
    | WorkflowTaskChunk
    | WorkflowCheckpointChunk
    | WorkflowMetadataChunk
    | WorkflowErrorChunk;

// ---------------------------------------------------------------------------
// Runner and module
// ---------------------------------------------------------------------------

export interface WorkflowRunner {
    stream(request: WorkflowRequest): AsyncIterable<WorkflowChunk>;
}

export interface WorkflowModule {
    readonly manifest: WorkflowManifest;
    createRunner(context: WorkflowLoadContext): Promise<WorkflowRunner>;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export type WorkflowImport = () => Promise<{ default: WorkflowModule }>;

export interface WorkflowRegistryEntry {
    readonly workflowId: string;
    readonly load: WorkflowImport;
}