import { writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "@kubb/core";
import { pluginOas } from "@kubb/plugin-oas";
import { pluginTs } from "@kubb/plugin-ts";
import { pluginZod } from "@kubb/plugin-zod";
import { removeDisallowedFields } from "./scripts/kubb-preprocessing.js";

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
