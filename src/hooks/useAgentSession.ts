import {useRef, useState} from "react";

import {
    DEFAULT_MAX_TURNS,
    query,
    type LoopEvent,
    type LoopResult
} from "../core/agenticLoop.js";
import {getEnabledTools} from "../tools/index.js";
import type {Message, UserMessage} from "../types/message.js";

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

    function handleLoopEvent(event: LoopEvent) {
        switch (event.type) {
            case "text":
                setStreamingText((previous) => previous + event.text);
                break;

            case "assistant_message":
                appendMessage(event.message);
                setStreamingText("");
                break;

            case "tool_use_start":
                setToolStatus(`Running ${event.name}`);
                break;

            case "tool_use_done":
                if (event.isError) {
                    setToolStatus(`${event.name} failed`);
                }
                break;

            case "tool_result_message":
                appendMessage(event.message);
                setToolStatus("");
                break;

            case "error":
                setErrorText(event.error.message);
                break;

            case "turn_complete":
                if (event.reason === "tool_use") {
                    setStreamingText("");
                    setToolStatus("");
                }
                break;
        }
    }

    function applyLoopResult(result: LoopResult) {
        messagesRef.current = result.messages;
        setMessages(result.messages);
        setLastUsage({
            in: result.usage.inputTokens,
            out: result.usage.outputTokens
        });

        if (result.terminationReason === "aborted") {
            setStreamingText("");
            setToolStatus("");
            setErrorText("Generation interrupted.");
        } else if (result.terminationReason === "model_error") {
            setStreamingText("");
            setToolStatus("");
        } else if (result.terminationReason === "max_turns") {
            setErrorText(
                `Agent stopped after reaching ${result.turnCount} turns.`
            );
        }
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
            const generator = query({
                messages: messagesRef.current,
                tools: getEnabledTools(),
                maxTurns: DEFAULT_MAX_TURNS,
                abortSignal: abort.signal,
                cwd: process.cwd()
            });

            let next = await generator.next();
            while (!next.done) {
                handleLoopEvent(next.value);
                next = await generator.next();
            }

            applyLoopResult(next.value);
        } catch (error: unknown) {
            if (abort.signal.aborted) {
                setStreamingText("");
                setToolStatus("");
                setErrorText("Generation interrupted.");
                return;
            }

            setErrorText(
                error instanceof Error ? error.message : "Unknown error"
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
