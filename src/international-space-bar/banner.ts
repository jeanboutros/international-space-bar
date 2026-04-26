import packageJson from "../../package.json" with { type: "json" };
import type { AppContext } from "./interfaces/app-context.interface.js";
import type { IConfig } from "./interfaces/config.interface.js";

// ---------------------------------------------------------------------------
// Secret masking
// ---------------------------------------------------------------------------

/**
 * Masks a secret string, revealing the first 4 and last 4 characters only.
 * Strings shorter than 12 characters are replaced entirely with asterisks
 * to avoid leaking meaningful fragments.
 *
 * @example
 * maskSecret("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")
 * // → "tvly***...***jMV"
 */
function maskSecret(value: string): string {
    if (value.length < 12) return "*".repeat(value.length);
    const visible = 4;
    return `${value.slice(0, visible)}${"*".repeat(8)}...${value.slice(-visible)}`;
}

// ---------------------------------------------------------------------------
// Config table
// ---------------------------------------------------------------------------

type Row = [label: string, value: string, secret?: boolean];

function buildRows(config: IConfig): Row[] {
    return [
        ["version", packageJson.version],
        ["nodeEnv", config.nodeEnv],
        ["loggerType", config.loggerType],
        ["ollamaBaseUrl", config.ollamaBaseUrl.href],
        ["tavilyApiKey", config.tavilyApiKey, true],
        ["logFilePath", config.logFilePath ?? "(none)"],
        ["skillsRoot", config.skillsRoot],
        ["agentsConfigDir", config.agentsConfigDir],
        ["appVersion", config.appVersion],
    ];
}

// ---------------------------------------------------------------------------
// Box drawing
// ---------------------------------------------------------------------------

const BORDER = {
    tl: "╔",
    tr: "╗",
    bl: "╚",
    br: "╝",
    h: "═",
    v: "║",
    ml: "╠",
    mr: "╣",
    cross: "╪",
};

function pad(text: string, width: number): string {
    return text + " ".repeat(Math.max(0, width - text.length));
}

function renderBanner(config: IConfig): string {
    const appName = "INTERNATIONAL SPACE BAR";
    const tagline = "agent orchestration platform";
    const rows = buildRows(config);

    const labelWidth = Math.max(...rows.map(([l]) => l.length));
    const valueWidth = Math.max(
        ...rows.map(([, v, s]) => (s ? maskSecret(v) : v).length),
        tagline.length,
    );

    const innerWidth = labelWidth + valueWidth + 5; // " │ " separator + 2 side pads

    const hr = BORDER.h.repeat(innerWidth);
    const divider = `${BORDER.ml}${hr}${BORDER.mr}`;

    const centreText = (text: string) => {
        const total = innerWidth - 2; // 1 space each side
        const left = Math.floor((total - text.length) / 2);
        const right = total - text.length - left;
        return `${BORDER.v} ${" ".repeat(left)}${text}${" ".repeat(right)} ${BORDER.v}`;
    };

    const renderRow = ([label, rawValue, secret]: Row): string => {
        const value = secret ? maskSecret(rawValue) : rawValue;
        const line = ` ${pad(label, labelWidth)} │ ${pad(value, valueWidth)} `;
        return `${BORDER.v}${line}${BORDER.v}`;
    };

    const lines: string[] = [
        `${BORDER.tl}${hr}${BORDER.tr}`,
        centreText(appName),
        centreText(tagline),
        divider,
        ...rows.map(renderRow),
        `${BORDER.bl}${hr}${BORDER.br}`,
    ];

    return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Public runnable
// ---------------------------------------------------------------------------

/**
 * Prints a startup banner with the application name and all active
 * configuration values to stdout. Secrets are masked — only the first
 * and last four characters are visible.
 *
 * Intended to be registered as a development-only initialisation task:
 *
 * ```typescript
 * if (config.nodeEnv === "development") {
 *     App.addInitializationTask("banner", () => printBanner(App.getContext()));
 * }
 * ```
 *
 * > **Important**: call this after `App.getContext()` is available, i.e. after
 * > config and logging have been initialised.
 */
export function printBanner(ctx: AppContext): Promise<void> {
    process.stdout.write(`\n${renderBanner(ctx.config)}\n\n`);
    return Promise.resolve();
}
