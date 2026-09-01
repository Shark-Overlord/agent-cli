import {Box, Text} from "ink";

import type {AgentUsage} from "../hooks/useAgentSession.js";
import {Spinner} from "./Spinner.js";

interface AgentStatusProps {
    isLoading: boolean;
    streamingText: string;
    toolStatus: string;
    errorText: string;
    usage: AgentUsage | null;
}

export function AgentStatus({
    isLoading,
    streamingText,
    toolStatus,
    errorText,
    usage
}: AgentStatusProps) {
    return (
        <>
            {isLoading && !streamingText && !toolStatus && (
                <Box marginTop={1}>
                    <Spinner/>
                </Box>
            )}

            {toolStatus && (
                <Box marginTop={1}>
                    <Text color="yellow">{toolStatus}</Text>
                </Box>
            )}

            {streamingText && (
                <Box marginTop={1}>
                    <Text>{streamingText}</Text>
                </Box>
            )}

            {usage && (
                <Box marginTop={1}>
                    <Text dimColor>
                        Tokens: {usage.in} in / {usage.out} out
                    </Text>
                </Box>
            )}

            {errorText && (
                <Box marginTop={1}>
                    <Text color="red">{errorText}</Text>
                </Box>
            )}
        </>
    );
}
