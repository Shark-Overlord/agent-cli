import {Box, Text} from "ink";

interface PromptInputProps {
    value: string;
}

export function PromptInput({value}: PromptInputProps) {
    return (
        <Box marginTop={1}>
            <Text color="green" bold>{"> "}</Text>
            <Text>{value}</Text>
            <Text color="gray">█</Text>
        </Box>
    );
}
