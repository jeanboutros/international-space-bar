import React from "react";
import { Box, Text } from "ink";
import type { TokenUsage } from "../interfaces/agent.interface.js";

interface StatusPaneProps {
    readonly agentName: string;
    readonly isProcessing: boolean;
    readonly messageCount: number;
    readonly tokenUsage: TokenUsage | null;
    readonly threadId: string;
}

export default function StatusPane({
    agentName,
    isProcessing,
    messageCount,
    tokenUsage,
    threadId,
}: StatusPaneProps) {
    return (
        <Box flexDirection="column" paddingX={1}>
            <Text bold color="white">
                Status
            </Text>
            <Box marginTop={1}>
                <Text dimColor>Agent: </Text>
                <Text color="cyan">{agentName}</Text>
            </Box>
            <Box>
                <Text dimColor>State: </Text>
                <Text color={isProcessing ? "yellow" : "green"}>
                    {isProcessing ? "⏳ Processing" : "● Idle"}
                </Text>
            </Box>
            <Box>
                <Text dimColor>Messages: </Text>
                <Text>{messageCount}</Text>
            </Box>
            <Box>
                <Text dimColor>Thread: </Text>
                <Text>{threadId.slice(0, 8)}</Text>
            </Box>

            <Box marginTop={1}>
                <Text bold color="white">
                    Token Usage
                </Text>
            </Box>
            {tokenUsage ? (
                <>
                    <Box>
                        <Text dimColor>In: </Text>
                        <Text>{tokenUsage.inputTokens.toLocaleString()}</Text>
                    </Box>
                    <Box>
                        <Text dimColor>Out: </Text>
                        <Text>{tokenUsage.outputTokens.toLocaleString()}</Text>
                    </Box>
                    <Box>
                        <Text dimColor>Total: </Text>
                        <Text bold>{tokenUsage.totalTokens.toLocaleString()}</Text>
                    </Box>
                </>
            ) : (
                <Text dimColor>No usage data yet</Text>
            )}
        </Box>
    );
}
