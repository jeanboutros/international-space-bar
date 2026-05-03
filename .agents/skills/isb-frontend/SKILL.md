---
name: isb-frontend
description: "International Space Bar frontend specifics — archived Ink TUI, OpenCode client integration, Phase 6 UI strategy. Use when: working with the archived TUI, configuring OpenCode as a provider, planning future UI work, evaluating client strategies for the ISB service, or making presentation-layer decisions. Extends frontend-engineering."
---

# ISB Frontend — Project-Specific Skill

## Prerequisites

**Load `.agents/skills/frontend-engineering/SKILL.md` first.** This skill extends the general frontend principles with International Space Bar specifics. If you have not loaded the general skill, do so before proceeding.

---

## Current State: Backend-First, UI Deferred

The product direction is **backend-first**. The backend NestJS service and OpenResponses protocol surface are the MVP. UI/client work is explicitly deferred to **Phase 6** of the delivery plan.

**Do not start UI implementation work until phases 0–5 are complete** unless the Agency Director explicitly approves an exception.

```
Phase 0–5: Backend service, protocol, runtime, tools, observability
Phase 6:   Future client/UI strategy (this skill's domain)
```

---

## Archived UI: Ink TUI

The original in-repo terminal UI was built with Ink (React for CLI). It has been **archived** — moved out of the active source tree and excluded from default builds and runtime.

### Archive Location

```
archive/legacy-ink-tui/
  README.md          # Archive date, origin, reason, restoration instructions
  src/tui/           # Preserved source files
```

### Original Tech Stack (Archived)

| Concern    | Choice                                                      |
| ---------- | ----------------------------------------------------------- |
| Framework  | Ink 7 (React for CLI)                                       |
| React      | React 19.2                                                  |
| State      | Zustand 5                                                   |
| Components | InputBar, MessageList, LogPane, StatusPane, InterruptPrompt |
| Streaming  | log-stream.ts (pino ring buffer → Ink)                      |
| Theme      | theme.ts (shared color/style tokens)                        |
| Mouse      | use-mouse-scroll.ts (custom hook)                           |

### Archive Rules

- Source is preserved but **not expected to compile** unless intentionally restored.
- No active `src/` file may import from `archive/`.
- Archive dependencies (`ink`, `react`, `zustand`, `yoga-wasm-web`) should be removed from `package.json` once no active source imports them.
- The archive is a **noise-reduction step**, not a deletion — the code has historical and reference value.

### Lessons From the Archived TUI

These lessons from [docs/tui-architecture-analysis.md](../../docs/tui-architecture-analysis.md) inform any future ISB UI:

1. **Separate UI from agent runtime.** The original TUI was tightly coupled to the agent system. The composition root injected compiled workflows into TUI components — correct pattern, but coupling was still too deep.
2. **TUI never imports from agent/, workflow/, llm/, or tool/.** The composition root wires dependencies via props or callbacks.
3. **Infrastructure utilities (log ring buffer, stream helpers) live at the composition root or in services/, never in the UI layer.**
4. **State management should be external to the rendering framework.** Zustand worked well — framework-agnostic and subscription-based.

---

## Current Client: OpenCode

OpenCode is the interaction client for phases 0–5. It connects to the backend as a **custom provider** using the OpenResponses protocol.

### How OpenCode Connects

```jsonc
// docs/examples/opencode-isb-ping.jsonc
{
    "provider": {
        "international-space-bar": {
            "npm": "@ai-sdk/openai",
            "name": "International Space Bar",
            "options": {
                "baseURL": "http://127.0.0.1:3000/v1",
                "apiKey": "{env:ISB_OPENRESPONSES_API_KEY}",
            },
            "models": {
                "isb-ping": { "name": "ISB Ping" },
            },
        },
    },
}
```

- Uses `@ai-sdk/openai` (not `@ai-sdk/openai-compatible`) because it targets `/v1/responses`.
- `baseURL` points at the local NestJS backend.
- `apiKey` uses the `{env:VAR}` syntax for environment variable resolution.
- OpenCode provides its own TUI — we do not build or modify it.

