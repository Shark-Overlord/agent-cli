import {Box, Text} from "ink";

import type {Message} from "../types/message.js";

interface MessageListProps {
    messages: Message[];
}

function getMessageText(message: Message): string {
    if (typeof message.content === "string") {
        return message.content;
    }

    return message.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("");
}

export function MessageList({messages}: MessageListProps) {
    return messages.map((message, index) => {
        const text = getMessageText(message);

        if (!text) {
            return null;
        }

        return (
            <Box key={index} marginTop={1}>
                <Text color={message.role === "user" ? "green" : "white"}>
                    {message.role === "user" ? "> " : ""}
                    {text}
                </Text>
            </Box>
        );
    });
}
