/**
 * Centralised application state store.
 *
 * Replaces the scattered `useState` calls in `TuiApp` with a single Zustand
 * store that can be accessed from any component (via hooks) or from
 * non-React code (via `getState()` / `setState()`).
 *
 * ## Why Zustand?
 *
 * - **No providers** — Ink's reconciler doesn't support React Context well;
 *   Zustand works with bare `useStore` hooks.
 * - **External access** — `getState()` / `setState()` can be called from
 *   workflow callbacks without React being in scope.
 * - **Selectors** — Each component subscribes only to what it needs.
 *
 * ## Architecture rule
 *
 * This store lives in `tui/` (the outermost layer). It must never import from
 * `agent/`, `workflow/`, or `llm/` — those layers communicate with the TUI
 * through the `IWorkflowRunner` interface and event callbacks only.
 */

import { create } from "zustand";
import type { InterruptInfo, TokenUsage, WorkflowEvent } from "../interfaces/agent.interface.js";

// ---------------------------------------------------------------------------
// Chat message type (previously defined in MessageList.tsx)
// ---------------------------------------------------------------------------

export interface ChatMessage {
    readonly role: "user" | "agent" | "system" | "reasoning";
    readonly content: string;
}

// ---------------------------------------------------------------------------
// State shape + actions
// ---------------------------------------------------------------------------

export interface AppState {
    // ── Chat ──────────────────────────────────────────────────────────
    readonly messages: readonly ChatMessage[];
    addMessage: (msg: ChatMessage | readonly ChatMessage[]) => void;
    clearMessages: () => void;

    // ── Processing ────────────────────────────────────────────────────
    readonly isProcessing: boolean;
    setProcessing: (v: boolean) => void;

    // ── Interrupts (HITL) ─────────────────────────────────────────────
    readonly currentInterrupt: InterruptInfo | null;
    setCurrentInterrupt: (v: InterruptInfo | null) => void;

    // ── Token usage ───────────────────────────────────────────────────
    readonly tokenUsage: TokenUsage | null;
    accumulateTokens: (usage: TokenUsage | undefined) => void;

    // ── Workflow iteration loop ───────────────────────────────────────
    readonly currentIteration: number;
    incrementIteration: () => void;
    resetIteration: () => void;

    // ── Satisfaction ──────────────────────────────────────────────────
    readonly satisfactionScore: number | null;
    setSatisfactionScore: (v: number | null) => void;

    // ── Workflow events (for status pane) ─────────────────────────────
    readonly lastEvent: WorkflowEvent | null;
    setLastEvent: (v: WorkflowEvent | null) => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useAppStore = create<AppState>((set) => ({
    // ── Chat ──
    messages: [],
    addMessage: (msg) =>
        set((state) => {
            const items: readonly ChatMessage[] = Array.isArray(msg) ? msg : [msg];
            return { messages: [...state.messages, ...items] };
        }),
    clearMessages: () => set({ messages: [] }),

    // ── Processing ──
    isProcessing: false,
    setProcessing: (v) => set({ isProcessing: v }),

    // ── Interrupts ──
    currentInterrupt: null,
    setCurrentInterrupt: (v) => set({ currentInterrupt: v }),

    // ── Token usage ──
    tokenUsage: null,
    accumulateTokens: (usage) => {
        if (!usage) return;
        set((state) => ({
            tokenUsage: state.tokenUsage
                ? {
                      inputTokens: state.tokenUsage.inputTokens + usage.inputTokens,
                      outputTokens: state.tokenUsage.outputTokens + usage.outputTokens,
                      totalTokens: state.tokenUsage.totalTokens + usage.totalTokens,
                  }
                : usage,
        }));
    },

    // ── Iteration ──
    currentIteration: 0,
    incrementIteration: () => set((state) => ({ currentIteration: state.currentIteration + 1 })),
    resetIteration: () => set({ currentIteration: 0 }),

    // ── Satisfaction ──
    satisfactionScore: null,
    setSatisfactionScore: (v) => set({ satisfactionScore: v }),

    // ── Events ──
    lastEvent: null,
    setLastEvent: (v) => set({ lastEvent: v }),
}));
