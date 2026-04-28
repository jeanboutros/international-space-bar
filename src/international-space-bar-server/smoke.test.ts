import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it } from "node:test";

const ROOT = join(import.meta.dirname, "..", "..");
const SRC_DIR = join(ROOT, "src");

function collectTsFiles(dir: string): string[] {
    const files: string[] = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
            files.push(...collectTsFiles(full));
        } else if (full.endsWith(".ts") || full.endsWith(".tsx")) {
            files.push(full);
        }
    }
    return files;
}

void describe("smoke tests", () => {
    void it("no src/ file imports from archive/", () => {
        const files = collectTsFiles(SRC_DIR);
        const violations: string[] = [];

        for (const file of files) {
            const content = readFileSync(file, "utf-8");
            if (/from\s+['"].*archive\//.test(content) || /import\s*\(.*archive\//.test(content)) {
                violations.push(relative(ROOT, file));
            }
        }

        assert.deepStrictEqual(
            violations,
            [],
            `Files importing from archive/: ${violations.join(", ")}`,
        );
    });

    void it("pnpm build:server exits 0", () => {
        execSync("pnpm build:server", { cwd: ROOT, stdio: "pipe" });
    });
});
