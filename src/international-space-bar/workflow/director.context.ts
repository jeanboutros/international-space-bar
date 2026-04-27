/**
 * Director workflow context schema.
 *
 * Defines the runtime context passed to the director graph at invocation
 * time via the `context` parameter. This replaces ad-hoc
 * `configurable` keys with a validated Zod schema per LangGraph best
 * practices.
 *
 * Nodes access the context via `config.context` which is typed by the
 * context schema passed to `StateGraph`.
 */

import { z } from "zod";

/**
 * Zod schema for the director context.
 *
 * - `ctx` — the cross-cutting {@link AppContext} (logger + config).
 * - `thread_id` — conversation thread identifier for checkpointing.
 */
export const DirectorContextSchema = z.object({
    ctx: z.custom<import("../interfaces/app-context.interface.js").AppContext>(() => true),
    thread_id: z.string(),
});

export type DirectorContext = z.infer<typeof DirectorContextSchema>;
