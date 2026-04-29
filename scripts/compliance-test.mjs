#!/usr/bin/env node

// scripts/compliance-test.mjs
// Runs the OpenResponses compliance test suite against the ISB server.
// Clones (or reuses) the upstream openresponses/openresponses repo and executes
// its compliance test using Bun. Does NOT clean up the clone by default — pass
// --cleanup to remove it after the run.
//
// Prerequisites:
//   - bun >= 1.0 (required by upstream compliance tests for WebSocket header support)
//   - pnpm (to start the ISB dev server)
//   - ISB_OPENRESPONSES_API_KEY env var (or --api-key flag)
//
// Usage:
//   ISB_OPENRESPONSES_API_KEY=local-dev-key node scripts/compliance-test.mjs
//   node scripts/compliance-test.mjs --api-key local-dev-key --model isb-ping
//   node scripts/compliance-test.mjs --filter basic-response,streaming-response
//   node scripts/compliance-test.mjs --cleanup
//   node scripts/compliance-test.mjs --skip-server  (server already running)

import { execSync, spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const CLONE_DIR = resolve(ROOT, ".tmp", "compliance", "openresponses");
const UPSTREAM_REPO = "https://github.com/openresponses/openresponses.git";
const UPSTREAM_BRANCH = "main";

// Ensure bun is findable — common install locations
const BUN_PATHS = [
  resolve(homedir(), ".bun", "bin", "bun"),
  "/usr/local/bin/bun",
];
function resolveBun() {
  // Check PATH first
  try {
    execSync("bun --version", { stdio: "pipe" });
    return "bun";
  } catch {
    // Not in PATH — check common locations
  }
  for (const p of BUN_PATHS) {
    if (existsSync(p)) return p;
  }
  return null;
}

// ── CLI args ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return args[idx + 1];
}
function hasFlag(name) {
  return args.includes(`--${name}`);
}

if (hasFlag("help") || hasFlag("h")) {
  console.log(`
Usage: node scripts/compliance-test.mjs [options]

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

Environment Variables:
  ISB_OPENRESPONSES_API_KEY   API key (required unless --api-key is provided)

Examples:
  ISB_OPENRESPONSES_API_KEY=local-dev-key node scripts/compliance-test.mjs
  node scripts/compliance-test.mjs --api-key local-dev-key --model isb-ping --filter basic-response
  node scripts/compliance-test.mjs --skip-server --api-key local-dev-key --verbose
`);
  process.exit(0);
}

// ── Checks ─────────────────────────────────────────────────────────────────

const API_KEY = getArg("api-key") || process.env.ISB_OPENRESPONSES_API_KEY;
if (!API_KEY) {
  console.error("Error: --api-key or ISB_OPENRESPONSES_API_KEY env var is required");
  process.exit(1);
}

// Check for bun
const bunBin = resolveBun();
console.log(`Using bun at: ${bunBin}`);
if (!bunBin) {
  console.error(
    "Error: bun is required to run the upstream compliance tests.\n" +
    "The upstream tests use Bun's WebSocket client with header support.\n" +
    "Install bun: https://bun.sh/docs/installation",
  );
  process.exit(1);
}

// ── Clone or update upstream repo ───────────────────────────────────────────

function ensureClone() {
  if (existsSync(resolve(CLONE_DIR, "node_modules"))) {
    console.log(`Reusing existing clone at ${CLONE_DIR}`);
    // Pull latest changes
    try {
      console.log("Pulling latest changes from upstream…");
      execSync(`git -C "${CLONE_DIR}" pull --ff-only`, { stdio: "pipe" });
      console.log("Up to date.");
    } catch {
      console.warn(
        "Warning: could not pull latest changes. Using existing clone.\n" +
        "To force a fresh clone, delete .tmp/compliance/ and re-run.",
      );
    }
    return;
  }

  // No node_modules — need to clone and install
  if (existsSync(resolve(CLONE_DIR, "bin", "compliance-test.ts"))) {
    console.log(`Clone exists at ${CLONE_DIR} but needs install.`);
  } else {
    console.log(`Cloning openresponses/openresponses into ${CLONE_DIR}…`);
    execSync(
      `git clone --branch ${UPSTREAM_BRANCH} --depth 1 ${UPSTREAM_REPO} "${CLONE_DIR}"`,
      { stdio: "inherit" },
    );
    console.log("Clone complete.");
  }

  // Install upstream dependencies (Zod v3, etc.) in the clone's own node_modules
  console.log("Installing upstream dependencies…");
  try {
    execSync(`"${bunBin}" install`, { cwd: CLONE_DIR, stdio: "inherit" });
    console.log("Dependencies installed.");
  } catch {
    console.warn(
      "Warning: bun install failed. Trying npm install as fallback…",
    );
    try {
      execSync("npm install", { cwd: CLONE_DIR, stdio: "inherit" });
      console.log("Dependencies installed via npm.");
    } catch {
      console.error(
        "Error: Failed to install upstream dependencies.\n" +
        "Try deleting .tmp/compliance/ and re-running.",
      );
      process.exit(1);
    }
  }
}

