// @ts-check
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

/**
 * ESLint is intentionally scoped to type-aware rules only.
 * Formatting and non-type-aware linting is handled by Biome (faster, zero-config).
 *
 * `recommendedTypeCheckedOnly` is the preset specifically designed for pairing with
 * another linter — it omits all non-type-aware rules so there is zero overlap with Biome.
 *
 * Rules enabled here require TypeScript's type checker and cannot be replicated by Biome:
 * - no-floating-promises      — every async call must be awaited or explicitly ignored
 * - no-misused-promises       — prevents passing async functions where void is expected
 * - await-thenable            — disallows awaiting non-Promise values
 * - no-unnecessary-type-assertion — removes redundant `as` casts
 * - no-unsafe-*               — bans implicit `any` from untyped expressions
 *
 * Run: pnpm lint
 */
export default defineConfig(
    {
        // ignore compiled output and generated files
        ignores: ["dist/**", "src/**/openresponses/openresponses.generated.d.ts"],
    },
    {
        files: ["src/**/*.ts"],
        extends: [tseslint.configs.recommendedTypeCheckedOnly],
        languageOptions: {
            parserOptions: {
                projectService: true,
            },
        },
        rules: {
            // type-aware rules Biome cannot replicate
            "@typescript-eslint/no-floating-promises": "error",
            "@typescript-eslint/no-misused-promises": "error",
            "@typescript-eslint/await-thenable": "error",
            "@typescript-eslint/no-unnecessary-type-assertion": "error",
            "@typescript-eslint/no-unsafe-argument": "error",
            "@typescript-eslint/no-unsafe-assignment": "error",
            "@typescript-eslint/no-unsafe-call": "error",
            "@typescript-eslint/no-unsafe-member-access": "error",
            "@typescript-eslint/no-unsafe-return": "error",
        },
    }
);
