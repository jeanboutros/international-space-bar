# isb-0007: Documentation — archive README, examples, env, AGENTS.md

| Field        | Value              |
| ------------ | ------------------ |
| Epic         | isb-epic-001       |
| Status       | `backlog`          |
| Assignee     | Docs Writer        |
| Priority     | `medium`           |
| Created      | 2026-04-28         |
| Completed    | —                  |
| Dependencies | isb-0004, isb-0005 |

## Description

Create documentation artifacts for Phase 0: an archive README explaining the legacy TUI, an OpenCode example config showing how to connect to the ISB service, a `.env.example` with required environment variables, and an update to `AGENTS.md` reflecting the new project structure, commands, and layers.

## Acceptance Criteria

- [ ] `archive/legacy-ink-tui/README.md` created — explains what was archived, why, and how to restore if needed
- [ ] `docs/examples/opencode-isb-ping.jsonc` created — working OpenCode config example that targets the ISB ping-pong endpoint
- [ ] `.env.example` created — lists `ISB_OPENRESPONSES_API_KEY` and `PORT` with placeholder values and comments
- [ ] `AGENTS.md` updated:
    - Project structure tree includes `src/international-space-bar-server/` and `archive/legacy-ink-tui/`
    - Commands table reflects new scripts (`dev:server`, `build:server`, `start:server`, `test`)
    - Architecture layers section updated to include the server layer
- [ ] All markdown files pass `pnpm check` (Biome formatting)
- [ ] Deferred docs not touched: `technical-stack.md`, `agent-observability-logging.md`, `workflow.md`

## Files Affected

- `archive/legacy-ink-tui/README.md` — new: archive context and restoration instructions
- `docs/examples/opencode-isb-ping.jsonc` — new: OpenCode example configuration
- `.env.example` — new: environment variable template
- `AGENTS.md` — update: structure tree, commands table, architecture layers

## PoC Snippets

```jsonc
// docs/examples/opencode-isb-ping.jsonc
{
    // OpenCode config targeting local ISB ping-pong endpoint
    "provider": {
        "name": "openai-compatible",
        "url": "http://localhost:3007/v1",
        "apiKey": "$ISB_OPENRESPONSES_API_KEY",
        "model": "ping-pong",
    },
}
```

```bash
# .env.example
# Required: API key for bearer token auth on the OpenResponses endpoint
ISB_OPENRESPONSES_API_KEY=your-secret-key-here

# Optional: Server port (default: 3007)
PORT=3007
```

## Comments

This ticket runs in parallel with isb-0006 (tests). Both depend on the implementation tickets being complete. Deferred doc updates (technical-stack.md, workflow.md, agent-observability-logging.md) will be handled in a future epic.
