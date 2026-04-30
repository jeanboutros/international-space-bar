import { writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "@kubb/core";
import { pluginOas } from "@kubb/plugin-oas";
import { pluginTs } from "@kubb/plugin-ts";
import { pluginZod } from "@kubb/plugin-zod";

// Remove all properties whose schema value has minLength:1 + maxLength:0 +
// x-openresponses-disallowed:true. These are intentionally impossible constraints
// used by OpenResponses to mark fields that must not appear in a given context
// (e.g. the `stream` field in WebSocket response.create messages). Zod 4 builds
// the regex eagerly at schema construction time and crashes on the {1,0} quantifier,
// so we strip the properties before Kubb processes the spec.
function removeDisallowedFields(node: unknown): void {
    if (Array.isArray(node)) {
        node.forEach(removeDisallowedFields);
    } else if (node !== null && typeof node === "object") {
        const obj = node as Record<string, unknown>;
        for (const key of Object.keys(obj)) {
            const val = obj[key];
            if (
                val !== null &&
                typeof val === "object" &&
                (val as Record<string, unknown>).minLength === 1 &&
                (val as Record<string, unknown>).maxLength === 0 &&
                (val as Record<string, unknown>)["x-openresponses-disallowed"] === true
            ) {
                delete obj[key];
            } else {
                removeDisallowedFields(val);
            }
        }
    }
}

const rawSpec = JSON.parse(readFileSync("./docs/openapi/openresponses.json", "utf-8")) as unknown;
removeDisallowedFields(rawSpec);
const cleanedSpecPath = join(tmpdir(), "openresponses-cleaned.json");
writeFileSync(cleanedSpecPath, JSON.stringify(rawSpec));

export default defineConfig({
    input: {
        path: cleanedSpecPath,
    },
    output: {
        path: "./src/international-space-bar-server/openresponses/generated",
        extension: { ".ts": ".js" },
    },
    plugins: [
        pluginOas(),
        pluginTs(),
        pluginZod({
            output: {
                path: "./zod",
            },
            version: "4",
            unknownType: "unknown",
            typed: true,
            inferred: true,
        }),
    ],
});
