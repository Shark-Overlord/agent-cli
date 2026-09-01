import {
    executeTools as defaultExecuteTools
} from "./executeTools.js";
import {
    streamMessage as defaultStreamMessage
} from "../services/api/streaming.js";
import type {Tool, ToolApiParam, ToolContext} from "../tools/Tool.js";
import type {
    AssistantMessage,
    Message,
    StreamEvent,
    StreamResult,
    ToolResultBlock,
    ToolUseBlock,
    UserMessage
} from "../types/message.js";

export const DEFAULT_MAX_TURNS = 50;

export type LoopTerminationReason =
    | "completed"
    | "aborted"
    | "model_error"
    | "max_turns";

export interface LoopUsage {
    inputTokens: number;
    outputTokens: number;
}

export type LoopEvent =
    | {type: "text"; text: string}
    | {
        type: "tool_use_start";
        id: string;
        name: string;
        input: Record<string, unknown>;
    }
    | {
        type: "tool_use_done";
        id: string;
        name: string;
        result: string;
        isError: boolean;
    }
    | {type: "assistant_message"; message: AssistantMessage}
    | {type: "tool_result_message"; message: UserMessage}
    | {
        type: "turn_complete";
        turnCount: number;
        reason: LoopTerminationReason | "tool_use";
    }
    | {type: "error"; error: Error};

export interface LoopResult {
    messages: Message[];
    terminationReason: LoopTerminationReason;
    turnCount: number;
    usage: LoopUsage;
}

export interface QueryOptions {
    messages: Message[];
    tools: Tool[];
    systemPrompt?: string;
    maxTurns?: number;
    abortSignal?: AbortSignal;
    cwd?: string;
}

interface LoopState {
    messages: Message[];
    turnCount: number;
}

type StreamMessage = (
    messages: Message[],
    signal?: AbortSignal,
    systemPrompt?: string,
    tools?: ToolApiParam[]
) => AsyncGenerator<StreamEvent, StreamResult>;

type ExecuteTools = (
    toolUseBlocks: ToolUseBlock[],
    context: ToolContext,
    tools?: Tool[]
) => Promise<UserMessage>;

export interface AgentLoopDependencies {
    streamMessage: StreamMessage;
    executeTools: ExecuteTools;
}

function toToolApiParams(tools: Tool[]): ToolApiParam[] {
    return tools
        .filter((tool) => tool.isEnabled())
        .map((tool) => ({
            name: tool.name,
            description: tool.description,
            input_schema: tool.inputSchema
        }));
}

function getToolUseBlocks(message: AssistantMessage): ToolUseBlock[] {
    return message.content.filter(
        (block): block is ToolUseBlock => block.type === "tool_use"
    );
}

function getToolResultBlocks(message: UserMessage): ToolResultBlock[] {
    if (!Array.isArray(message.content)) {
        return [];
    }

    return message.content.filter(
        (block): block is ToolResultBlock => block.type === "tool_result"
    );
}

function unknownError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
}

