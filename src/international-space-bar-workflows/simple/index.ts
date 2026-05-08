import { SimpleWorkflowModule } from "./workflow.js";

// Export an instance, not the class — LazyWorkflowRuntime calls .createRunner() on this value.
export default new SimpleWorkflowModule();