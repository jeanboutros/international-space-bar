# isb-0061: Document x-openresponses-disallowed sentinel and kubb preprocessing

| Field        | Value                                                                           |
| ------------ | ------------------------------------------------------------------------------- |
| Epic         | isb-epic-010                                                                    |
| Type         | `feature`                                                                       |
| Status       | `backlog`                                                                       |
| Assignee     | Docs Writer                                                                     |
| Priority     | `low`                                                                           |
| Created      | 2026-04-30                                                                      |
| Completed    | —                                                                               |
| Dependencies | isb-0058 (extraction must be complete so the correct import path is documented) |

## Description

Update `docs/technical-stack.md`, `docs/schema-generation.md`, and `AGENTS.md`
to document:

1. The `x-openresponses-disallowed` sentinel convention used in the OpenAPI spec
2. The preprocessing step that strips disallowed fields before Kubb processes the spec
3. The location of the extracted `removeDisallowedFields` function

## Background

The `x-openresponses-disallowed` sentinel is a project-specific convention
invented to mark fields that must not appear in a given protocol context. The
convention is not documented anywhere outside of comments in `kubb.config.ts`.

Without documentation:

- Engineers editing the OpenAPI spec will not know why `minLength:1, maxLength:0` appears
  and may delete or "fix" the constraint, silently breaking the sentinel detection
- Agents working on schema generation will not know why the Kubb config reads a temp
  file rather than the source spec directly
- Anyone adding new fields to the spec will not know how to mark them as disallowed
  in context-specific schemas

The design document (`docs/designs/isb-kubb-preprocessing-and-server-bootstrap.md`)
captures the full rationale, but that is a working design doc. The authoritative
reference for living conventions must be in the standards documentation.

This ticket depends on isb-0058 because the documentation must reference the
correct import path for `removeDisallowedFields` (which lives in
`scripts/kubb-preprocessing.ts` after extraction).

## Technical Context

**`x-openresponses-disallowed` sentinel (from the OpenAPI spec):**

```json
"stream": {
    "type": "string",
    "minLength": 1,
    "maxLength": 0,
    "x-openresponses-disallowed": true
}
```

The `minLength:1, maxLength:0` pair is intentionally impossible — it signals
"this field MUST NOT appear in this context." The `x-openresponses-disallowed`
key is the extension marker. All three must be present simultaneously for the
sentinel to be detected by `removeDisallowedFields`.

**`removeDisallowedFields` function:** After isb-0058, lives in
`scripts/kubb-preprocessing.ts` as a named export.

**Preprocessing flow:**

```
docs/openapi/openresponses.json
        │
        │  readFileSync (in kubb.config.ts)
        ▼
 parsed spec object
        │
        │  removeDisallowedFields() — strips sentinel properties
        ▼
  cleaned spec object
        │
        │  writeFileSync to OS tmpdir
        ▼
  <tmpdir>/openresponses-cleaned.json
        │
        │  Kubb reads from here
        ▼
 src/.../openresponses/generated/   (Zod 4 schemas)
```

**Source spec is never modified.** The preprocessing is read-only from
`docs/openapi/openresponses.json`'s perspective.

## Acceptance Criteria

- **AC-1**: `docs/technical-stack.md` has a "Schema generation — sentinel convention" subsection (or equivalent) explaining `x-openresponses-disallowed`, the three-condition detection rule, and a note about the temp-file pattern.
- **AC-2**: `docs/schema-generation.md` has a "Preprocessing" subsection documenting the full flow (source → `removeDisallowedFields` → temp file → Kubb), the function location (`scripts/kubb-preprocessing.ts`), and guidance for adding new disallowed fields.
- **AC-3**: `AGENTS.md` (the project root agent instructions) references the sentinel convention under the schema generation section with a link to `docs/schema-generation.md` for the full reference.
- **AC-4**: All documentation changes are factually consistent with the implementation in `kubb.config.ts` and `scripts/kubb-preprocessing.ts`.
- **AC-5**: `pnpm check` exits 0 (no lint errors introduced in markdown if applicable).

## Files Affected

- `docs/technical-stack.md` — add subsection on sentinel convention and preprocessing; explain why Kubb's `input.path` points to a temp file.
- `docs/schema-generation.md` — add "Preprocessing" subsection with the full flow diagram, function location, and how-to guide for adding new disallowed fields.
- `AGENTS.md` — add a brief note in the schema generation section about the `x-openresponses-disallowed` sentinel with a link to `docs/schema-generation.md`.

## Test Expectations

No code tests for this ticket. Quality gate: documentation review by the Challenger checking for accuracy against the actual implementation in `kubb.config.ts` (post-isb-0058) and `scripts/kubb-preprocessing.ts`.

## Definition of Done

- `docs/technical-stack.md` contains the sentinel convention documentation.
- `docs/schema-generation.md` contains the preprocessing flow and how-to guide.
- `AGENTS.md` has a cross-reference to `docs/schema-generation.md`.
- `pnpm check` exits 0.
- Challenger reviews and confirms documentation is consistent with the actual code.
