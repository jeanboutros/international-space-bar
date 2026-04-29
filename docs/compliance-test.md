# OpenResponses Compliance Test

Run the official [OpenResponses](https://github.com/openresponses/openresponses) compliance test suite against the ISB server to verify our implementation matches the OpenResponses protocol specification.

## Prerequisites

| Requirement | Why | Install |
|-------------|-----|---------|
| **Bun** ≥ 1.0 | Upstream tests use Bun's WebSocket client with header support | [bun.sh/docs/installation](https://bun.sh/docs/installation) |
| **pnpm** | Start the ISB dev server | Already required by ISB |
| **ISB_OPENRESPONSES_API_KEY** | Authentication | Set in `.env` or pass as flag |

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

### Run specific tests

```bash
# Only basic response and streaming
pnpm test:compliance -- --api-key local-dev-key --filter basic-response,streaming-response
```

### Server already running

If you already have a dev server running:

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

These are defined in the upstream `openresponses/openresponses` repo and may change. Run with `--verbose` or check [upstream source](https://github.com/openresponses/openresponses/blob/main/src/lib/compliance-tests.ts) for the current list. Common IDs:

| Test ID | What it validates |
|---------|-------------------|
| `basic-response` | Simple text response, validates ResponseResource schema |
| `assistant-phase` | Assistant history with phase labels |
| `response-output-phase-schema` | ResponseResource schema for assistant output phase labels (mock, no HTTP) |
| `streaming-response` | SSE streaming events and final response |
| `websocket-response` | WebSocket response creation and streaming events |
| `websocket-sequential-responses` | Multiple response.create on one WebSocket connection |
| `websocket-continuation` | store:false continuation with previous_response_id |
| `websocket-reconnect-store-false-recovery` | Reconnect recovery after store:false chain |
| `websocket-previous-response-not-found` | Missing previous_response_id error handling |
| `websocket-failed-continuation-evicts-cache` | Failed continuation cache eviction |
| `websocket-compact-new-chain` | Compact output as base input for new WebSocket response |
| `system-prompt` | System role message in input |
| `tool-calling` | Function tool definition and function_call output |
| `image-input` | Image URL in user content |
| `multi-turn` | Multi-turn conversation with assistant + user history |
| `compact-response` | /responses/compact endpoint with prompt_cache_key |
| `compact-missing-model` | /responses/compact rejects missing model field |

> **Note**: WebSocket tests require Bun's native WebSocket client which supports custom headers. Node.js does not support this natively, so running without Bun will fail on WebSocket tests.

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