import React, { useCallback, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { colors, layout } from "./theme.js";

interface InputBarProps {
    readonly isProcessing: boolean;
    readonly onSubmit: (query: string) => void;
}

export default function InputBar({ isProcessing, onSubmit }: InputBarProps) {
    const [value, setValue] = useState("");
    const historyRef = useRef<string[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);

    const handleSubmit = useCallback(
        (input: string) => {
            const trimmed = input.trim();
            if (trimmed.length === 0) return;
            historyRef.current.push(trimmed);
            setHistoryIndex(-1);
            setValue("");
            onSubmit(trimmed);
        },
        [onSubmit],
    );

    useInput((_input, key) => {
        if (isProcessing) return;

        // Shift+C → clear input
        if (_input === "C" && key.shift) {
            setValue("");
            setHistoryIndex(-1);
            return;
        }

        // Ctrl+Up → navigate history backwards (only when input is empty or already browsing)
        if (key.ctrl && key.upArrow) {
            if (historyRef.current.length === 0) return;
            if (value.length > 0 && historyIndex < 0) return;
            const nextIdx =
                historyIndex === -1
                    ? historyRef.current.length - 1
                    : Math.max(0, historyIndex - 1);
            setHistoryIndex(nextIdx);
            setValue(historyRef.current[nextIdx]!);
            return;
        }

        // Ctrl+Down → navigate history forwards
        if (key.ctrl && key.downArrow && historyIndex >= 0) {
            const nextIdx = historyIndex + 1;
            if (nextIdx >= historyRef.current.length) {
                setHistoryIndex(-1);
                setValue("");
            } else {
                setHistoryIndex(nextIdx);
                setValue(historyRef.current[nextIdx]!);
            }
        }
    });

    return (
        <Box borderStyle="single" borderColor={isProcessing ? colors.borderBusy : colors.borderActive} paddingX={layout.panePaddingX}>
            {isProcessing ? (
                <Text color={colors.warning}>⏳ Agent is thinking…</Text>
            ) : (
                <>
                    <Text color={colors.accent} bold>
                        {"❯ "}
                    </Text>
                    <TextInput
                        value={value}
                        onChange={setValue}
                        onSubmit={handleSubmit}
                        placeholder="Enter your message. Shift+C clear · Ctrl+↑↓ history"
                        focus={!isProcessing}
                    />
                </>
            )}
        </Box>
    );
}
