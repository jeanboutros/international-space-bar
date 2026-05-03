# Advisory: reasoningBlock spec compliance gaps

| Field | Value |
|-------|-------|
| Status | `open` |
| Source | isb-epic-011 (Phase C review, Engineer W-2/W-3) |
| Severity | MEDIUM |
| Category | `spec-compliance` |
| Finding | `reasoningBlock` uses wrong event types (`content_part.added/done` instead of `reasoning_summary_part.added/done`) and is missing the `reasoning_summary.done` event. |
| Details | The spec defines dedicated `response.reasoning_summary_part.added`, `response.reasoning_summary_part.done`, and `response.reasoning_summary_text.done` events for reasoning items. The current implementation uses generic `content_part` events and omits the summary-done signal. Clients strictly following the spec event sequence will not receive the "done" signal for reasoning summary text. The generated schemas (`responseReasoningSummaryPartAddedStreamingEventSchema`, `responseReasoningSummaryPartDoneStreamingEventSchema`, `responseReasoningSummaryDoneStreamingEventSchema`) exist but are unused. |
| Resolution | |
