import React from "react";
import { render } from "ink";
import type { AppContext } from "../interfaces/app-context.interface.js";
import type { IAgent, IWorkflowRunner } from "../interfaces/agent.interface.js";
import TuiApp from "./TuiApp.js";

export function renderTui(
    agent: IAgent,
    ctx: AppContext,
    threadId: string,
    workflow: IWorkflowRunner,
): void {
    render(<TuiApp agent={agent} ctx={ctx} threadId={threadId} workflow={workflow} />);
}
