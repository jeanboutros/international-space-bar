# Advisory: langGraphBlocks eager buffering defeats real-time streaming

| Field | Value |
|-------|-------|
| Status | `open` |
| Source | isb-epic-011 (Phase C review, Engineer W-1) |
| Severity | MEDIUM |
| Category | `tech-debt` |
| Finding | `langGraphBlocks` eagerly buffers the entire LLM stream before returning blocks, so SSE events arrive as a burst after generation completes rather than in real-time. |
| Details | The function signature is `async function langGraphBlocks(...): Promise<Block[]>`. It `for await`s over the entire `graph.streamEvents()` iterable, populating and `.end()`ing all `AsyncQueue` instances before returning. The caller `await`s the full result before calling `rs.run(blocks)`. The fix is to change the return type to `AsyncIterable<Block>` and launch the streamEvents consumer in a concurrent task that feeds queues while the main async function* yields blocks as they're created. `ResponseStream.run()` already accepts `AsyncIterable<Block>` so the permanent architecture supports true streaming — only `langGraphBlocks` needs the refactor. |
| Resolution | |
