import { EventEmitter } from "node:events";
import { Writable } from "node:stream";

const DEFAULT_MAX_LINES = 200;

/**
 * A writable stream that captures log lines into a fixed-size ringbuffer.
 * Emits a `"line"` event for each new line so TUI components can subscribe.
 */
export class LogRingBuffer extends Writable {
    private readonly lines: string[] = [];
    private readonly maxLines: number;
    readonly emitter = new EventEmitter();

    constructor(maxLines = DEFAULT_MAX_LINES) {
        super();
        this.maxLines = maxLines;
    }

    override _write(
        chunk: Buffer | string,
        _encoding: BufferEncoding,
        callback: (error?: Error | null) => void,
    ): void {
        const text = typeof chunk === "string" ? chunk : chunk.toString("utf-8");
        const newLines = text.split("\n").filter((l) => l.length > 0);

        for (const line of newLines) {
            this.lines.push(line);
            if (this.lines.length > this.maxLines) {
                this.lines.shift();
            }
        }

        if (newLines.length > 0) {
            this.emitter.emit("line");
        }

        callback();
    }

    getLines(): readonly string[] {
        return this.lines;
    }
}

/** Module-level singleton — created once, shared across logging and TUI. */
let instance: LogRingBuffer | undefined;

export function getLogRingBuffer(): LogRingBuffer {
    instance ??= new LogRingBuffer();
    return instance;
}
