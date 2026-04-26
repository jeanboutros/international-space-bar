import { MemorySaver } from "@langchain/langgraph";
import { FilesystemBackend } from "deepagents";

import type { IConfig } from "../interfaces/config.interface.js";

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
