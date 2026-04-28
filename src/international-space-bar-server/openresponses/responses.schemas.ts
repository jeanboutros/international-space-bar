import { z } from "zod";

export const CreateResponseSchema = z.looseObject({
    model: z.string().min(1),
    input: z.union([z.string(), z.array(z.unknown())]),
    stream: z.boolean().optional().default(false),
    stream_options: z.unknown().optional(),
    previous_response_id: z.string().optional(),
    instructions: z.string().optional(),
    tools: z.array(z.unknown()).optional(),
    tool_choice: z.unknown().optional(),
    background: z.boolean().optional(),
    store: z.boolean().optional(),
});
