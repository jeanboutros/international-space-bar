import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useBoxMetrics, useInput, type DOMElement } from "ink";
import type { RefObject } from "react";
import { useWindowSize } from "ink";
import type { ChatMessage } from "./store.js";
import { colors, layout, roleColors, roleLabels, scrollbarChar } from "./theme.js";
import { useMouseScroll } from "./use-mouse-scroll.js";

interface MessageListProps {
    readonly messages: readonly ChatMessage[];
}

/**
 * Estimate the rendered line count for a single message.
 *
 * Each message has a role label prefix (e.g. "You: ", "Agent: ") plus the
 * wrapped content. We account for both the prefix width and the gap below.
 */
function estimateLines(content: string, availableWidth: number): number {
    if (availableWidth <= 0) return 1;
    const wrapped = Math.max(1, Math.ceil(content.length / availableWidth));
    return wrapped + layout.messageGap;
}

export default function MessageList({ messages }: MessageListProps) {
    const containerRef = useRef<DOMElement>(null) as RefObject<DOMElement>;
    const { height: boxHeight, hasMeasured } = useBoxMetrics(containerRef);
    const { columns } = useWindowSize();

    // Usable width inside the box (subtract padding on both sides + scrollbar column)
    const usableWidth = Math.max(
        1,
        columns - 2 * layout.messagePaddingX - layout.scrollbarWidth - 10,
    );

    // Sum estimated lines per message to get a line-based viewport
    const totalLines = messages.reduce(
        (sum, msg) => sum + estimateLines(msg.content, usableWidth),
        0,
    );
    // 1 row for the "Messages" header
    const visibleLines = hasMeasured ? Math.max(1, boxHeight - 1) : 0;

    const [scrollOffset, setScrollOffset] = useState(0); // 0 = pinned to bottom
    const [autoScroll, setAutoScroll] = useState(true);

    // Auto-scroll when new messages arrive
    useEffect(() => {
        if (autoScroll) setScrollOffset(0);
    }, [messages.length, autoScroll]);

    const maxOffset = Math.max(0, totalLines - visibleLines);

    const scrollUp = useCallback(() => {
        setAutoScroll(false);
        setScrollOffset((prev) => Math.min(prev + 3, maxOffset)); // scroll 3 lines at a time
    }, [maxOffset]);

    const scrollDown = useCallback(() => {
        setScrollOffset((prev) => {
            const next = Math.max(prev - 3, 0);
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

    // Build visible slice by accumulating lines from the end backwards
    let lineBudget = visibleLines;
    let endIdx = messages.length;
    let startIdx = messages.length;
    let accumulated = 0;
    for (let i = messages.length - 1; i >= 0; i--) {
        const msgLines = estimateLines(messages[i]!.content, usableWidth);
        accumulated += msgLines;
        if (accumulated > lineBudget + scrollOffset) {
            startIdx = i + 1;
            break;
        }
        if (i === 0) startIdx = 0;
    }

    const visible = messages.slice(startIdx, endIdx);

    // Build the scrollbar only when we have a measured height.
    // Invert offset: 0 = bottom of content, maxOffset = top.
    const invertedOffset = maxOffset - scrollOffset;
    const scrollbar = useMemo(
        () =>
            hasMeasured && visibleLines > 0
                ? scrollbarChar(totalLines, visibleLines, invertedOffset, visibleLines)
                : null,
        [hasMeasured, totalLines, visibleLines, invertedOffset],
    );

    const scrollIndicator =
        scrollOffset > 0 ? ` ↑${scrollOffset}` : totalLines > visibleLines ? " ●" : "";

    // Don't render content until layout is measured — avoids 0-height flash.
    if (!hasMeasured) {
        return (
            <Box
                ref={containerRef}
                flexDirection="column"
                flexGrow={1}
                overflow="hidden"
                paddingX={layout.messagePaddingX}
            >
                <Text dimColor>Messages</Text>
            </Box>
        );
    }

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
            ) : (
                <Text dimColor>Messages</Text>
            )}
            <Box flexDirection="row" flexGrow={1} overflow="hidden">
                {/* Message content column */}
                <Box flexDirection="column" flexGrow={1} overflow="hidden">
                    {visible.map((msg, i) => (
                        <Box
                            key={startIdx + i}
                            flexDirection="column"
                            marginBottom={layout.messageGap}
                        >
                            {msg.role === "reasoning" ? (
                                <Box>
                                    <Text color={roleColors.reasoning} dimColor italic>
                                        {roleLabels.reasoning}:{" "}
                                    </Text>
                                    <Text wrap="wrap" dimColor italic>
                                        {msg.content}
                                    </Text>
                                </Box>
                            ) : (
                                <Box>
                                    <Text color={roleColors[msg.role]} bold>
                                        {roleLabels[msg.role]}:{" "}
                                    </Text>
                                    <Text wrap="wrap">{msg.content}</Text>
                                </Box>
                            )}
                        </Box>
                    ))}
                </Box>

                {/* Scrollbar column — only rendered when content overflows */}
                {scrollbar ? (
                    <Box flexDirection="column" width={layout.scrollbarWidth}>
                        {scrollbar.split("\n").map((char, i) => (
                            <Text
                                key={i}
                                color={char === "█" ? colors.scrollThumb : colors.scrollTrack}
                            >
                                {char}
                            </Text>
                        ))}
                    </Box>
                ) : null}
            </Box>
        </Box>
    );
}
