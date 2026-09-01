import type {Tool, ToolApiParam} from "./Tool.js";
import {fileReadTool} from "./fileReadTool.js";

const allTools: Tool[] = [fileReadTool];

export function getEnabledTools(): Tool[] {
    return allTools.filter((tool) => tool.isEnabled());
}

export function findToolByName(name: string): Tool | undefined {
    return allTools.find((tool) => tool.name === name);
}

export function getToolsApiParams(): ToolApiParam[] {
    return getEnabledTools().map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema
    }));
}
