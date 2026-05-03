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

// Fixed height: "Status" heading + 6 data rows (Agent, State, Messages, Thread,
// Iteration, Quality) + "Token Usage" heading + 3 token rows = 11 rows.
// Every row always renders at height=1 (hidden rows show a space) so the
// sidebar never jumps when data appears or disappears.
const STATUS_PANE_HEIGHT = 11;

/**
 * Padded row — always renders exactly one line to prevent height shifts.
 * Fills with a dim placeholder when the value is hidden.
 */
function StatusRow({
    label,
    children,
    visible = true,
}: {
    readonly label: string;
    readonly children: React.ReactNode;
    readonly visible?: boolean;
}) {
    return (
        <Box height={1}>
            {visible ? (
                <>
                    <Text color={colors.muted}>{label}: </Text>
                    {children}
                </>
            ) : (
                <Text> </Text>
            )}
        </Box>
    );
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
        <Box flexDirection="column" paddingX={layout.panePaddingX} height={STATUS_PANE_HEIGHT}>
            <Box height={1}>
                <Text bold color={colors.heading}>
                    Status
                </Text>
            </Box>
            <StatusRow label="Agent">
                <Text color={colors.accent}>{agentName}</Text>
            </StatusRow>
            <StatusRow label="State">
                <Text color={isProcessing ? colors.warning : colors.success}>
                    {isProcessing ? "⏳ Processing" : "● Idle"}
                </Text>
            </StatusRow>
            <StatusRow label="Messages">
                <Text>{messageCount}</Text>
            </StatusRow>
            <StatusRow label="Thread">
                <Text>{threadId.slice(0, 8)}</Text>
            </StatusRow>
            <StatusRow
                label="Iteration"
                visible={currentIteration !== undefined && currentIteration > 0}
            >
                <Text color={colors.accent}>{currentIteration ?? 0}</Text>
            </StatusRow>
            <StatusRow
                label="Quality"
                visible={satisfactionScore !== null && satisfactionScore !== undefined}
            >
                <Text color={(satisfactionScore ?? 0) >= 0.7 ? colors.success : colors.warning}>
                    {satisfactionScore !== null && satisfactionScore !== undefined
                        ? `${(satisfactionScore * 100).toFixed(0)}%`
                        : "—"}
                </Text>
            </StatusRow>
            <Box height={1}>
                <Text bold color={colors.heading}>
                    Token Usage
                </Text>
            </Box>
            {tokenUsage ? (
                <>
                    <StatusRow label="In">
                        <Text>{tokenUsage.inputTokens.toLocaleString()}</Text>
                    </StatusRow>
                    <StatusRow label="Out">
                        <Text>{tokenUsage.outputTokens.toLocaleString()}</Text>
                    </StatusRow>
                    <StatusRow label="Total">
                        <Text bold>{tokenUsage.totalTokens.toLocaleString()}</Text>
                    </StatusRow>
                </>
            ) : (
                <>
                    <StatusRow label="In" visible={false} />
                    <StatusRow label="Out" visible={false} />
                    <StatusRow label="Total" visible={false} />
                </>
            )}
        </Box>
    );
}
