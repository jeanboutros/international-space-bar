/**
 * Centralized design tokens for the TUI.
 * All components reference these instead of hard-coding colors, borders, etc.
 */

// ── Colour palette ──────────────────────────────────────────────────────────
export const colors = {
    // Roles
    user: "cyan",
    agent: "green",
    system: "yellow",
    reasoning: "magenta",

    // Chrome
    border: "gray",
    borderActive: "cyan",
    borderBusy: "yellow",
    borderDanger: "red",

    // Text
    heading: "white",
    muted: "gray",
    accent: "cyan",
    success: "green",
    warning: "yellow",
    danger: "red",
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
} as const;

// ── Borders ─────────────────────────────────────────────────────────────────
export const borders = {
    standard: "single",
    prominent: "double",
} as const;
