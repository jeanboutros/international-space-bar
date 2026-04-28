/**
 * Centralized design tokens for the TUI.
 * All components reference these instead of hard-coding colors, borders, etc.
 *
 * ## Cyberpunk palette
 * Neon-on-dark aesthetic inspired by cyberpunk/futuristic UIs.
 * Uses hex colours supported by Ink (via `chalk` / `supports-color`).
 */

// ── Colour palette ──────────────────────────────────────────────────────────
export const colors = {
    // Roles — neon identifiers
    user: "#00fff0", // electric cyan
    agent: "#39ff14", // neon green
    system: "#fffc00", // neon yellow
    reasoning: "#ff00ff", // hot magenta

    // Chrome — borders and structural elements
    border: "#2a2a4a", // dark indigo
    borderActive: "#00fff0", // electric cyan
    borderBusy: "#ff6600", // neon orange
    borderDanger: "#ff0040", // neon red-pink

    // Text — content and labels
    heading: "#e0e0ff", // pale blue-white
    muted: "#4a4a6a", // dim lavender
    accent: "#00fff0", // electric cyan
    success: "#39ff14", // neon green
    warning: "#ff6600", // neon orange
    danger: "#ff0040", // neon red-pink

    // Scrollbar thumb
    scrollTrack: "#1a1a2e", // deep navy
    scrollThumb: "#00fff0", // electric cyan

    // Input bar
    inputPrompt: "#00fff0", // electric cyan
} as const;

// ── Role display ────────────────────────────────────────────────────────────
export const roleLabels = {
    user: "You",
    agent: "Agent",
    system: "System",
    reasoning: "Thinking",
} as const;

export const roleColors = {
    user: colors.user,
    agent: colors.agent,
    system: colors.system,
    reasoning: colors.reasoning,
} as const;

// ── Layout ──────────────────────────────────────────────────────────────────
export const layout = {
    sidebarMinWidth: 28,
    sidebarPercent: 0.3,
    messagePaddingX: 1,
    messageGap: 1, // vertical gap between chat messages
    panePaddingX: 1,
    scrollbarWidth: 1, // width of the scrollbar column
} as const;

// ── Borders ─────────────────────────────────────────────────────────────────
export const borders = {
    standard: "single",
    prominent: "double",
} as const;

// ── Scrollbar helpers ───────────────────────────────────────────────────────

/**
 * Build a vertical scrollbar string for a scrollable region.
 *
 * Returns a single character representing the thumb position within a
 * track of `trackHeight` rows, given the current scroll offset and
 * total content lines.
 *
 * Returns `null` if the content fits in the viewport (no scroll needed).
 */
export function scrollbarChar(
    totalLines: number,
    visibleLines: number,
    scrollOffset: number,
    trackHeight: number,
): string | null {
    if (totalLines <= visibleLines) return null;

    const thumbSize = Math.max(1, Math.round((visibleLines / totalLines) * trackHeight));
    const maxScroll = totalLines - visibleLines;
    // Position of the top of the thumb within the track (0-based)
    const thumbTop = Math.round((scrollOffset / maxScroll) * (trackHeight - thumbSize));

    // Build a single-column string: track chars with a thumb block
    // Using unicode block elements: █ for thumb, ┃ for track
    const track: string[] = [];
    for (let i = 0; i < trackHeight; i++) {
        track.push(i >= thumbTop && i < thumbTop + thumbSize ? "█" : "│");
    }

    return track.join("\n");
}
