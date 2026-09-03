import type {Tool, ToolApiParam} from "./Tool.js";
import {bashTool} from "./bashTool.js";
import {fileEditTool} from "./fileEditTool.js";
import {fileReadTool} from "./fileReadTool.js";
import {fileWriteTool} from "./fileWriteTool.js";
import {globTool} from "./globTool.js";
import {grepTool} from "./grepTool.js";

const allTools: Tool[] = [
    fileReadTool,
    fileWriteTool,
    fileEditTool,
    bashTool,
    grepTool,
    globTool
];

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