### OpenCode Limitations to Track

- OpenCode's own TUI/server architecture is useful **research only** — not implementation scope.
- OpenCode's tool permission model may interact with backend approval mechanisms (Phase 4 concern).
- If OpenCode proves insufficient as a long-term client, Phase 6 reassesses alternatives.

---

## ISB Protocol Surface (Client Perspective)

The frontend communicates with the ISB backend exclusively through **OpenResponses**:

| Endpoint             | Method                     | Purpose                               |
| -------------------- | -------------------------- | ------------------------------------- |
| `POST /v1/responses` | Non-streaming              | Send input, receive complete response |
| `POST /v1/responses` | Streaming (`stream: true`) | SSE event stream                      |
| `GET /health`        | Health check               | Service status                        |

### SSE Event Sequence

```
response.created → response.output_text.delta (1+) → response.completed
```

Future events: tool call events, approval requests, status updates (Phase 4+).

---

## Phase 6: Future UI Strategy

When phases 0–5 are complete, the team will evaluate the next client/UI direction. This section captures the decision framework, not a decision.

### Options Under Consideration

| Option                       | Pros                                                        | Cons                                                 |
| ---------------------------- | ----------------------------------------------------------- | ---------------------------------------------------- |
| **Keep OpenCode**            | Zero UI work, existing tool ecosystem, community maintained | Limited customisation, dependent on external project |
| **New custom TUI**           | Full control, branded experience, deep agent integration    | Significant effort, maintenance burden               |
| **Web UI**                   | Rich interaction, accessible, no terminal dependency        | Requires web stack, hosting, auth                    |
| **Protocol-only (headless)** | Maximum flexibility, any client can connect                 | No default experience for users                      |

### Evaluation Criteria (Phase 6)

1. Does the backend protocol surface (proven in phases 0–5) support the client's needs?
2. What interaction patterns does the agent runtime require that OpenCode cannot provide?
3. What is the maintenance cost vs. the value of a custom UI?
4. Does the team have frontend capacity, or should backend-protocol investment continue?

### If a Custom TUI Is Built

ISB-specific layered architecture constraints:

- **The TUI layer is the outermost presentation layer.** It may import from `interfaces/` and `services/` only.
- **Never import from `agent/`, `workflow/`, `llm/`, or `tool/`** in UI code.
- **The composition root injects dependencies** via props, callbacks, or event streams.
- **The TUI communicates with the backend over HTTP/OpenResponses**, not by importing agent modules directly. This is the key architectural improvement over the archived TUI.

Technology candidates (evaluate at Phase 6, not before):

| Library                 | Notes                                          |
| ----------------------- | ---------------------------------------------- |
| Ink 7+                  | Proven in this repo, React model, but archived |
| Ratatui (via wasm/napi) | Rust TUI, high performance, less JS-native     |
| Blessed/neo-blessed     | Legacy, not recommended                        |
| Web-based (React/Solid) | If web UI path is chosen                       |

### If a Web UI Is Built

- Use the OpenResponses protocol as the API layer — do not create a parallel API.
- SSE streaming from `POST /v1/responses` works natively in browsers via `fetch` + `ReadableStream`.
- Authentication and CORS become real concerns (not needed for local-only TUI).
- Consider whether the web UI is a standalone SPA or embedded in a larger product.

---

## ISB Tech Stack Constraints (For Future UI Work)

| Concern         | Constraint                                           |
| --------------- | ---------------------------------------------------- |
| Runtime         | Node.js 22 (Active LTS)                              |
| Language        | TypeScript 5 — strict mode, ESM (`"type": "module"`) |
| Validation      | Zod 4 for any client-side schemas                    |
| Package manager | pnpm                                                 |
| Quality         | `pnpm check` must exit 0 after every change          |
| Formatting      | Biome (format + imports + non-type-aware lint)       |
| Linting         | ESLint (type-aware rules only)                       |
| Module system   | ESM — no CommonJS                                    |
