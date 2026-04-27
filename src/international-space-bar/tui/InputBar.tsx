import React, { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";

interface InputBarProps {
    readonly isProcessing: boolean;
    readonly onSubmit: (query: string) => void;
}

export default function InputBar({ isProcessing, onSubmit }: InputBarProps) {
    const [value, setValue] = useState("");

    const handleSubmit = (input: string) => {
        const trimmed = input.trim();
        if (trimmed.length === 0) return;
        setValue("");
        onSubmit(trimmed);
    };

    return (
        <Box borderStyle="single" borderColor={isProcessing ? "yellow" : "cyan"} paddingX={1}>
            {isProcessing ? (
                <Text color="yellow">⏳ Agent is thinking…</Text>
            ) : (
                <>
                    <Text color="cyan" bold>
                        {"❯ "}
                    </Text>
                    <TextInput
                        value={value}
                        onChange={setValue}
                        onSubmit={handleSubmit}
                        placeholder="Type a message…"
                        focus={!isProcessing}
                    />
                </>
            )}
        </Box>
    );
}
