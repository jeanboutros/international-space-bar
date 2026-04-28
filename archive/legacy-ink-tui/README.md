# Legacy Ink TUI — Archive

| Field             | Value                                       |
|-------------------|---------------------------------------------|
| Archive date      | 2026-04-28                                  |
| Original location | `src/international-space-bar/tui/`          |
| Reason            | UI separated from agent runtime; backend-first direction per phased design |

## What's here

Preserved snapshots of the React/Ink terminal UI:

- `InputBar.tsx` — user input component
- `InterruptPrompt.tsx` — interrupt confirmation dialog
- `LogPane.tsx` — scrollable log viewer
- `MessageList.tsx` — conversation message renderer
- `StatusPane.tsx` — status bar
- `TuiApp.tsx` — root TUI component
- `render.tsx` — Ink render entry point
- `store.ts` — Zustand state store
- `theme.ts` — colour and styling tokens
- `use-mouse-scroll.ts` — mouse scroll hook
- `workflow-result-mapper.ts` — maps workflow output to TUI state

## How to inspect

Files are unmodified snapshots from the last working TUI commit.
They are not compiled by default.

## Build expectations

- Excluded from `pnpm build` and `pnpm dev`
- May have stale imports referencing removed modules
- Not covered by CI lint or type-check
