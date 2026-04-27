# Implementation Plan — Stream 1: TUI State Management

## Overview

Replace all `useState` in `TuiApp.tsx` with a Zustand store. This fixes stale closures, enables external state mutation (streaming, workflow events), and reduces unnecessary re-renders.

## Phase 1: Install Zustand

```bash
pnpm add zustand
```

## Phase 2: Create the Store

**New file**: `src/international-space-bar/tui/store.ts`

```ts
import { create } from "zustand";
import type { TokenUsage } from "../interfaces/agent.interface.js";
import type { InterruptInfo } from "../interfaces/agent.interface.js";

export interface ChatMessage {
  readonly role: "user" | "agent" | "system" | "reasoning";
  readonly content: string;
}

export interface AppState {
  // Chat
  messages: ChatMessage[];
  addMessage: (msg: ChatMessage | ChatMessage[]) => void;

  // Processing
  isProcessing: boolean;
  setProcessing: (v: boolean) => void;

  // Interrupts
  currentInterrupt: InterruptInfo | null;
  setCurrentInterrupt: (v: InterruptInfo | null) => void;

  // Tokens
  tokenUsage: TokenUsage | null;
  accumulateTokens: (usage: TokenUsage | undefined) => void;

  // Workflow lifecycle
  currentIteration: number;
  incrementIteration: () => void;
  resetIteration: () => void;

  // Satisfaction
  satisfactionScore: number | null;
  setSatisfactionScore: (v: number | null) => void;
}
```

Key design decisions:
- **All state in one store** — this app is small enough that a single store with selectors is simpler than split stores.
- **Actions are part of the store** — `addMessage`, `accumulateTokens` etc. are defined alongside state, removing the need for callback chains.
- **External access** — `useAppStore.getState()` and `useAppStore.setState()` can be called from workflow event handlers without React.

## Phase 3: Refactor TuiApp.tsx

1. Remove all `useState` calls (`messages`, `isProcessing`, `currentInterrupt`, `tokenUsage`, `appendMessage`, `accumulateTokens`)
2. Replace with Zustand selectors:
   ```ts
   const messages = useAppStore((s) => s.messages);
   const isProcessing = useAppStore((s) => s.isProcessing);
   const currentInterrupt = useAppStore((s) => s.currentInterrupt);
   const tokenUsage = useAppStore((s) => s.tokenUsage);
   ```
3. `handleSubmit` and `handleInterruptDecision` become plain functions that call `useAppStore.getState().addMessage(...)` etc.
4. Fix stale closure bug — zustand always reads current state via `getState()` or selectors.

## Phase 4: Refactor Child Components

Each component subscribes to only what it needs:

| Component | Selected state |
|-----------|---------------|
| `MessageList` | `messages` |
| `InputBar` | `isProcessing` |
| `StatusPane` | `agentName` (prop), `isProcessing`, `messageCount`, `tokenUsage`, `threadId` |
| `LogPane` | stays on ring buffer (separate concern) |
| `InterruptPrompt` | `currentInterrupt` |

Remove prop-passing from `TuiApp.tsx` where the component can use the store directly.

## Phase 5: Fix Scroll Issues

Refactor `MessageList.tsx`:
- Replace message-count-based scroll with character-based estimation:
  ```ts
  const estimatedLines = Math.ceil(msg.content.length / columns) + 1;
  ```
- Or use a proper virtual scrolling approach based on Ink's `useBoxMetrics`.

## Phase 6: Add Error Boundary

Create `TuiErrorBoundary.tsx` using Ink's error handling. Catch errors in `handleSubmit`/`handleInterruptDecision` and push error messages to the store instead of crashing.

## Phase 7: Keyboard Conflict Resolution

- Move `useInput` for scroll (PageUp/PageDown, mouse wheel) to a single top-level handler
- Give `InputBar` priority for text input when focused
- Use a shared state in the store for "which pane has keyboard focus"

## File Changes Summary

| Action | File |
|--------|------|
| Create | `tui/store.ts` |
| Modify | `tui/TuiApp.tsx` — remove useState, use store selectors |
| Modify | `tui/MessageList.tsx` — use store, fix scroll estimation |
| Modify | `tui/InputBar.tsx` — use store |
| Modify | `tui/StatusPane.tsx` — use store |
| Modify | `tui/InterruptPrompt.tsx` — use store |
| Create | `tui/TuiErrorBoundary.tsx` |