import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useBoxMetrics, useInput, type DOMElement } from "ink";
import type { RefObject } from "react";
import { getLogRingBuffer } from "../services/log-stream.js";
import { colors, layout, scrollbarChar } from "./theme.js";

export default function LogPane() {
    const containerRef = useRef<DOMElement>(null) as RefObject<DOMElement>;
    const { height: boxHeight, hasMeasured } = useBoxMetrics(containerRef);

    // 1 row for "Logs" header + 1 top border = 2 rows of chrome
    const chromeRows = 2;
    const visibleCapacity = hasMeasured ? Math.max(1, boxHeight - chromeRows) : 0;

    const buffer = getLogRingBuffer();
    const [allLines, setAllLines] = useState<readonly string[]>(buffer.getLines());
    const [scrollOffset, setScrollOffset] = useState(0); // 0 = pinned to bottom
    const [autoScroll, setAutoScroll] = useState(true);

    // Debounce rapid log line events — batch multiple lines into a
    // single re-render so the TUI doesn't jump on every log write.
    const pendingRef = useRef(false);
    useEffect(() => {
        const scheduleRefresh = () => {
            if (pendingRef.current) return; // already scheduled
            pendingRef.current = true;
            // Use setImmediate-like scheduling: wait for the current
            // synchronous batch of events to finish, then refresh once.
            Promise.resolve().then(() => {
                pendingRef.current = false;
                const current = buffer.getLines();
                setAllLines(current);
                if (autoScroll) {
                    setScrollOffset(0);
                }
            });
        };

        buffer.emitter.on("line", scheduleRefresh);
        return () => {
            buffer.emitter.off("line", scheduleRefresh);
        };
    }, [buffer, autoScroll]);

    const maxOffset = Math.max(0, allLines.length - visibleCapacity);

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

    useInput((_input, key) => {
        if (key.shift && key.upArrow) scrollUp();
        else if (key.shift && key.downArrow) scrollDown();
    });

    const startIdx = Math.max(0, allLines.length - visibleCapacity - scrollOffset);
    const visible = allLines.slice(startIdx, startIdx + visibleCapacity);

    const scrollIndicator =
        scrollOffset > 0 ? ` ↑${scrollOffset}` : allLines.length > visibleCapacity ? " ●" : "";

    // Build the scrollbar only when we have a measured height.
    // Invert offset: 0 = bottom, maxOffset = top.
    const invertedOffset = maxOffset - scrollOffset;
    const scrollbar = useMemo(
        () =>
            hasMeasured && visibleCapacity > 0
                ? scrollbarChar(allLines.length, visibleCapacity, invertedOffset, visibleCapacity)
                : null,
        [hasMeasured, allLines.length, visibleCapacity, invertedOffset],
    );

    // Pad visible lines to exactly visibleCapacity so the scrollbar always
    // matches the content height (prevents visual jumping).
    const paddedVisible = useMemo(() => {
        if (visibleCapacity === 0) return [];
        const rows = [...visible];
        while (rows.length < visibleCapacity) {
            rows.push("");
        }
        return rows;
    }, [visible, visibleCapacity]);

    // Don't render content until layout is measured — avoids 0-height flash.
    if (!hasMeasured) {
        return (
            <Box
                ref={containerRef}
                flexDirection="column"
                borderStyle="single"
                borderColor={colors.border}
                borderLeft={false}
                borderRight={false}
                borderBottom={false}
                paddingX={layout.panePaddingX}
                flexGrow={1}
                overflow="hidden"
            >
                <Text bold dimColor>
                    Logs
                </Text>
            </Box>
        );
    }

    return (
        <Box
            ref={containerRef}
            flexDirection="column"
            borderStyle="single"
            borderColor={colors.border}
            borderLeft={false}
            borderRight={false}
            borderBottom={false}
            paddingX={layout.panePaddingX}
            flexGrow={1}
            overflow="hidden"
        >
            <Text bold dimColor>
                Logs{scrollIndicator}
                <Text dimColor> (Shift+↑↓)</Text>
            </Text>
            <Box flexDirection="row" flexGrow={1} overflow="hidden">
                {/* Log content column */}
                <Box flexDirection="column" flexGrow={1} overflow="hidden">
                    {paddedVisible.map((line, i) => (
                        <Text key={startIdx + i} dimColor wrap="truncate-end">
                            {line}
                        </Text>
                    ))}
                </Box>

                {/* Scrollbar column */}
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
