import { defineConfig } from "@kubb/core";
import { pluginOas } from "@kubb/plugin-oas";
import { pluginTs } from "@kubb/plugin-ts";
import { pluginZod } from "@kubb/plugin-zod";

export default defineConfig({
    input: {
        path: "./docs/openapi/openresponses.json",
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
