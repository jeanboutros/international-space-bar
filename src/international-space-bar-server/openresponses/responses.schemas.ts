import { z } from "zod";
import { createResponseBodySchema } from "./generated/zod/createResponseBodySchema.js";

// Cast required: Kubb generates schemas typed as z.ZodType<T> but the runtime value is z.ZodObject.
export const CreateResponseSchema = (
    createResponseBodySchema as unknown as z.ZodObject<z.ZodRawShape>
)
    .extend({
        model: z.string().min(1),
        // The generated itemParamSchema union is incomplete — it omits UserMessageItemParam and
        // SystemMessageItemParam (spec gap). Override with a permissive schema so any valid
        // input shape (string or array of items) passes validation. The service forwards input
        // to the agent runtime without inspecting individual item shapes.
        input: z.union([z.string(), z.array(z.unknown())]).optional(),
    })
    .passthrough();

export type CreateResponseBody = z.infer<typeof CreateResponseSchema>;
