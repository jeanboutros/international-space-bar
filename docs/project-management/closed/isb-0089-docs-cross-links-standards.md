# isb-0089: Update docs — cross-links, websocket-transport, AGENTS.md, standards

| Field      | Value         |
| ---------- | ------------- |
| Type       | `docs`        |
| Priority   | `low`         |
| Status     | `not-started` |
| Epic       | isb-epic-011  |
| Depends on | isb-0087      |

## Description

Update project documentation to reflect the new ResponseStream architecture:
add cross-links from `openresponses-backend-phased-design.md` and
`websocket-transport.md` to the new design doc, update AGENTS.md project
structure section to list new files/directories, and update any standards
references per the Docs Planner output.

## Files affected

- `docs/openresponses-backend-phased-design.md` — add cross-link to `response-stream-builder.md`
- `docs/websocket-transport.md` — add cross-link noting ResponseStream applicability
- `AGENTS.md` — update project structure and import table if needed
- `docs/technical-stack.md` — update if new dependencies are introduced

## Acceptance criteria

- [ ] AC-1: `openresponses-backend-phased-design.md` links to `response-stream-builder.md`
- [ ] AC-2: `websocket-transport.md` references ResponseStream where relevant
- [ ] AC-3: AGENTS.md project structure reflects new `blocks/` directory and key new files
- [ ] AC-4: All cross-links resolve (no broken anchors)
- [ ] AC-5: `pnpm check` exits 0
