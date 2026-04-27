import React from "react";
import { Box, Text } from "ink";

export interface ChatMessage {
    readonly role: "user" | "agent" | "system";
    readonly content: string;
}

interface MessageListProps {
    readonly messages: readonly ChatMessage[];
}

const ROLE_COLORS: Record<ChatMessage["role"], string> = {
    user: "cyan",
    agent: "green",
    system: "yellow",
};

const ROLE_LABELS: Record<ChatMessage["role"], string> = {
    user: "You",
    agent: "Agent",
    system: "System",
};

export default function MessageList({ messages }: MessageListProps) {
    return (
        <Box flexDirection="column" flexGrow={1} overflow="hidden">
            {messages.map((msg, i) => (
                <Box key={i} marginBottom={0}>
                    <Text color={ROLE_COLORS[msg.role]} bold>
                        {ROLE_LABELS[msg.role]}:{" "}
                    </Text>
                    <Text wrap="wrap">{msg.content}</Text>
                </Box>
            ))}
        </Box>
    );
}
