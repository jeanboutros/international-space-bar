#!/usr/bin/env node
// scripts/test-api-responses-stream.mjs
// Manual smoke test for the SSE streaming endpoint.
// Requires a live Ollama instance with gemma4:e2b loaded.
// Usage: ISB_OPENRESPONSES_API_KEY=<key> node scripts/test-api-responses-stream.mjs

import http from "node:http";

// ── Guard: require env var ────────────────────────────────────────────────────
const API_KEY = process.env.ISB_OPENRESPONSES_API_KEY;
if (!API_KEY) {
    console.error(
        "Error: ISB_OPENRESPONSES_API_KEY environment variable is required.\n" +
            "Usage: ISB_OPENRESPONSES_API_KEY=<key> node scripts/test-api-responses-stream.mjs",
    );
    process.exit(1);
}

// ── Config ────────────────────────────────────────────────────────────────────
const HOST = "localhost";
const PORT = 3000;
const PATH = "/v1/responses";
const BODY = JSON.stringify({
    model: "ping-pong",
    input: "What is the weather like in Paris?",
    stream: true,
});

// ── Request ───────────────────────────────────────────────────────────────────
const options = {
    hostname: HOST,
    port: PORT,
    path: PATH,
    method: "POST",
    headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
        "Content-Length": Buffer.byteLength(BODY),
    },
};

console.log(`Sending streaming request to http://${HOST}:${PORT}${PATH} …\n`);

const req = http.request(options, (res) => {
    console.log(`HTTP ${res.statusCode} ${res.statusMessage ?? ""}`);
    console.log("Headers:", JSON.stringify(res.headers, null, 2), "\n");

    let frameCount = 0;

    res.on("data", (chunk) => {
        const raw = chunk.toString();
        const lines = raw.split("\n");
        for (const line of lines) {
            if (line.startsWith("data: ")) {
                const data = line.slice("data: ".length);
                if (data === "[DONE]") {
                    console.log("\n[DONE] — stream finished.");
                    return;
                }
                frameCount++;
                try {
                    const event = JSON.parse(data);
                    console.log(
                        `Frame ${frameCount}: type=${event.type ?? "?"} output_index=${event.output_index ?? "?"} seq=${event.sequence_number ?? "?"}`,
                    );
                } catch {
                    console.log(`Frame ${frameCount} (raw): ${data}`);
                }
            } else if (line.startsWith("event: ")) {
                // SSE event name — print but don't count
                process.stdout.write(line + "\n");
            }
        }
    });

    res.on("end", () => {
        console.log(`\nTotal frames received: ${frameCount}`);
    });

    res.on("error", (err) => {
        console.error("Response error:", err.message);
        process.exit(1);
    });
});

req.on("error", (err) => {
    console.error(
        `Connection error: ${err.message}\n` +
            "Is the server running? Start it with: pnpm dev:server",
    );
    process.exit(1);
});

req.write(BODY);
req.end();
