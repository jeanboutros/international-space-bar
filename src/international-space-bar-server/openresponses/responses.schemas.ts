import { z } from "zod";
import { createResponseBodySchema } from "./generated/zod/createResponseBodySchema.js";

// Cast required: Kubb generates schemas typed as z.ZodType<T> but the runtime value is z.ZodObject.
export const CreateResponseSchema = (
    createResponseBodySchema as unknown as z.ZodObject<z.ZodRawShape>
)
    .extend({ model: z.string().min(1) })
    .passthrough();

export type CreateResponseBody = z.infer<typeof CreateResponseSchema>;
