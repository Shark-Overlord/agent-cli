import type {
    AssistantMessage,
    ContentBlock,
    Message,
    StreamEvent,
    StreamResult,
    TextBlock,
    ToolUseBlock
} from "../../types/message.js";
import type {ToolApiParam} from "../../tools/Tool.js";
import {
    DEFAULT_MAX_TOKENS,
    getClient,
    getModel
} from "./client.js";

export async function* streamMessage(
    messages: Message[],
    signal?: AbortSignal,
    systemPrompt?: string,
    tools: ToolApiParam[] = [] //新增
): AsyncGenerator<StreamEvent, StreamResult> {
    const client = getClient();

    const request = {
        model: getModel(),
        max_tokens: DEFAULT_MAX_TOKENS,
        system:
            systemPrompt ||
            "You are a helpful coding assistant. Use tools when needed.",
        messages: messages.map((message) => ({
            role: message.role,
            content: message.content
        })),
        ...(tools.length > 0 ? {tools} : {})
    } as Parameters<typeof client.messages.stream>[0];

    const stream = client.messages.stream(request, {signal});

    const contentBlocks: ContentBlock[] = [];
    let currentText = "";
    let currentToolId = "";
    let currentToolName = "";
    let currentToolInput = "";
    let usage = {
        inputTokens: 0,
        outputTokens: 0
    };
    let stopReason = "end_turn";

    yield {type: "message_start"};

    for await (const event of stream) {
        switch (event.type) {
            case "content_block_start": {
                if (event.content_block.type === "text") {
                    currentText = "";
                } else if (event.content_block.type === "tool_use") {
                    currentToolId = event.content_block.id;
                    currentToolName = event.content_block.name;
                    currentToolInput = "";

                    yield {
                        type: "tool_use_start",
                        id: currentToolId,
                        name: currentToolName
                    };
                }
                break;
            }

            case "content_block_delta": {
                if (event.delta.type === "text_delta") {
                    currentText += event.delta.text;
                    yield {
                        type: "text",
                        text: event.delta.text
                    };
                } else if (event.delta.type === "input_json_delta") {
                    currentToolInput += event.delta.partial_json;
                    yield {
                        type: "tool_use_input",
                        delta: event.delta.partial_json
                    };
                }
                break;
            }

            case "content_block_stop": {
                if (currentText) {
                    contentBlocks.push({
                        type: "text",
                        text: currentText
                    } as TextBlock);
                    currentText = "";
                }

                if (currentToolName) {
                    let input: Record<string, unknown> = {};
                    try {
                        input = currentToolInput ? JSON.parse(currentToolInput) : {};
                    } catch {
                        input = {};
                    }

                    contentBlocks.push({
                        type: "tool_use",
                        id: currentToolId,
                        name: currentToolName,
                        input
                    } as ToolUseBlock);

                    currentToolId = "";
                    currentToolName = "";
                    currentToolInput = "";
                }
                break;
            }

            case "message_delta": {
                if (event.delta.stop_reason) {
                    stopReason = event.delta.stop_reason;
                }
                if (event.usage) {
                    usage.outputTokens = event.usage.output_tokens;
                }
                break;
            }

            case "message_start": {
                if (event.message?.usage) {
                    usage.inputTokens = event.message.usage.input_tokens;
                }
                break;
            }
        }
    }

    const assistantMessage: AssistantMessage = {
        role: "assistant",
        content: contentBlocks
    };

    const streamResult: StreamResult = {
        assistantMessage,
        usage,
        stopReason
    };

    yield {
        type: "message_done",
        result: streamResult
    };

    return streamResult;
}
