import { z } from "zod";

export const WorkflowModuleLoaderSchema = z.stringFormat("workflow-id", /^[a-zA-Z0-9]+(-|_[a-zA-Z0-9]+)*$/);
