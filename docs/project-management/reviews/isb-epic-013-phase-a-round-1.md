# isb-epic-013 — Phase A Review (Round 1)

| Field   | Value          |
| ------- | -------------- |
| Date    | 2026-05-03     |
| Phase   | A (validation) |
| Round   | 1              |
| Verdict | **SATISFIED**  |

## Design Document

`docs/designs/isb-langgraph-streaming-refactor.md`

## Participants

- Architect: PASS
- Engineer: CONCERNS (1 critical, 2 medium, 1 low)
- Security Reviewer: CONCERNS (3 medium, 2 low, 1 info)
- Tech Validator: **SATISFIED** (with 3 conditions)

---

## Architect Review

### Verdict: PASS

**Findings:**

1. Layered boundary compliance: pass — no cross-layer imports introduced
2. Interface contract (`AsyncGenerator<Block>`): pass — `ResponseStream.run()` already accepts `AsyncIterable<Block>`
3. Concurrent producer pattern — SRP: pass — responsibility unchanged (translate events to blocks)
4. `AsyncQueue` reuse as block channel: pass (DRY)
5. Error propagation via `await producer` in `finally` — medium concern: consumer-never-iterates precondition must be documented. Safe with current `ResponseStream.run()` architecture.
6. DI pattern preserved: pass
7. Open/Closed principle: pass — extends without breaking existing consumers
8. File placement: pass

No flags raised.

---

## Engineer Review

### Verdict: CONCERNS

**Critical findings:**

1. **CRITICAL — Producer `finally` must end per-block queues**: §4 pseudocode only showed `blockChannel.end()` in `finally`. If producer errors mid-stream, open delta queues cause consumer deadlock. §5's error table describes correct behaviour but §4 contradicted it. **Resolution: §4 amended to show full queue cleanup.**

2. **MEDIUM — `await producer` error masking**: If both consumer and producer fail simultaneously, `await producer` in `finally` replaces the consumer error. **Resolution: §4 amended to use `await producer.catch(() => {})`.**

3. **MEDIUM — No existing `langGraphBlocks` tests**: No test file exists. AC #2, #4, #6 cannot be verified without dedicated tests. **Resolution: §6 amended to include `lang-graph-blocks.test.ts` (new file).**

4. **LOW — `blocks.test.ts` incorrectly listed as affected**: File has zero `langGraphBlocks` coupling. **Resolution: Removed from §6.**

**Positive confirmations:**

- `ResponseStream.run()` type compatibility confirmed (`AsyncIterable<Block>` in union)
- Caller change correct and minimal (one-line)
- `AsyncQueue<Block>` reuse appropriate (single-consumer, push/pull/end)
- `AsyncQueue.push()` after `end()` safe (no corruption)

**Flag raised:** ticket for `langGraphBlocks` unit tests (non-blocking)

---

## Security Review

### Verdict: CONCERNS

| #   | Severity | Category            | Finding                                              | Disposition                                                                        |
| --- | -------- | ------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 1   | MEDIUM   | resource-exhaustion | Unbounded `AsyncQueue` buffer — no backpressure      | Pre-existing, not introduced by this refactor. Deferrable to remote-provider work. |
| 2   | MEDIUM   | info-disclosure     | Raw `err.message` in `response.failed`               | Pre-existing, tracked by isb-adv-0001. Not in scope.                               |
| 3   | MEDIUM   | dos                 | Consumer abandonment leaves producer running         | Design §5 already specifies AbortSignal check inside producer loop.                |
| 4   | LOW      | signal-handling     | AbortSignal not propagated to `graph.streamEvents()` | Tracked by isb-0011. Orthogonal.                                                   |
| 5   | LOW      | race-condition      | `await producer` error after generator return        | Observability concern. Addressed by `.catch()` amendment.                          |
| 6   | INFO     | dos                 | No per-request timeout on LLM streaming              | Future concern for remote providers.                                               |

**Flags raised:** 2 clarifications (error message sanitisation + producer abort on disconnect) — non-blocking.

---

## Tech Validator Decision

### Verdict: SATISFIED (with conditions)

**Finding-by-finding evaluation:**

| Finding                        | Source    | Severity | Blocks Phase B? | Reasoning                                            |
| ------------------------------ | --------- | -------- | --------------- | ---------------------------------------------------- |
| Producer `finally` incomplete  | Engineer  | Critical | No (amended)    | §4 pseudocode expanded to show full queue cleanup    |
| `await producer` error masking | Engineer  | Medium   | No (amended)    | Changed to `.catch()` in §4                          |
| No unit tests                  | Engineer  | Medium   | No              | Ticket flag raised; tests included in affected files |
| `blocks.test.ts` misattributed | Engineer  | Low      | No (amended)    | Removed from §6                                      |
| Consumer-never-iterates        | Architect | Medium   | No              | Safe in current architecture, documented             |
| Unbounded queue                | Security  | Medium   | No              | Pre-existing, not introduced by refactor             |
| Error message leak             | Security  | Medium   | No              | Pre-existing (isb-adv-0001)                          |
| Producer abort on disconnect   | Security  | Medium   | No              | Already in design §5                                 |
| Signal to streamEvents         | Security  | Low      | No              | Tracked (isb-0011)                                   |
| await producer race            | Security  | Low      | No              | Addressed by `.catch()`                              |

**Conditions applied before Phase B:**

1. ✅ §4 pseudocode expanded with full queue cleanup in `finally`
2. ✅ §4 `finally` uses `await producer.catch(() => {})`
3. ✅ §6 corrected: removed `blocks.test.ts`, added `lang-graph-blocks.test.ts` (new file)

---

## Flags Routed to PM

| Flag                         | Type          | Priority | Blocking | Source                    |
| ---------------------------- | ------------- | -------- | -------- | ------------------------- |
| `langGraphBlocks` unit tests | ticket        | medium   | no       | Engineer + Tech Validator |
| Error message sanitisation   | clarification | medium   | no       | Security Reviewer         |
| Producer abort on disconnect | clarification | medium   | no       | Security Reviewer         |
