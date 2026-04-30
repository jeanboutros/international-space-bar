# OpenResponses Compliance Test

Run the official [OpenResponses](https://github.com/openresponses/openresponses) compliance test suite against the ISB server to verify our implementation matches the OpenResponses protocol specification.

## Prerequisites

| Requirement | Why | Install |
|-------------|-----|---------|
| **Bun** ≥ 1.0 | Upstream tests use Bun's WebSocket client with header support | [bun.sh/docs/installation](https://bun.sh/docs/installation) |
| **pnpm** | Start the ISB dev server | Already required by ISB |
| **ISB_OPENRESPONSES_API_KEY** | Authentication | Set in `.env` or pass as flag |
| **websocat** (optional) | Manual WebSocket testing | `brew install websocat` |

## Quick start

```bash
# With .env providing ISB_OPENRESPONSES_API_KEY:
pnpm test:compliance

# Or pass the API key directly:
pnpm test:compliance -- --api-key local-dev-key
```

The script will:

1. Clone (or reuse) the upstream `openresponses/openresponses` repo into `.tmp/compliance/openresponses/`
2. Start the ISB dev server
3. Wait for the server to be ready
4. Run `bun run bin/compliance-test.ts` from the cloned repo
5. Report results and stop the server

## Options

```
pnpm test:compliance -- [options]

Options:
  --api-key <key>         API key (or set ISB_OPENRESPONSES_API_KEY env var)
  --base-url <url>        Server base URL (default: http://localhost:3000/v1)
  --model <model>         Model name (default: isb-ping for ping-pong tests)
  --filter <ids>          Comma-separated test IDs to run (default: all)
  --verbose               Verbose output with request/response details
  --json                  Output results as JSON
  --skip-server           Skip starting the dev server (it's already running)
  --cleanup               Remove the cloned repo after the test run
  --no-server-wait        Don't wait for server to be ready (for CI)
  -h, --help              Show this help message
```

## Common usage patterns

### Run all tests

```bash
pnpm test:compliance -- --api-key local-dev-key
```

### Run only WebSocket tests

```bash
pnpm test:compliance -- --api-key local-dev-key \
  --filter websocket-response,websocket-sequential-responses,websocket-continuation,websocket-previous-response-not-found,websocket-failed-continuation-evicts-cache,websocket-reconnect-store-false-recovery
```

### Run only HTTP tests

```bash
pnpm test:compliance -- --api-key local-dev-key \
  --filter basic-response,streaming-response,system-prompt,multi-turn,image-input,assistant-phase,response-output-phase-schema
```

### Server already running

```bash
pnpm test:compliance -- --skip-server --api-key local-dev-key
```

### Verbose output (debugging)

```bash
pnpm test:compliance -- --api-key local-dev-key --verbose
```

### JSON output (for CI)

```bash
pnpm test:compliance -- --api-key local-dev-key --json > compliance-results.json
```

### Clean up the cloned repo

The clone is preserved by default so you don't re-clone on every run. To remove it:

```bash
pnpm test:compliance -- --api-key local-dev-key --cleanup
```

Or manually:

```bash
rm -rf .tmp/compliance/
```

## Available test IDs

These are defined in the upstream `openresponses/openresponses` repo. Run with `--verbose` or check [upstream source](https://github.com/openresponses/openresponses/blob/main/src/lib/compliance-tests.ts) for the current list.

| Test ID | What it validates | ISB Status |
|---------|-------------------|------------|
| `basic-response` | Simple text response, validates ResponseResource schema | ✅ Passing |
| `assistant-phase` | Assistant history with phase labels | ✅ Passing |
| `response-output-phase-schema` | ResponseResource schema for assistant output phase labels (mock, no HTTP) | ✅ Passing |
| `streaming-response` | SSE streaming events and final response | ✅ Passing |
| `websocket-response` | WebSocket response creation and streaming events | ❌ Failing |
| `websocket-sequential-responses` | Multiple response.create on one WebSocket connection | ❌ Failing |
| `websocket-continuation` | store:false continuation with previous_response_id | ❌ Failing |
| `websocket-reconnect-store-false-recovery` | Reconnect recovery after store:false chain | ❌ Failing |
| `websocket-previous-response-not-found` | Missing previous_response_id error handling | ✅ Passing |
| `websocket-failed-continuation-evicts-cache` | Failed continuation cache eviction | ❌ Failing |
| `websocket-compact-new-chain` | Compact output as base input for new WebSocket response | ❌ Blocked (missing /v1/responses/compact) |
| `system-prompt` | System role message in input | ✅ Passing |
| `tool-calling` | Function tool definition and function_call output | ❌ Runtime issue |
| `image-input` | Image URL in user content | ✅ Passing |
| `multi-turn` | Multi-turn conversation with assistant + user history | ✅ Passing |
| `compact-response` | /responses/compact endpoint with prompt_cache_key | ❌ Blocked (missing endpoint) |
| `compact-missing-model` | /responses/compact rejects missing model field | ❌ Blocked (missing endpoint) |

> **Note**: WebSocket tests require Bun's native WebSocket client which supports custom headers. Node.js does not support this natively, so running without Bun will fail on WebSocket tests.

## Manual WebSocket testing with websocat

The compliance test runner uses Bun's WebSocket client. For ad-hoc debugging, `websocat` is more convenient.

### Install websocat

```bash
# macOS
brew install websocat
```

### Basic response

```bash
echo '{"type":"response.create","model":"isb-ping","input":"hello"}' | \
  websocat "ws://127.0.0.1:3000/v1/responses" \
    -H "Authorization: Bearer local-dev-key"
```

Expected: a stream of JSON frames (response.created, output_item.added, output_text.delta, ..., response.completed).

### View just event types

```bash
(echo '{"type":"response.create","model":"isb-ping","input":"ping"}'; sleep 10) | \
  websocat "ws://127.0.0.1:3000/v1/responses" \
    -H "Authorization: Bearer local-dev-key" | \
  jq -r '.type //?'
```

Expected output (event types, one per line):
```
response.created
response.output_item.added
response.reasoning_summary_part.added
response.reasoning_summary_text.delta
...
response.output_text.delta
...
response.output_text.done
response.content_part.done
response.output_item.done
response.completed
```

### Auth failure

```bash
echo '{"type":"response.create","model":"isb-ping","input":"test"}' | \
  websocat "ws://127.0.0.1:3000/v1/responses" \
    -H "Authorization: Bearer wrong-key"
```

Expected: error envelope with `status: 401`, `code: "unauthorized"`, then connection close.

### previous_response_not_found

```bash
echo '{"type":"response.create","model":"isb-ping","input":"test","previous_response_id":"resp_nonexistent","store":false}' | \
  websocat "ws://127.0.0.1:3000/v1/responses" \
    -H "Authorization: Bearer local-dev-key"
```

Expected: error envelope with `status: 400`, `code: "previous_response_not_found"`, `param: "previous_response_id"`.

### Sequential responses (interactive)

```bash
websocat "ws://127.0.0.1:3000/v1/responses" -H "Authorization: Bearer local-dev-key"
```

Then send each message and wait for `response.completed` before the next:

```json
{"type":"response.create","model":"isb-ping","input":"first message"}
```
```json
{"type":"response.create","model":"isb-ping","input":"second message"}
```

### store:false continuation (interactive)

```bash
websocat "ws://127.0.0.1:3000/v1/responses" -H "Authorization: Bearer local-dev-key"
```

1. Send: `{"type":"response.create","model":"isb-ping","input":"remember this","store":false}`
2. Note the `response.id` from the `response.completed` event (e.g. `resp_abc123`)
3. Send: `{"type":"response.create","model":"isb-ping","input":"continue","previous_response_id":"resp_abc123","store":false}`
4. This should succeed — the response is in connection-local state
5. Close the connection, reconnect, and try the same `previous_response_id` — should get `previous_response_not_found`

### Input as message array

```bash
echo '{"type":"response.create","model":"isb-ping","input":[{"type":"message","role":"user","content":"Count from 1 to 3."}]}' | \
  websocat "ws://127.0.0.1:3000/v1/responses" \
    -H "Authorization: Bearer local-dev-key"
```

This matches the format used by the `websocket-response` compliance test.

## Updating the upstream tests

The script automatically pulls the latest changes from the upstream repo on each run (git pull --ff-only). If the pull fails (e.g. diverged history), delete the clone and re-run:

```bash
rm -rf .tmp/compliance/
pnpm test:compliance -- --api-key local-dev-key
```

## CI integration

```bash
# Start server in background, run compliance, capture results
pnpm dev:server &
sleep 10
pnpm test:compliance -- --skip-server --api-key local-dev-key --json > compliance-results.json
kill %1
```

Or use `--no-server-wait` with your own server readiness check.

## Troubleshooting

| Problem | Solution |
|---------|---------|
| `bun is required` | Install Bun — the upstream tests need Bun's WebSocket client |
| `server did not become ready` | Increase timeout, check port 3000 is free, check `.env` |
| WebSocket tests fail with `Connection failed` | Ensure Bun is installed; Node.js WebSocket client doesn't support headers |
| `git clone` fails | Check network access to github.com, or manually clone into `.tmp/compliance/openresponses/` |
| Stale clone / pull fails | Delete `.tmp/compliance/` and re-run |
| WebSocket events received but `finalResponse` is null | Likely a schema mismatch between ping-pong runtime output and compliance test expectations; try running with Ollama stopped to use simple fallback |
| Reasoning events appear in WebSocket stream | The ChatOllama-backed runtime produces reasoning blocks; these are valid per spec but may not match the compliance test's expected event sequence |