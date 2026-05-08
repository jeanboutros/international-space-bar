import { WorkflowLoadContext, WorkflowModule, WorkflowRegistryEntry, WorkflowRunner } from "./interfaces/index.js";

import { WorkflowModuleLoaderSchema } from "./schemas/index.js";




export class LazyWorkflowRuntime {
    private readonly loadedWorkflows = new Map<string, Promise<WorkflowModule>>();

    constructor(private readonly registry: WorkflowRegistryEntry[], private readonly context: WorkflowLoadContext) { }


    private cacheWorkflow(id: string): Promise<WorkflowModule> {
        const workflowId = WorkflowModuleLoaderSchema.parse(id); // Validate workflow ID format

        // check if workflow is already loaded
        const loaded = this.loadedWorkflows.get(workflowId);
        if (loaded) return loaded;

        // find workflow in registry and load it
        const entry = this.registry.find(entry => entry.workflowId === workflowId);
        if (!entry) throw new Error(`Workflow with ID "${workflowId}" not found in registry`);

        // load the workflow module and cache it
        // do not await this before caching, to allow concurrent calls to the same workflow to share the same promise

        const pendingWorkflowModule = entry.load().then(({ default: module }) => module);
        this.loadedWorkflows.set(workflowId, pendingWorkflowModule);
        return pendingWorkflowModule;
    }
    async getWorkflowManifest(id: string) {
        const workflowModule = await this.cacheWorkflow(id);
        return workflowModule.manifest;
    }
    async getWorkflowModule(id: string): Promise<WorkflowModule> {
        return this.cacheWorkflow(id);
    }
    async runnerForModel(id: string): Promise<WorkflowRunner> {
        return (await this.getWorkflowModule(id)).createRunner(this.context);
    }

}
