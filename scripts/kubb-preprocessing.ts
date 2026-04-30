/**
 * Build-time preprocessing for the OpenResponses OpenAPI spec.
 * Removes properties whose schema value matches the x-openresponses-disallowed sentinel.
 *
 * A property is removed when its schema value satisfies ALL THREE simultaneously:
 *   - minLength === 1
 *   - maxLength === 0
 *   - x-openresponses-disallowed === true
 *
 * These are intentionally impossible constraints used by OpenResponses to mark fields
 * that must not appear in a given context (e.g. the `stream` field in WebSocket
 * response.create messages). Zod 4 builds the regex eagerly at schema construction
 * time and crashes on the {1,0} quantifier, so we strip the properties before Kubb
 * processes the spec.
 *
 * This module has zero module-level side effects — it only exports functions.
 */

/**
 * Recursively removes properties from `node` whose schema value matches the
 * `x-openresponses-disallowed` sentinel: `minLength: 1`, `maxLength: 0`,
 * and `x-openresponses-disallowed: true` must ALL be present simultaneously.
 *
 * Mutates `node` in-place. The caller is responsible for passing a deep copy
 * if the original must be preserved.
 *
 * @param node - The OpenAPI spec node to process (any JSON-compatible value).
 * @returns void
 * @example
 * const spec = { stream: { minLength: 1, maxLength: 0, "x-openresponses-disallowed": true } };
 * removeDisallowedFields(spec);
 * // spec.stream is now deleted
 */
export function removeDisallowedFields(node: unknown): void {
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
