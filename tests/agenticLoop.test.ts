import assert from "node:assert/strict";
import test from "node:test";

import {
    query,
    type AgentLoopDependencies,
    type LoopEvent,
    type LoopResult
} from "../src/core/agenticLoop.js";
import type {Tool} from "../src/tools/Tool.js";
import type {
    Message,
    StreamResult
} from "../src/types/message.js";

async function consume(
    generator: AsyncGenerator<LoopEvent, LoopResult>
): Promise<{events: LoopEvent[]; result: LoopResult}> {
    const events: LoopEvent[] = [];
    let next = await generator.next();

    while (!next.done) {
        events.push(next.value);
        next = await generator.next();
    }

    return {events, result: next.value};
}

function textResult(
    text: string,
    inputTokens: number,
    outputTokens: number
): StreamResult {
    return {
        assistantMessage: {
            role: "assistant",
            content: [{type: "text", text}]
        },
        usage: {inputTokens, outputTokens},
        stopReason: "end_turn"
    };
}

function toolResult(id: string): StreamResult {
    return {
        assistantMessage: {
            role: "assistant",
            content: [{
                type: "tool_use",
                id,
                name: "Read",
                input: {file_path: "package.json"}
            }]
        },
        usage: {inputTokens: 10, outputTokens: 2},
        stopReason: "tool_use"
    };
}

function fakeStream(
    results: StreamResult[]
): AgentLoopDependencies["streamMessage"] {
    let index = 0;

    return async function* () {
        const result = results[index++];
        if (!result) {
            throw new Error("No fake stream result configured.");
        }

        for (const block of result.assistantMessage.content) {
            if (block.type === "text") {
                yield {type: "text", text: block.text};
            }
        }

        yield {type: "message_done", result};
        return result;
    };
}

function createReadTool(): Tool {
    return {
        name: "Read",
        description: "Read a test file.",
        inputSchema: {type: "object"},
        async call() {
            return {content: "package contents"};
        },
        isReadOnly() {
            return true;
        },
        isEnabled() {
            return true;
        }
    };
}

const initialMessages: Message[] = [{role: "user", content: "hello"}];

test("completes after a model response without tool calls", async () => {
    const {events, result} = await consume(query(
        {messages: initialMessages, tools: []},
        {streamMessage: fakeStream([textResult("done", 5, 3)])}
    ));

    assert.equal(result.terminationReason, "completed");
    assert.equal(result.turnCount, 1);
    assert.deepEqual(result.usage, {inputTokens: 5, outputTokens: 3});
    assert.equal(result.messages.length, 2);
    assert.deepEqual(
        events.map((event) => event.type),
        ["text", "assistant_message", "turn_complete"]
    );
});

test("executes a tool and continues with its result", async () => {
    const {events, result} = await consume(query(
        {messages: initialMessages, tools: [createReadTool()]},
        {
            streamMessage: fakeStream([
                toolResult("tool-1"),
                textResult("package explained", 20, 4)
            ])
        }
    ));

    assert.equal(result.terminationReason, "completed");
    assert.equal(result.turnCount, 2);
    assert.deepEqual(result.usage, {inputTokens: 30, outputTokens: 6});
    assert.equal(result.messages.length, 4);

    const toolMessage = result.messages[2];
    assert.equal(toolMessage.role, "user");
    assert.ok(Array.isArray(toolMessage.content));
    assert.equal(toolMessage.content[0]?.type, "tool_result");

    assert.ok(events.some((event) => event.type === "tool_use_start"));
    assert.ok(events.some((event) => event.type === "tool_use_done"));
    assert.ok(events.some((event) => event.type === "tool_result_message"));
});

test("returns aborted before starting another model turn", async () => {
    const abort = new AbortController();
    abort.abort();

    const {events, result} = await consume(query({
        messages: initialMessages,
        tools: [],
        abortSignal: abort.signal
    }));

    assert.equal(result.terminationReason, "aborted");
    assert.equal(result.turnCount, 0);
    assert.equal(events.at(-1)?.type, "turn_complete");
});

test("stops when maxTurns is reached", async () => {
    const {events, result} = await consume(query(
        {
            messages: initialMessages,
            tools: [createReadTool()],
            maxTurns: 1
        },
        {streamMessage: fakeStream([toolResult("tool-1")])}
    ));

    assert.equal(result.terminationReason, "max_turns");
    assert.equal(result.turnCount, 1);
    assert.equal(result.messages.length, 3);
    assert.ok(events.some(
        (event) => event.type === "turn_complete" &&
            event.reason === "max_turns"
    ));
});

test("returns model_error when the model stream fails", async () => {
    const brokenStream: AgentLoopDependencies["streamMessage"] =
        async function* () {
            throw new Error("network unavailable");
        };

    const {events, result} = await consume(query(
        {messages: initialMessages, tools: []},
        {streamMessage: brokenStream}
    ));

    assert.equal(result.terminationReason, "model_error");
    assert.equal(result.turnCount, 1);
    assert.ok(events.some(
        (event) => event.type === "error" &&
            event.error.message === "network unavailable"
    ));
});
