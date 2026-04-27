import React, { useCallback, useEffect, useRef, useState } from "react";
import { Box, Text, useBoxMetrics, useInput, type DOMElement } from "ink";
import type { RefObject } from "react";
import { getLogRingBuffer } from "../services/log-stream.js";
import { colors, layout } from "./theme.js";

// 1 row for the "Logs" header, 1 for top border = 2 rows of chrome
const CHROME_ROWS = 2;

export default function LogPane() {
    const containerRef = useRef<DOMElement>(null) as RefObject<DOMElement>;
    const { height: boxHeight } = useBoxMetrics(containerRef);
    const visibleCapacity = Math.max(1, boxHeight - CHROME_ROWS);

    const buffer = getLogRingBuffer();
    const [allLines, setAllLines] = useState<readonly string[]>(buffer.getLines());
    const [scrollOffset, setScrollOffset] = useState(0); // 0 = pinned to bottom
    const [autoScroll, setAutoScroll] = useState(true);

    useEffect(() => {
        const refresh = () => {
            const current = buffer.getLines();
            setAllLines(current);
            if (autoScroll) {
                setScrollOffset(0);
            }
        };

        refresh();
        buffer.emitter.on("line", refresh);
        return () => {
            buffer.emitter.off("line", refresh);
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
            {visible.map((line, i) => (
                <Text key={i} dimColor wrap="truncate-end">
                    {line}
                </Text>
            ))}
        </Box>
    );
}
