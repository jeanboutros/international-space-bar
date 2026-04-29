---
name: tester-standards
description: 'Testing standards for the Tester agent. Use when: writing unit tests, integration tests, or API smoke-test scripts. Covers mandatory comment conventions for LLM-reviewable tests, standalone Node.js API test scripts in scripts/, and test quality gates.'
---

# Tester Standards

## When to use

Load this skill before writing any test file or API test script. It defines:
1. Comment conventions that make tests reviewable by other LLM agents
2. Standalone Node.js API test scripts beyond unit tests
3. Quality checklist before reporting

## Part 1 — Test comment conventions

Every test file must be written so that another LLM (the Challenger) can validate the logic without reading the production code. Comments are not optional decoration — they are the test's specification.

### File-level header

Every test file starts with a block comment:

```typescript
/**
 * Tests for: <module or endpoint under test>
 * Source: <relative path to the production file>
 * Ticket: <isb-NNNN>
 *
 * Purpose: <one sentence explaining WHAT behaviour this file verifies>
 */
```

### Describe-block comments

Each top-level `describe` gets a comment explaining the unit boundary:

```typescript
/**
 * ResponsesController.create() — non-streaming path
 * Verifies that a valid POST /v1/responses with stream:false
 * returns a completed ResponseResource with the ping-pong output.
 */
describe("ResponsesController.create() — non-streaming", () => {
```

### Per-test comments (three-line minimum)

Every `it()` / `test()` block must have a comment block with:
1. **What** — what behaviour is being tested
2. **Why** — why this case matters (edge case, regression, AC reference)
3. **Steps** — what the Arrange/Act/Assert steps do

```typescript
/**
 * WHAT: Returns 401 when no Authorization header is present.
 * WHY: AC #4 requires bearer-token validation on /v1/responses.
 * STEPS:
 *   Arrange — build a request with no auth header
 *   Act — call POST /v1/responses
 *   Assert — expect 401 status with error body
 */
it("should return 401 without bearer token", async () => {
```

### Inline step markers

Inside the test body, mark each phase:

```typescript
// --- Arrange ---
const body = { model: "isb-ping", input: "ping" };

// --- Act ---
const response = await request(app.getHttpServer())
  .post("/v1/responses")
  .send(body);

// --- Assert ---
expect(response.status).toBe(401);
expect(response.body.error.type).toBe("authentication_error");
```

### Assertion comments

Non-obvious assertions get a comment explaining **what the assertion proves**:

```typescript
// The response must include usage even for ping-pong (OpenResponses contract)
expect(result.usage.total_tokens).toBe(1);
```

## Part 2 — Standalone API test scripts

Beyond unit and integration tests, the Tester must create simple, standalone Node.js scripts in `scripts/` that exercise every API endpoint against a running server. These scripts serve as:
- Runnable acceptance checks any agent can execute
- Living documentation of how to call each endpoint
- Regression canaries that don't depend on the test framework

### Script conventions

Each script:
- Lives in `scripts/test-api-<endpoint-name>.mjs` (ESM, no build step needed)
- Uses only Node.js built-in `fetch` (no external dependencies)
- Is fully commented explaining each request and what the response should contain
- Exits with code 0 on success, 1 on failure
- Prints human-readable pass/fail output with the actual response

### Script template

```javascript
#!/usr/bin/env node
/**
 * API Test: POST /v1/responses (non-streaming ping-pong)
 * Ticket: isb-NNNN
 *
 * Prerequisites:
 *   - Server running on http://127.0.0.1:3000
 *   - ISB_OPENRESPONSES_API_KEY set (default: "local-dev-key")
 *
 * What this tests:
 *   Sends a valid ping request and verifies the response
 *   matches the OpenResponses contract with "pong" output.
 *
 * Run:
 *   node scripts/test-api-responses.mjs
 */

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const API_KEY = process.env.ISB_OPENRESPONSES_API_KEY ?? "local-dev-key";

/**
 * Helper: make an authenticated request to the API.
 * @param {string} path — API path (e.g. "/v1/responses")
 * @param {object} options — fetch options merged with auth headers
 * @returns {Promise<Response>}
 */
async function apiRequest(path, options = {}) {
  return fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
      ...options.headers,
    },
  });
}

/**
 * Helper: assert a condition, print result, throw on failure.
 * @param {boolean} condition
 * @param {string} label — what was being checked
 */
function assert(condition, label) {
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    console.error(`  ✗ ${label}`);
    throw new Error(`Assertion failed: ${label}`);
  }
}

// --- Test: valid ping-pong request ---
// Send a minimal valid request and verify the full response shape.
async function testPingPong() {
  console.log("\nTest: POST /v1/responses — ping-pong");

  // Arrange — build a valid ping request body
  const body = { model: "isb-ping", input: "ping" };

  // Act — send the request
  const res = await apiRequest("/v1/responses", {
    method: "POST",
    body: JSON.stringify(body),
  });

  const data = await res.json();

  // Assert — verify response structure matches OpenResponses contract
  assert(res.status === 200, `status is 200 (got ${res.status})`);
  assert(data.object === "response", `object is "response"`);
  assert(data.status === "completed", `status is "completed"`);
  assert(Array.isArray(data.output), `output is an array`);
  assert(data.output[0]?.role === "assistant", `first output role is "assistant"`);

  // The content must contain "pong" text
  const text = data.output[0]?.content?.[0]?.text;
  assert(text === "pong", `output text is "pong" (got "${text}")`);

  console.log("  Response:", JSON.stringify(data, null, 2));
}

// --- Run all tests ---
try {
  await testPingPong();
  console.log("\n✓ All API tests passed\n");
  process.exit(0);
} catch (error) {
  console.error(`\n✗ API test failed: ${error.message}\n`);
  process.exit(1);
}
```

### When to create scripts

- **Every new API endpoint** gets a test script
- **Every breaking change** to an existing endpoint gets its script updated
- Scripts must be listed in the Test Report output

### Script naming convention

| Endpoint | Script |
|----------|--------|
| `GET /health` | `scripts/test-api-health.mjs` |
| `POST /v1/responses` | `scripts/test-api-responses.mjs` |
| `POST /v1/responses` (streaming) | `scripts/test-api-responses-stream.mjs` |

## Part 3 — Quality checklist

Before reporting, verify:

- [ ] Every test file has the file-level header comment
- [ ] Every `describe` block has a boundary comment
- [ ] Every `it`/`test` has WHAT/WHY/STEPS comments
- [ ] Every test body has Arrange/Act/Assert markers
- [ ] Non-obvious assertions have explanatory comments
- [ ] API test scripts exist in `scripts/` for every endpoint touched
- [ ] API test scripts run successfully against the dev server
- [ ] `pnpm check` passes
