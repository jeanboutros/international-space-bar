import { MemorySaver } from "@langchain/langgraph";
import { FilesystemBackend } from "deepagents";

import type { IConfig } from "../interfaces/config.interface.js";

// TODO: this should change and should be injected at the application entry point based on the environment.
// dev should use these defaults, prod should use something more robust and scalable such as Postgres.
let backend: FilesystemBackend | undefined;
let checkpointer: MemorySaver | undefined;

export function createSharedBackend(_config: IConfig): FilesystemBackend {
    backend ??= new FilesystemBackend({ rootDir: process.cwd() });
    return backend;
}

export function createSharedCheckpointer(): MemorySaver {
    checkpointer ??= new MemorySaver();
    return checkpointer;
}
