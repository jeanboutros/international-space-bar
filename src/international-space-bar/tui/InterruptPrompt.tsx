import React from "react";
import { Box, Text, useInput } from "ink";
import type { InterruptInfo } from "../interfaces/agent.interface.js";
import { borders, colors, layout } from "./theme.js";

interface InterruptPromptProps {
    readonly interrupt: InterruptInfo;
    readonly onDecision: (decision: Record<string, unknown>) => void;
}

export default function InterruptPrompt({ interrupt, onDecision }: InterruptPromptProps) {
    useInput((input) => {
        if (input === "a") {
            onDecision({ type: "approve" });
        } else if (input === "r") {
            onDecision({ type: "reject" });
        }
    });

    return (
        <Box
            flexDirection="column"
            borderStyle={borders.prominent}
            borderColor={colors.borderDanger}
            paddingX={layout.panePaddingX}
            paddingY={0}
        >
            <Text bold color={colors.danger}>
                ⚠ Tool Approval Required
            </Text>
            <Box marginTop={1}>
                <Text bold>Tool: </Text>
                <Text color={colors.warning}>{interrupt.toolName}</Text>
            </Box>
            <Box>
                <Text bold>Args: </Text>
                <Text>{JSON.stringify(interrupt.args, null, 2)}</Text>
            </Box>
            {interrupt.description ? (
                <Box>
                    <Text dimColor>{interrupt.description}</Text>
                </Box>
            ) : null}
            <Box marginTop={1}>
                <Text color={colors.success} bold>
                    [a]
                </Text>
                <Text> approve </Text>
                <Text color={colors.danger} bold>
                    [r]
                </Text>
                <Text> reject</Text>
            </Box>
        </Box>
    );
}
