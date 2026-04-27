import React from "react";
import { Box, Text, useInput } from "ink";
import type { InterruptInfo } from "../interfaces/agent.interface.js";

interface InterruptPromptProps {
    readonly interrupt: InterruptInfo;
    readonly onDecision: (decision: Record<string, unknown>) => void;
}

export default function InterruptPrompt({ interrupt, onDecision }: InterruptPromptProps) {
    useInput((input) => {
        if (input === "a") {
            onDecision({ type: "approve", toolName: interrupt.toolName });
        } else if (input === "r") {
            onDecision({ type: "reject", toolName: interrupt.toolName });
        }
    });

    return (
        <Box
            flexDirection="column"
            borderStyle="double"
            borderColor="red"
            paddingX={1}
            paddingY={0}
        >
            <Text bold color="red">
                ⚠ Tool Approval Required
            </Text>
            <Box marginTop={1}>
                <Text bold>Tool: </Text>
                <Text color="yellow">{interrupt.toolName}</Text>
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
                <Text color="green" bold>
                    [a]
                </Text>
                <Text> approve </Text>
                <Text color="red" bold>
                    [r]
                </Text>
                <Text> reject</Text>
            </Box>
        </Box>
    );
}