ensureClone();

// ── Start dev server (unless --skip-server) ────────────────────────────────

const BASE_URL = getArg("base-url") || "http://localhost:3000/v1";
let serverProc = null;

async function waitForServer(url, timeoutMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url.replace(/\/v1.*$/, "/health"));
      if (res.ok) return true;
    } catch {
      // Not ready yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

if (!hasFlag("skip-server")) {
  console.log("Starting ISB dev server…");
  serverProc = spawn("pnpm", ["dev:server"], {
    cwd: ROOT,
    stdio: "pipe",
    env: { ...process.env, ISB_OPENRESPONSES_API_KEY: API_KEY },
  });

  serverProc.stdout?.on("data", (data) => {
    // Suppress server output unless verbose
    if (hasFlag("verbose")) {
      process.stdout.write(data);
    }
  });

  serverProc.stderr?.on("data", (data) => {
    if (hasFlag("verbose")) {
      process.stderr.write(data);
    }
  });

  if (!hasFlag("no-server-wait")) {
    console.log("Waiting for server to be ready…");
    const ready = await waitForServer(BASE_URL);
    if (!ready) {
      console.error("Error: server did not become ready within 30 seconds");
      cleanup(1);
    }
    console.log("Server is ready.");
  }
}

// ── Build upstream compliance command ────────────────────────────────────────

const MODEL = getArg("model") || "isb-ping";
const upstreamArgs = [
  "run",
  resolve(CLONE_DIR, "bin", "compliance-test.ts"),
  "--base-url", BASE_URL,
  "--api-key", API_KEY,
  "--model", MODEL,
];

if (hasFlag("verbose")) upstreamArgs.push("--verbose");
if (hasFlag("json")) upstreamArgs.push("--json");

const filter = getArg("filter");
if (filter) {
  upstreamArgs.push("--filter", filter);
}

// ── Run ─────────────────────────────────────────────────────────────────────

console.log(`\nRunning compliance tests against: ${BASE_URL}`);
console.log(`Model: ${MODEL}`);
if (filter) console.log(`Filter: ${filter}`);
console.log("");

let exitCode = 1;
try {
  execSync(`"${bunBin}" ${upstreamArgs.map((a) => `"${a}"`).join(" ")}`, {
    cwd: CLONE_DIR,
    stdio: "inherit",
  });
  exitCode = 0;
} catch (err) {
  // execSync throws on non-zero exit — that's expected for test failures
  if (err.status) {
    exitCode = err.status;
  }
}

// ── Cleanup ─────────────────────────────────────────────────────────────────

function cleanup(code) {
  if (serverProc) {
    console.log("\nStopping dev server…");
    serverProc.kill("SIGTERM");
  }

  if (hasFlag("cleanup") && existsSync(CLONE_DIR)) {
    console.log(`Cleaning up clone at ${CLONE_DIR}…`);
    rmSync(resolve(ROOT, ".tmp", "compliance"), { recursive: true, force: true });
  }

  process.exit(code ?? exitCode);
}

// Handle signals gracefully
process.on("SIGINT", () => cleanup(130));
process.on("SIGTERM", () => cleanup(143));

// Give server a moment to flush, then exit
setTimeout(() => cleanup(exitCode), 500);