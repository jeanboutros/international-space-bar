import React, { useCallback, useEffect, useRef, useState } from "react";
import { Box, Text, useBoxMetrics, useInput, type DOMElement } from "ink";
import type { RefObject } from "react";
import { colors, layout, roleColors, roleLabels } from "./theme.js";
import { useMouseScroll } from "./use-mouse-scroll.js";

export interface ChatMessage {
    readonly role: "user" | "agent" | "system";
    readonly content: string;
}

interface MessageListProps {
    readonly messages: readonly ChatMessage[];
}

// Each message occupies at least 1 line + the gap below it.
// We estimate rendered lines per message as ceil(content.length / width) but
// for the viewport window we use a simpler "message count" approach and let
// Ink's overflow="hidden" crop anything that doesn't fit. The scroll offset
// works in message units so the user scrolls message-by-message.

export default function MessageList({ messages }: MessageListProps) {
    const containerRef = useRef<DOMElement>(null) as RefObject<DOMElement>;
    const { height: boxHeight } = useBoxMetrics(containerRef);

    // Rough estimate: each message ≈ 1 line + gap. Reserve 0 chrome rows.
    const approxVisible = Math.max(1, Math.floor(boxHeight / (1 + layout.messageGap)));

    const [scrollOffset, setScrollOffset] = useState(0); // 0 = pinned to bottom
    const [autoScroll, setAutoScroll] = useState(true);

    // Auto-scroll when new messages arrive
    useEffect(() => {
        if (autoScroll) setScrollOffset(0);
    }, [messages.length, autoScroll]);

    const maxOffset = Math.max(0, messages.length - approxVisible);

    const scrollUp = useCallback(() => {
        setAutoScroll(false);
        setScrollOffset((prev) => Math.min(prev + 1, maxOffset));
    }, [maxOffset]);

    const scrollDown = useCallback(() => {
        setScrollOffset((prev) => {
            const next = Math.max(prev - 1, 0);
            if (next === 0) setAutoScroll(true);
            return next;
        });
    }, []);

    // Keyboard: PageUp / PageDown
    useInput((_input, key) => {
        if (key.pageUp) scrollUp();
        else if (key.pageDown) scrollDown();
    });

    // Mouse wheel
    useMouseScroll(
        useCallback(
            (dir) => {
                if (dir === 1) scrollUp();
                else scrollDown();
            },
            [scrollUp, scrollDown],
        ),
    );

    // Compute visible slice (from the end, offset by scrollOffset)
    const endIdx = messages.length - scrollOffset;
    const startIdx = Math.max(0, endIdx - approxVisible);
    const visible = messages.slice(startIdx, endIdx);

    const scrollIndicator =
        scrollOffset > 0
            ? ` ↑${scrollOffset}`
            : messages.length > approxVisible
              ? " ●"
              : "";

    return (
        <Box
            ref={containerRef}
            flexDirection="column"
            flexGrow={1}
            overflow="hidden"
            paddingX={layout.messagePaddingX}
        >
            {scrollIndicator ? (
                <Text dimColor>
                    Messages{scrollIndicator}
                    <Text dimColor> (PgUp/PgDn or mouse wheel)</Text>
                </Text>
            ) : null}
            {visible.map((msg, i) => (
                <Box key={startIdx + i} flexDirection="column" marginBottom={layout.messageGap}>
                    <Box>
                        <Text color={roleColors[msg.role]} bold>
                            {roleLabels[msg.role]}:{" "}
                        </Text>
                        <Text wrap="wrap">{msg.content}</Text>
                    </Box>
                </Box>
            ))}
        </Box>
    );
}
