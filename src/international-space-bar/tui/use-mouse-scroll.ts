import { useStdin, useStdout } from "ink";
import { useEffect } from "react";

/**
 * Enables SGR mouse reporting and calls `onScroll` with +1 (up) or -1 (down)
 * for every scroll-wheel event. Cleans up mouse mode on unmount.
 */
export function useMouseScroll(onScroll: (direction: 1 | -1) => void): void {
    const { stdout } = useStdout();
    const { stdin, isRawModeSupported } = useStdin();

    useEffect(() => {
        if (!isRawModeSupported) return;

        // Enable SGR extended mouse mode (button events + SGR encoding)
        stdout.write("\x1b[?1000h"); // enable button events
        stdout.write("\x1b[?1006h"); // SGR extended coordinates

        const handler = (data: Buffer) => {
            const str = data.toString("utf-8");

            // SGR mouse: ESC[<button;col;rowM  or  ESC[<button;col;rowm
            // biome-ignore lint/suspicious/noControlCharactersInRegex: ESC is required for terminal escape sequences
            const match = /\x1b\[<(\d+);\d+;\d+[Mm]/.exec(str);
            if (!match) return;

            const button = Number(match[1]);
            // 64 = scroll up, 65 = scroll down (SGR encoding)
            if (button === 64)
                onScroll(1); // scroll up
            else if (button === 65) onScroll(-1); // scroll down
        };

        stdin.on("data", handler);

        return () => {
            stdin.off("data", handler);
            // Disable mouse reporting
            stdout.write("\x1b[?1006l");
            stdout.write("\x1b[?1000l");
        };
    }, [stdout, stdin, isRawModeSupported, onScroll]);
}
