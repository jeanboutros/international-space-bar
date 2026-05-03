# isb-0076: Document echo-field defaults for ResponseStreamConfig

| Field      | Value              |
| ---------- | ------------------ |
| Type       | `docs`             |
| Priority   | `medium`           |
| Status     | `not-started`      |
| Epic       | isb-epic-011       |
| Depends on | none               |
| Raised by  | Engineer (Phase A) |

## Problem

The design document (§D5) references echo-field defaults but does not enumerate
the specific default values for four fields:

- `tool_choice` → `"auto"`
- `truncation` → `"disabled"`
- `text` → `{ format: { type: "text" } }`
- `parallel_tool_calls` → `true`

Without these documented, implementation tickets risk assumption-trap triggers.

## Solution

Add a defaults table to the design document (`docs/response-stream-builder.md`)
in §D5 or §6.2 listing every `ResponseStreamConfig` field with its spec-mandated
default value. Reference the OpenResponses specification for each.

## Full defaults table

| Field                  | Default value                  | Source             |
| ---------------------- | ------------------------------ | ------------------ |
| `temperature`          | `1`                            | OpenResponses spec |
| `top_p`                | `1`                            | OpenResponses spec |
| `presence_penalty`     | `0`                            | OpenResponses spec |
| `frequency_penalty`    | `0`                            | OpenResponses spec |
| `top_logprobs`         | `0`                            | OpenResponses spec |
| `tool_choice`          | `"auto"`                       | OpenResponses spec |
| `truncation`           | `"disabled"`                   | OpenResponses spec |
| `text`                 | `{ format: { type: "text" } }` | OpenResponses spec |
| `parallel_tool_calls`  | `true`                         | OpenResponses spec |
| `reasoning`            | `null`                         | OpenResponses spec |
| `max_output_tokens`    | `null` (unlimited)             | OpenResponses spec |
| `max_tool_calls`       | `null`                         | OpenResponses spec |
| `store`                | `true`                         | OpenResponses spec |
| `service_tier`         | `"default"`                    | OpenResponses spec |
| `metadata`             | `{}`                           | OpenResponses spec |
| `safety_identifier`    | `null`                         | OpenResponses spec |
| `prompt_cache_key`     | `null`                         | OpenResponses spec |
| `previous_response_id` | `null`                         | OpenResponses spec |

## Acceptance criteria

- [ ] Defaults table added to `docs/response-stream-builder.md` in §D5 or §6.2
- [ ] Each default references the spec
- [ ] Engineer implementing §9.3.2 can read defaults without guessing
