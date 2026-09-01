import {Box, Text} from "ink";

import {AgentStatus} from "./components/AgentStatus.js";
import {MessageList} from "./components/MessageList.js";
import {PromptInput} from "./components/PromptInput.js";
import {useAgentSession} from "./hooks/useAgentSession.js";
import {useCliInput} from "./hooks/useCliInput.js";

export function App() {
    const agent = useAgentSession();
    const input = useCliInput({
        isLoading: agent.isLoading,
        onSubmit: agent.submit,
        onAbort: agent.abort
    });

    return (
        <Box flexDirection="column" padding={1}>
            <Text bold color="cyan">Ownai CLI</Text>

            <MessageList messages={agent.messages}/>

            <AgentStatus
                isLoading={agent.isLoading}
                streamingText={agent.streamingText}
                toolStatus={agent.toolStatus}
                errorText={agent.errorText}
                usage={agent.lastUsage}
            />

            {!agent.isLoading && (
                <PromptInput value={input.value}/>
            )}
        </Box>
    );
}
