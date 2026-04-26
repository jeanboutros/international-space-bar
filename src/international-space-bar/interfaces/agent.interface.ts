import type { AppContext } from "./app-context.interface.js";

export interface AgentResult {
    readonly messages: unknown[];
    readonly lastContent: string;
}

export interface IAgent {
    readonly id: string;
    readonly displayName: string;
    invoke(query: string, ctx: AppContext): Promise<AgentResult>;
}
