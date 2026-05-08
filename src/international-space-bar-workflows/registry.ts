import type { WorkflowRegistryEntry } from "./interfaces/index.js";

const workflowRegistryEntries: WorkflowRegistryEntry[] = [{
    workflowId: "simple",
    load: () => import(`./simple/index.js`),
},
];

export default workflowRegistryEntries;