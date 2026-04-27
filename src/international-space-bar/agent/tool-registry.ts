import type { StructuredTool } from "@langchain/core/tools";

import { getWeather, TOOL_INSTRUCTION as WEATHER_INSTRUCTION } from "../tool/weather.js";
import { TOOL_INSTRUCTION as WEB_FETCH_INSTRUCTION, webFetch } from "../tool/web-fetch.js";

export interface ToolEntry {
    readonly tool: StructuredTool;
    readonly instruction: string;
}

const registry = new Map<string, ToolEntry>([
    ["get_weather", { tool: getWeather, instruction: WEATHER_INSTRUCTION }],
    ["web_fetch", { tool: webFetch, instruction: WEB_FETCH_INSTRUCTION }],
]);

export function getToolEntry(id: string): ToolEntry {
    const entry = registry.get(id);
    if (!entry) {
        throw new Error(
            `Unknown tool ID: "${id}". Registered tools: ${[...registry.keys()].join(", ")}`,
        );
    }
    return entry;
}

export function getAllToolIds(): string[] {
    return [...registry.keys()];
}
