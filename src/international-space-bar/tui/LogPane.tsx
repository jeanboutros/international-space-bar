import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { getLogRingBuffer } from "./log-stream.js";

const MAX_VISIBLE = 8;

export default function LogPane() {
    const [lines, setLines] = useState<readonly string[]>([]);
    const buffer = getLogRingBuffer();

    useEffect(() => {
        const refresh = () => {
            setLines(buffer.getLines().slice(-MAX_VISIBLE));
        };

        refresh();
        buffer.emitter.on("line", refresh);
        return () => {
            buffer.emitter.off("line", refresh);
        };
    }, [buffer]);

    return (
        <Box
            flexDirection="column"
            borderStyle="single"
            borderColor="gray"
            paddingX={1}
            height={MAX_VISIBLE + 2}
        >
            <Text bold dimColor>
                Logs
            </Text>
            {lines.map((line, i) => (
                <Text key={i} dimColor wrap="truncate-end">
                    {line}
                </Text>
            ))}
        </Box>
    );
}
