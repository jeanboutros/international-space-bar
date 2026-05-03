---
name: frontend-engineering
description: "General frontend and UI engineering principles. Use when: planning UI architecture, separating presentation from domain logic, designing protocol-driven clients, implementing SSE consumption, choosing state management patterns, or reviewing UI code for clean architecture compliance. Reusable across projects."
---

# Frontend Engineering — General Principles

## Purpose

Reusable frontend and UI engineering principles for protocol-driven clients with clean architecture boundaries. This skill is **project-agnostic** — it captures patterns and best practices that apply to any presentation layer communicating with a backend service.

For project-specific details (archived UI, client integrations, delivery phases), load the companion project skill that extends this one.

---

## Core Principle: UI Is an Outer Adapter

The presentation layer is the **outermost** layer in a clean architecture. It consumes the backend through a protocol (HTTP, WebSocket, SSE) — not by importing domain modules directly.

```
UI (outermost)
  → protocol boundary (HTTP / SSE)
    → backend service
      → domain logic (innermost)
```

This means:

- **UI code never imports domain, orchestration, or infrastructure modules.**
- The composition root (or a DI container) wires backend capabilities into UI components via props, callbacks, event streams, or injected services.
- If the UI needs data that lives in the domain, it requests it through the protocol.

---

## Layered Architecture for UI

### Allowed Imports

| UI Layer     | May Import From                                                    |
| ------------ | ------------------------------------------------------------------ |
| Components   | Interfaces/contracts, shared utilities, other UI components        |
| UI utilities | Interfaces/contracts, shared utilities                             |
| **Never**    | Domain services, orchestration, LLM adapters, tool implementations |

### Dependency Injection

The composition root connects the UI to the backend. The UI receives:

- **Callbacks** for actions (send message, approve tool call).
- **Streams/observables** for data (message deltas, status updates).
- **Configuration** for connection details (base URL, auth).

The UI never constructs backend services or directly invokes domain logic.

---

## Protocol-Driven Client Architecture

### The Client Communicates Over HTTP

Whether the UI is a TUI, web app, or mobile app, it talks to the backend through the **same protocol surface**. This gives:

- **Substitutability** — swap the client without changing the backend.
- **Testability** — mock the HTTP layer to test the UI in isolation.
- **Decoupling** — UI and backend can evolve independently.

### SSE Consumption Pattern

For backends that stream via Server-Sent Events on POST routes:

```typescript
const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ ...request, stream: true }),
});

const reader = response.body!.getReader();
const decoder = new TextDecoder();

while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value);
    // Parse SSE frames: "event: <type>\ndata: <json>\n\n"
    for (const event of parseSSEFrames(chunk)) {
        handleEvent(event);
    }
}
```

### Client Must Handle

- **Connection drops and reconnection** — SSE streams can break.
- **Partial deltas** — assemble incremental text into complete output.
- **Error events** — display backend errors to the user.
- **Backpressure** — if the UI can't keep up with events, buffer or drop gracefully.

---

## State Management

### Framework-Agnostic State

State management should be **external to the rendering framework** when possible. This makes state:

- Testable without rendering.
- Shareable across components without prop drilling.
- Portable if the rendering framework changes.

Good patterns:

- **External stores** (Zustand, Jotai, Valtio) — framework-agnostic, subscription-based.
- **Signals** (Solid, Preact signals) — fine-grained reactivity.
- **Event-driven** — state machine or reducer pattern driven by SSE events.

Avoid:

- Framework-locked state that can't be tested without mounting components.
- Global mutable singletons without subscription patterns.

### UI State vs Server State

| Type          | Owns     | Examples                                             |
| ------------- | -------- | ---------------------------------------------------- |
| Server state  | Backend  | Messages, agent responses, session data              |
| UI state      | Client   | Scroll position, input focus, panel visibility       |
| Derived state | Computed | "Is streaming?" (derived from SSE connection status) |

Server state should be the source of truth. The UI caches and projects it for rendering, but doesn't own it.

---

## Separation of Concerns

### What Lives in the UI Layer

- Rendering components (layout, styling, interaction).
- Input handling (keyboard, mouse, touch).
- UI-only state (scroll, focus, theme).
- Protocol client (fetch, SSE reader) — the thinnest possible HTTP layer.

### What Does NOT Live in the UI Layer

- Business logic (validation rules, routing decisions, agent orchestration).
- Infrastructure utilities (log ring buffers, stream multiplexers).
- Authentication logic (token management lives in a shared auth module, not in components).

Infrastructure utilities that the UI needs (e.g., log streaming) live at the **composition root** or in **shared utilities**, not in the UI folder.

---

## TUI-Specific Patterns

For terminal-based UIs (Ink, Blessed, Ratatui, or custom):

- **The TUI is still an outer adapter.** Same layering rules as web UIs.
- **Component model** — prefer declarative (Ink/React) over imperative (Blessed).
- **Input handling** — terminal input is single-threaded; use an event loop, not blocking reads.
- **Streaming display** — SSE deltas should render incrementally, not wait for completion.
- **Graceful shutdown** — clean up terminal state (cursor, alternate screen) on exit or crash.

---

## Web UI-Specific Patterns

For browser-based UIs:

- Use the same protocol surface as any other client — do not create a parallel API.
- SSE from POST routes works natively via `fetch` + `ReadableStream`.
- **CORS** becomes a real concern for cross-origin deployments.
- **Authentication** must be handled (tokens, cookies, OAuth) — not needed for local-only TUIs.
- Prefer modern patterns: Server Components, streaming HTML, progressive enhancement.

---

## Quality Gates

After **every** code change, including UI work:

```bash
pnpm check    # Must exit 0
pnpm build    # Must exit 0
```

- UI code follows the **same TypeScript strict mode and ESM conventions** as backend code.
- Never suppress a lint rule without a comment explaining why.
- Biome owns formatting and imports; ESLint owns type-aware rules.
