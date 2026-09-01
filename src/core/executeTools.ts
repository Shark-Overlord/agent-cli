import type {
    ToolResultBlock,
    ToolUseBlock,
    UserMessage
} from "../types/message.js";
import type {ToolContext} from "../tools/Tool.js";
import {findToolByName} from "../tools/index.js";

async function executeOneTool(
    block: ToolUseBlock,
    context: ToolContext
): Promise<ToolResultBlock> {
    const tool = findToolByName(block.name);

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

    const result = await tool.call(block.input, context);

    return {
        type: "tool_result",
        tool_use_id: block.id,
        content: result.content,
        is_error: result.isError
    };
}

export async function executeTools(
    toolUseBlocks: ToolUseBlock[],
    context: ToolContext
): Promise<UserMessage> {
    const canRunInParallel = toolUseBlocks.every((block) => {
        const tool = findToolByName(block.name);
        return tool !== undefined && tool.isEnabled() && tool.isReadOnly();
    });

    let results: ToolResultBlock[];

    if (canRunInParallel) {
        results = await Promise.all(
            toolUseBlocks.map((block) => executeOneTool(block, context))
        );
    } else {
        results = [];
        for (const block of toolUseBlocks) {
            results.push(await executeOneTool(block, context));
        }
    }

    return {
        role: "user",
        content: results
    };
}
