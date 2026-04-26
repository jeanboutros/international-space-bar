import { z } from "zod";

export const AgentConfigSchema = z.object({
    version: z.number().int().positive(),
    display_name: z.string().min(1),
    short_description: z.string().min(1),
    default_prompt: z.string().min(1),
    model: z.string().min(1).optional(),
    tools: z.array(z.string()).optional().default([]),
    skills: z.array(z.string()).optional().default([]),
    subagents: z.array(z.string()).optional().default([]),
    interrupt_on: z.record(z.string(), z.boolean()).optional().default({}),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;
