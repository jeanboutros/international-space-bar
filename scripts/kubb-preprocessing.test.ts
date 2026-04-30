/**
 * Tests for: removeDisallowedFields
 * Source: scripts/kubb-preprocessing.ts
 * Ticket: isb-0058
 *
 * Purpose: Verify that removeDisallowedFields deletes only properties whose schema
 * value satisfies all three sentinel conditions simultaneously (minLength:1,
 * maxLength:0, x-openresponses-disallowed:true), recurses correctly into nested
 * objects and arrays, and never throws on non-object inputs.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { removeDisallowedFields } from "./kubb-preprocessing.js";

/** Sentinel schema value that satisfies all three disallowed conditions. */
const DISALLOWED = { minLength: 1, maxLength: 0, "x-openresponses-disallowed": true };

/**
 * removeDisallowedFields — property deletion logic
 * Verifies which schema values trigger deletion versus retention.
 */
describe("removeDisallowedFields — property deletion", () => {
	/**
	 * WHAT: A property whose value has minLength:1, maxLength:0, and
	 *       x-openresponses-disallowed:true is deleted from its parent object.
	 * WHY: T-01 — this is the core sentinel logic (AC-6, AC-1).
	 * STEPS:
	 *   Arrange — build an object with one property whose value is the full sentinel
	 *   Act — call removeDisallowedFields on the object
	 *   Assert — the property key no longer exists on the object
	 */
	it("T-01: deletes property matching all three conditions", () => {
		// --- Arrange ---
		const input = { badField: structuredClone(DISALLOWED) };

		// --- Act ---
		removeDisallowedFields(input);

		// --- Assert ---
		// The property must be gone — its schema satisfied the full sentinel
		assert.equal("badField" in input, false);
	});

	/**
	 * WHAT: A property with only minLength:1 (no maxLength, no sentinel flag) is retained.
	 * WHY: T-02 — partial match must NOT trigger deletion; all three conditions required.
	 * STEPS:
	 *   Arrange — object with value that has minLength:1 only
	 *   Act — call removeDisallowedFields
	 *   Assert — property still present
	 */
	it("T-02: retains property with only minLength:1", () => {
		// --- Arrange ---
		const input = { field: { minLength: 1 } };

		// --- Act ---
		removeDisallowedFields(input);

		// --- Assert ---
		assert.equal("field" in input, true);
	});

	/**
	 * WHAT: A property with only maxLength:0 is retained.
	 * WHY: T-03 — partial match must NOT trigger deletion.
	 * STEPS:
	 *   Arrange — object with value that has maxLength:0 only
	 *   Act — call removeDisallowedFields
	 *   Assert — property still present
	 */
	it("T-03: retains property with only maxLength:0", () => {
		// --- Arrange ---
		const input = { field: { maxLength: 0 } };

		// --- Act ---
		removeDisallowedFields(input);

		// --- Assert ---
		assert.equal("field" in input, true);
	});

	/**
	 * WHAT: A property with only x-openresponses-disallowed:true is retained.
	 * WHY: T-04 — partial match must NOT trigger deletion.
	 * STEPS:
	 *   Arrange — object with value that has the sentinel flag only
	 *   Act — call removeDisallowedFields
	 *   Assert — property still present
	 */
	it("T-04: retains property with only x-openresponses-disallowed:true", () => {
		// --- Arrange ---
		const input = { field: { "x-openresponses-disallowed": true } };

		// --- Act ---
		removeDisallowedFields(input);

		// --- Assert ---
		assert.equal("field" in input, true);
	});

	/**
	 * WHAT: A property with exactly two of three conditions (minLength + maxLength,
	 *       but no sentinel flag) is retained.
	 * WHY: T-05 — two-of-three match must NOT trigger deletion; all three are required.
	 * STEPS:
	 *   Arrange — object with value that has minLength:1 and maxLength:0 but no sentinel
	 *   Act — call removeDisallowedFields
	 *   Assert — property still present
	 */
	it("T-05: retains property with only minLength + maxLength (missing sentinel)", () => {
		// --- Arrange ---
		const input = { field: { minLength: 1, maxLength: 0 } };

		// --- Act ---
		removeDisallowedFields(input);

		// --- Assert ---
		assert.equal("field" in input, true);
	});
});

/**
 * removeDisallowedFields — recursion behaviour
 * Verifies that the function descends into nested objects and arrays.
 */
