/**
 * Council workflow context schema.
 *
 * Defines the runtime context passed to the council sub-graph from the
 * director workflow. Uses the same shape as {@link DirectorContextSchema}
 * for consistency.
 */

import { z } from "zod";

export const CouncilContextSchema = z.object({
    ctx: z.custom<import("../interfaces/app-context.interface.js").AppContext>(() => true),
    thread_id: z.string(),
});

export type CouncilContext = z.infer<typeof CouncilContextSchema>;