export async function* query(
    options: QueryOptions,
    dependencies: Partial<AgentLoopDependencies> = {}
): AsyncGenerator<LoopEvent, LoopResult> {
    const maxTurns = options.maxTurns ?? DEFAULT_MAX_TURNS;
    if (!Number.isInteger(maxTurns) || maxTurns < 1) {
        throw new RangeError("maxTurns must be a positive integer.");
    }

    const streamMessage = dependencies.streamMessage ?? defaultStreamMessage;
    const executeTools = dependencies.executeTools ?? defaultExecuteTools;
    const state: LoopState = {
        messages: [...options.messages],
        turnCount: 0
    };
    const usage: LoopUsage = {
        inputTokens: 0,
        outputTokens: 0
    };
    const enabledTools = options.tools.filter((tool) => tool.isEnabled());

    const finish = (terminationReason: LoopTerminationReason): LoopResult => ({
        messages: state.messages,
        terminationReason,
        turnCount: state.turnCount,
        usage
    });

    while (state.turnCount < maxTurns) {
        if (options.abortSignal?.aborted) {
            yield {
                type: "turn_complete",
                turnCount: state.turnCount,
                reason: "aborted"
            };
            return finish("aborted");
        }

        state.turnCount++;
        let streamResult: StreamResult | null = null;

        try {
            const stream = streamMessage(
                state.messages,
                options.abortSignal,
                options.systemPrompt,
                toToolApiParams(enabledTools)
            );

            for await (const event of stream) {
                if (event.type === "text") {
                    yield {type: "text", text: event.text};
                } else if (event.type === "error") {
                    throw new Error(event.error);
                } else if (event.type === "message_done") {
                    streamResult = event.result;
                }
            }
        } catch (error: unknown) {
            if (options.abortSignal?.aborted) {
                yield {
                    type: "turn_complete",
                    turnCount: state.turnCount,
                    reason: "aborted"
                };
                return finish("aborted");
            }

            const modelError = unknownError(error);
            yield {type: "error", error: modelError};
            yield {
                type: "turn_complete",
                turnCount: state.turnCount,
                reason: "model_error"
            };
            return finish("model_error");
        }

        if (!streamResult) {
            const modelError = new Error(
                "Model stream ended without a completed message."
            );
            yield {type: "error", error: modelError};
            yield {
                type: "turn_complete",
                turnCount: state.turnCount,
                reason: "model_error"
            };
            return finish("model_error");
        }

        usage.inputTokens += streamResult.usage.inputTokens;
        usage.outputTokens += streamResult.usage.outputTokens;

        const assistantMessage = streamResult.assistantMessage;
        const toolUseBlocks = getToolUseBlocks(assistantMessage);

        if (streamResult.stopReason === "tool_use" && toolUseBlocks.length === 0) {
            const modelError = new Error(
                "Model stopped for tool_use, but no tool call was found."
            );
            yield {type: "error", error: modelError};
            yield {
                type: "turn_complete",
                turnCount: state.turnCount,
                reason: "model_error"
            };
            return finish("model_error");
        }

        state.messages.push(assistantMessage);
        yield {type: "assistant_message", message: assistantMessage};

        if (streamResult.stopReason !== "tool_use") {
            yield {
                type: "turn_complete",
                turnCount: state.turnCount,
                reason: "completed"
            };
            return finish("completed");
        }

        for (const block of toolUseBlocks) {
            yield {
                type: "tool_use_start",
                id: block.id,
                name: block.name,
                input: block.input
            };
        }

        let toolResultMessage: UserMessage;
        try {
            toolResultMessage = await executeTools(
                toolUseBlocks,
                {
                    cwd: options.cwd ?? process.cwd(),
                    abortSignal: options.abortSignal
                },
                enabledTools
            );
        } catch (error: unknown) {
            const executionError = unknownError(error);
            yield {type: "error", error: executionError};
            yield {
                type: "turn_complete",
                turnCount: state.turnCount,
                reason: options.abortSignal?.aborted
                    ? "aborted"
                    : "model_error"
            };
            return finish(
                options.abortSignal?.aborted ? "aborted" : "model_error"
            );
        }

        const toolResults = getToolResultBlocks(toolResultMessage);
        for (const block of toolUseBlocks) {
            const result = toolResults.find(
                (candidate) => candidate.tool_use_id === block.id
            );

            if (result) {
                yield {
                    type: "tool_use_done",
                    id: block.id,
                    name: block.name,
                    result: result.content,
                    isError: result.is_error ?? false
                };
            }
        }

        state.messages.push(toolResultMessage);
        yield {
            type: "tool_result_message",
            message: toolResultMessage
        };
        yield {
            type: "turn_complete",
            turnCount: state.turnCount,
            reason: "tool_use"
        };
    }

    yield {
        type: "turn_complete",
        turnCount: state.turnCount,
        reason: "max_turns"
    };
    return finish("max_turns");
}
