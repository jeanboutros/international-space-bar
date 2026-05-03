// @ts-check
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";
import unusedImports from "eslint-plugin-unused-imports";

/**
 * ESLint owns ALL linting (type-aware + non-type-aware).
 * Prettier owns ALL formatting (via `pnpm format`).
 *
 * Uses `strictTypeChecked` — the strictest preset from typescript-eslint — plus
 * `stylisticTypeChecked` for consistent code style conventions.
 *
 * eslint-config-prettier disables any ESLint rules that conflict with Prettier.
 * eslint-plugin-unused-imports auto-removes dead imports on `--fix`.
 *
 * Run: pnpm lint / pnpm lint:fix / pnpm check
 */
export default defineConfig(
    {
        // ignore compiled output, generated files, and legacy code being retired
        ignores: [
            "dist/**",
            "scripts/**",
            ".claude/**",
            ".vscode/**",
            ".agent/**",
            ".github/**",
            ".opencode/**",
            ".tmp/**",
            "src/international-space-bar/**",
            "src/**/openresponses/openresponses.generated.d.ts",
            "src/**/openresponses/generated/**",
        ],
    },
    {
        files: ["src/**/*.ts"],
        extends: [tseslint.configs.strictTypeChecked, tseslint.configs.stylisticTypeChecked],
        plugins: {
            "unused-imports": unusedImports,
        },
        languageOptions: {
            parserOptions: {
                projectService: true,
            },
        },
        rules: {
            // ── Type-aware (strict) ──────────────────────────────────────
            "@typescript-eslint/no-floating-promises": "error",
            "@typescript-eslint/no-misused-promises": "error",
            "@typescript-eslint/await-thenable": "error",
            "@typescript-eslint/no-unnecessary-type-assertion": "error",
            "@typescript-eslint/no-unsafe-argument": "error",
            "@typescript-eslint/no-unsafe-assignment": "error",
            "@typescript-eslint/no-unsafe-call": "error",
            "@typescript-eslint/no-unsafe-member-access": "error",
            "@typescript-eslint/no-unsafe-return": "error",

            // ── Non-type-aware ───────────────────────────────────────────
            "@typescript-eslint/no-unused-vars": [
                "error",
                { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
            ],
            "@typescript-eslint/no-explicit-any": "warn",
            "no-console": "warn",
            "no-debugger": "error",
            "prefer-const": "error",
            "prefer-template": "warn",

            // ── Unused imports (auto-fixable) ────────────────────────────
            "unused-imports/no-unused-imports": "error",

            // ── Relax strict rules where needed ──────────────────────────
            // NestJS modules are empty decorator-only classes
            "@typescript-eslint/no-extraneous-class": "off",
            // NestJS uses empty interfaces for module metadata
            "@typescript-eslint/no-empty-object-type": "off",
            // Allow non-null assertions in tests and NestJS DI
            "@typescript-eslint/no-non-null-assertion": "warn",
            // Restrict template expressions but allow numbers and booleans
            "@typescript-eslint/restrict-template-expressions": [
                "error",
                { allowNumber: true, allowBoolean: true },
            ],
            // Defensive runtime checks on protocol data are intentional
            "@typescript-eslint/no-unnecessary-condition": "warn",
            // Empty methods are common in test mocks and NestJS overrides
            "@typescript-eslint/no-empty-function": [
                "error",
                { allow: ["methods", "overrideMethods", "arrowFunctions"] },
            ],
        },
    },
    eslintConfigPrettier,
);
