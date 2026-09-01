import {useRef, useState} from "react";

import {executeTools} from "../core/executeTools.js";
import {streamMessage} from "../services/api/streaming.js";
import {getToolsApiParams} from "../tools/index.js";
import type {
    Message,
    StreamResult,
    ToolUseBlock,
    UserMessage
} from "../types/message.js";

export interface AgentUsage {
    in: number;
    out: number;
}

export function useAgentSession() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [streamingText, setStreamingText] = useState("");
    const [toolStatus, setToolStatus] = useState("");
    const [errorText, setErrorText] = useState("");
    const [lastUsage, setLastUsage] = useState<AgentUsage | null>(null);

    const messagesRef = useRef<Message[]>(messages);
    const abortRef = useRef<AbortController | null>(null);

    function appendMessage(message: Message) {
        const nextMessages = [...messagesRef.current, message];
        messagesRef.current = nextMessages;
        setMessages(nextMessages);
    }

    async function runModelRound(
        abort: AbortController
    ): Promise<StreamResult | null> {
        let fullText = "";
        let streamResult: StreamResult | null = null;

        for await (const event of streamMessage(
            messagesRef.current,
            abort.signal,
            undefined,
            getToolsApiParams()
        )) {
            if (event.type === "text") {
                fullText += event.text;
                setStreamingText(fullText);
            } else if (event.type === "tool_use_start") {
                setToolStatus(`Tool: ${event.name}`);
            } else if (event.type === "message_done") {
                streamResult = event.result;
                setLastUsage({
                    in: event.result.usage.inputTokens,
                    out: event.result.usage.outputTokens
                });
            }
        }

        return streamResult;
    }

    async function runAgentLoop() {
        setIsLoading(true);
        setStreamingText("");
        setToolStatus("");
        setErrorText("");
        setLastUsage(null);

        const abort = new AbortController();
        abortRef.current = abort;

        try {
            while (true) {
                setStreamingText("");
                setToolStatus("");

                const streamResult = await runModelRound(abort);

                if (!streamResult) {
                    return;
                }

                appendMessage(streamResult.assistantMessage);
                setStreamingText("");

                if (streamResult.stopReason !== "tool_use") {
                    break;
                }

                const toolUseBlocks = streamResult.assistantMessage.content.filter(
                    (block): block is ToolUseBlock => block.type === "tool_use"
                );

                if (toolUseBlocks.length === 0) {
                    throw new Error(
                        "Model stopped for tool_use, but no tool call was found."
                    );
                }

                setToolStatus(
                    toolUseBlocks
                        .map((block) => `Running ${block.name}`)
                        .join(", ")
                );

                const toolResultMessage = await executeTools(toolUseBlocks, {
                    cwd: process.cwd(),
                    abortSignal: abort.signal
                });

                appendMessage(toolResultMessage);
                setToolStatus("");
            }
        } catch (err: unknown) {
            if (abort.signal.aborted) {
                setStreamingText("");
                setToolStatus("");
                setErrorText("Generation interrupted.");
                return;
            }

            setErrorText(
                err instanceof Error
                    ? err.message
                    : "Unknown error"
            );
        } finally {
            setIsLoading(false);
            abortRef.current = null;
            setToolStatus("");
        }
    }

    async function submit(text: string) {
        const userMessage: UserMessage = {
            role: "user",
            content: text
        };

        appendMessage(userMessage);
        await runAgentLoop();
    }

    function abort(): boolean {
        if (!abortRef.current) {
            return false;
        }

        abortRef.current.abort();
        return true;
    }

    return {
        messages,
        isLoading,
        streamingText,
        toolStatus,
        errorText,
        lastUsage,
        submit,
        abort
    };
}