describe("removeDisallowedFields — recursion", () => {
	/**
	 * WHAT: A disallowed property nested inside a child object is removed; the
	 *       outer parent object remains intact.
	 * WHY: T-06 — the spec tree is deeply nested; removal must recurse.
	 * STEPS:
	 *   Arrange — object with a child that contains the disallowed property
	 *   Act — call removeDisallowedFields on the root
	 *   Assert — child still exists; disallowed key inside child is gone
	 */
	it("T-06: removes disallowed property inside a nested object", () => {
		// --- Arrange ---
		const input = {
			outer: {
				inner: structuredClone(DISALLOWED),
				keep: { type: "string" },
			},
		};

		// --- Act ---
		removeDisallowedFields(input);

		// --- Assert ---
		// Outer object must still be there
		assert.ok("outer" in input);
		// `inner` must be deleted (full sentinel match inside child)
		assert.equal("inner" in input.outer, false);
		// Sibling property that does not match must be untouched
		assert.ok("keep" in input.outer);
	});

	/**
	 * WHAT: A disallowed property inside an object that is an element of an array
	 *       is removed.
	 * WHY: T-07 — OpenAPI specs use arrays of schema objects (e.g. anyOf, oneOf);
	 *       array recursion is required.
	 * STEPS:
	 *   Arrange — array containing one object with a disallowed property
	 *   Act — call removeDisallowedFields on the array
	 *   Assert — the element still exists; the disallowed key inside it is gone
	 */
	it("T-07: removes disallowed property inside an array element", () => {
		// --- Arrange ---
		const input = [{ badField: structuredClone(DISALLOWED), keep: { type: "string" } }];

		// --- Act ---
		removeDisallowedFields(input);

		// --- Assert ---
		// The element must still exist in the array
		assert.equal(input.length, 1);
		// The disallowed key must be deleted
		assert.equal("badField" in input[0], false);
		// The sibling property must be untouched
		assert.ok("keep" in input[0]);
	});

	/**
	 * WHAT: Sibling properties that do not match the sentinel are unchanged after
	 *       the function removes a matching property.
	 * WHY: T-08 — deletion must be surgical; no collateral removal.
	 * STEPS:
	 *   Arrange — object with one matching and two non-matching sibling properties
	 *   Act — call removeDisallowedFields
	 *   Assert — only the matching property is gone; siblings retain their values
	 */
	it("T-08: leaves sibling properties untouched", () => {
		// --- Arrange ---
		const input = {
			badField: structuredClone(DISALLOWED),
			sibling1: { type: "string" },
			sibling2: 42,
		};

		// --- Act ---
		removeDisallowedFields(input);

		// --- Assert ---
		assert.equal("badField" in input, false);
		// Siblings must be present with their original values
		assert.deepEqual((input as Record<string, unknown>).sibling1, { type: "string" });
		assert.equal((input as Record<string, unknown>).sibling2, 42);
	});
});

/**
 * removeDisallowedFields — non-object inputs
 * Verifies the function is safe to call on null, numbers, and strings.
 */
describe("removeDisallowedFields — non-object inputs", () => {
	/**
	 * WHAT: Passing null does not throw.
	 * WHY: T-09 (part 1) — the spec tree may contain null values; the function
	 *      must guard against them.
	 * STEPS:
	 *   Arrange — null input
	 *   Act — call removeDisallowedFields(null)
	 *   Assert — no exception thrown
	 */
	it("T-09a: does not throw on null", () => {
		// --- Arrange / Act / Assert (single-step: just must not throw) ---
		assert.doesNotThrow(() => removeDisallowedFields(null));
	});

	/**
	 * WHAT: Passing a number does not throw.
	 * WHY: T-09 (part 2) — primitive leaf values appear throughout the spec tree.
	 * STEPS:
	 *   Arrange — number input
	 *   Act — call removeDisallowedFields(42)
	 *   Assert — no exception thrown
	 */
	it("T-09b: does not throw on a number", () => {
		// --- Arrange / Act / Assert ---
		assert.doesNotThrow(() => removeDisallowedFields(42));
	});

	/**
	 * WHAT: Passing a string does not throw.
	 * WHY: T-09 (part 3) — string leaf values appear throughout the spec tree.
	 * STEPS:
	 *   Arrange — string input
	 *   Act — call removeDisallowedFields("hello")
	 *   Assert — no exception thrown
	 */
	it("T-09c: does not throw on a string", () => {
		// --- Arrange / Act / Assert ---
		assert.doesNotThrow(() => removeDisallowedFields("hello"));
	});

	it("T-09d: does not throw on a boolean input", () => {
		/**
		 * WHAT: Passing a boolean primitive does not throw.
		 * WHY: T-09 — boolean values appear as property values throughout the spec tree
		 *      (e.g. "required": true). The function must skip them silently.
		 * STEPS:
		 *   Arrange — provide a boolean as the node
		 *   Act     — call removeDisallowedFields(true)
		 *   Assert  — no exception is thrown
		 */
		// --- Arrange ---
		const input = true;
		// --- Act / Assert ---
		assert.doesNotThrow(() => removeDisallowedFields(input));
	});
});
