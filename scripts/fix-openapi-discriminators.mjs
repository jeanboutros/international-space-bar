#!/usr/bin/env node

/**
 * Post-processes openapi-typescript output to restore original discriminator
 * enum values. openapi-typescript replaces discriminator property values with
 * schema names for TypeScript discriminated union support — this script
 * restores the wire-format values using the "Always `value`" hints left in
 * the JSDoc comments.
 *
 * Usage: node scripts/fix-openapi-discriminators.mjs <file>
 */

import { readFileSync, writeFileSync } from "node:fs";

const filePath = process.argv[2];
if (!filePath) {
	console.error("Usage: node scripts/fix-openapi-discriminators.mjs <file>");
	process.exit(1);
}

let content = readFileSync(filePath, "utf8");

// Match the three-line pattern that openapi-typescript emits for replaced
// discriminator properties:
//
//   ... Always `original_value`. (enum property replaced by openapi-typescript)
//   * @enum {string}
//   */
//   type: "SchemaName";
//
// We extract `original_value` from the comment and replace `"SchemaName"`
// with it. The regex is case-insensitive for "always" / "Always".

content = content.replace(
	/[Aa]lways\b[^`]*`([^`]+)`\. \(enum property replaced by openapi-typescript\)(\n\s+\* @enum \{string\}\n\s+\*\/\n\s+type: )"[^"]+";/g,
	(match, originalValue, middle) =>
		`Always \`${originalValue}\`. (enum property replaced by openapi-typescript)${middle}"${originalValue}";`,
);

writeFileSync(filePath, content);
console.log(`✅ Fixed discriminator values in ${filePath}`);
