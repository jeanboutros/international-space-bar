import React from "react";
import { Box, Text } from "ink";
import type { TokenUsage } from "../interfaces/agent.interface.js";
import { colors, layout } from "./theme.js";

interface StatusPaneProps {
    readonly agentName: string;
    readonly isProcessing: boolean;
    readonly messageCount: number;
    readonly tokenUsage: TokenUsage | null;
    readonly threadId: string;
    readonly currentIteration?: number;
    readonly satisfactionScore?: number | null;
}

export default function StatusPane({
    agentName,
    isProcessing,
    messageCount,
    tokenUsage,
    threadId,
    currentIteration,
    satisfactionScore,
}: StatusPaneProps) {
    return (
        <Box flexDirection="column" paddingX={layout.panePaddingX}>
            <Text bold color={colors.heading}>
                Status
            </Text>
            <Box marginTop={1}>
                <Text dimColor>Agent: </Text>
                <Text color={colors.accent}>{agentName}</Text>
            </Box>
            <Box>
                <Text dimColor>State: </Text>
                <Text color={isProcessing ? colors.warning : colors.success}>
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
            {currentIteration !== undefined && currentIteration > 0 ? (
                <Box>
                    <Text dimColor>Iteration: </Text>
                    <Text color={colors.accent}>{currentIteration}</Text>
                </Box>
            ) : null}
            {satisfactionScore !== null && satisfactionScore !== undefined ? (
                <Box>
                    <Text dimColor>Quality: </Text>
                    <Text color={satisfactionScore >= 0.7 ? colors.success : colors.warning}>
                        {(satisfactionScore * 100).toFixed(0)}%
                    </Text>
                </Box>
            ) : null}

            <Box marginTop={1}>
                <Text bold color={colors.heading}>
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