import type {
    ToolResultBlock,
    ToolUseBlock,
    UserMessage
} from "../types/message.js";
import type {Tool, ToolContext} from "../tools/Tool.js";
import {getEnabledTools} from "../tools/index.js";

async function executeOneTool(
    block: ToolUseBlock,
    context: ToolContext,
    tools: Tool[]
): Promise<ToolResultBlock> {
    const tool = tools.find((candidate) => candidate.name === block.name);

    if (!tool) {
        return {
            type: "tool_result",
            tool_use_id: block.id,
            content: `Unknown tool: ${block.name}`,
            is_error: true
        };
    }

    if (!tool.isEnabled()) {
        return {
            type: "tool_result",
            tool_use_id: block.id,
            content: `Tool is disabled: ${block.name}`,
            is_error: true
        };
    }

    try {
        const result = await tool.call(block.input, context);

        return {
            type: "tool_result",
            tool_use_id: block.id,
            content: result.content,
            is_error: result.isError
        };
    } catch (error: unknown) {
        const message = error instanceof Error
            ? error.message
            : String(error);

        return {
            type: "tool_result",
            tool_use_id: block.id,
            content: `Tool failed: ${message}`,
            is_error: true
        };
    }
}

export async function executeTools(
    toolUseBlocks: ToolUseBlock[],
    context: ToolContext,
    tools: Tool[] = getEnabledTools()
): Promise<UserMessage> {
    const canRunInParallel = toolUseBlocks.every((block) => {
        const tool = tools.find((candidate) => candidate.name === block.name);
        return tool !== undefined && tool.isEnabled() && tool.isReadOnly();
    });

    let results: ToolResultBlock[];

    if (canRunInParallel) {
        results = await Promise.all(
            toolUseBlocks.map((block) => executeOneTool(block, context, tools))
        );
    } else {
        results = [];
        for (const block of toolUseBlocks) {
            results.push(await executeOneTool(block, context, tools));
        }
    }

    return {
        role: "user",
        content: results
    };
}
