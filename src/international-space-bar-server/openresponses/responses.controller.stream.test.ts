// Integration test for the SSE streaming endpoint.
// Uses a mocked AgentRuntimePort — no live Ollama instance required.
import "reflect-metadata";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import { after, before, describe, it } from "node:test";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../app.module.js";
import type { AgentInvokeRequest } from "./agent-runtime.port.js";
import { AGENT_RUNTIME_PORT, type AgentRuntimePort } from "./agent-runtime.port.js";
import type { ResponseResource, ResponseStreamEvent } from "./responses.types.js";

const AUTH_HEADER = "Bearer test-key";
const STREAM_BODY = { model: "ping-pong", input: "hello", stream: true };

// ── Deterministic 6-item mock ──────────────────────────────────────────────────
// Emits one output_item.done per output index, in the required sequence order.
const MOCK_ITEM_TYPES = [
    "reasoning",
    "message",
    "reasoning",
    "function_call",
    "reasoning",
    "message",
] as const;

// eslint-disable-next-line @typescript-eslint/require-await -- async generator required for AsyncIterable<T> contract; this mock has no real I/O
async function* mockStream(): AsyncIterable<ResponseStreamEvent> {
    for (let i = 0; i < MOCK_ITEM_TYPES.length; i++) {
        const itemType = MOCK_ITEM_TYPES[i];
        yield {
            type: "response.output_item.done",
            sequence_number: i,
            output_index: i,
            item: { id: `item_${i}`, type: itemType },
        } satisfies ResponseStreamEvent;
    }
}

const mockRuntime: AgentRuntimePort = {
    invoke(_request: AgentInvokeRequest): Promise<ResponseResource> {
        return Promise.reject(new Error("invoke not used in stream test"));
    },
    stream(_request: AgentInvokeRequest): AsyncIterable<ResponseStreamEvent> {
        return mockStream();
    },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Extract `data:` lines from an SSE response body, excluding `[DONE]`. */
function parseDataLines(body: string): string[] {
    return body
        .split("\n")
        .filter((line) => line.startsWith("data: ") && line !== "data: [DONE]")
        .map((line) => line.slice("data: ".length));
}

// ── Tests ──────────────────────────────────────────────────────────────────────

void describe("POST /v1/responses (stream: true)", () => {
    let app: INestApplication;
    let server: Server;

    before(async () => {
        process.env.ISB_PROJECT_ENVIRONMENT = "test";
        process.env.ISB_OPENRESPONSES_API_KEY = "test-key";

        const moduleRef = await Test.createTestingModule({
            imports: [AppModule],
        })
            .overrideProvider(AGENT_RUNTIME_PORT)
            .useValue(mockRuntime)
            .compile();

        app = moduleRef.createNestApplication();
        await app.init();
        server = app.getHttpServer() as Server;
    });

    after(async () => {
        await app.close();
    });

    void it("returns exactly 6 data lines from the mock stream", async () => {
        const res = await request(server)
            .post("/v1/responses")
            .set("Authorization", AUTH_HEADER)
            .send(STREAM_BODY)
            .buffer(true)
            .parse((res, callback) => {
                let data = "";
                res.on("data", (chunk: Buffer) => {
                    data += chunk.toString();
                });
                res.on("end", () => {
                    callback(null, data);
                });
            });

        const body = res.body as string;
        const dataLines = parseDataLines(body);

        assert.equal(
            dataLines.length,
            6,
            `expected 6 data lines, got ${dataLines.length}:\n${body}`,
        );
    });

    void it("emits event types in the correct order: reasoning, message, reasoning, function_call, reasoning, message", async () => {
        const res = await request(server)
            .post("/v1/responses")
            .set("Authorization", AUTH_HEADER)
            .send(STREAM_BODY)
            .buffer(true)
            .parse((res, callback) => {
                let data = "";
                res.on("data", (chunk: Buffer) => {
                    data += chunk.toString();
                });
                res.on("end", () => {
                    callback(null, data);
                });
            });

        const body = res.body as string;
        const dataLines = parseDataLines(body);
        const events = dataLines.map((line) => JSON.parse(line) as Record<string, unknown>);

        const itemTypes = events.map((e) => (e.item as Record<string, unknown>)?.type);
        assert.deepStrictEqual(itemTypes, [
            "reasoning",
            "message",
            "reasoning",
            "function_call",
            "reasoning",
            "message",
        ]);
    });

    void it("each frame has valid JSON and correct output_index 0–5", async () => {
        const res = await request(server)
            .post("/v1/responses")
            .set("Authorization", AUTH_HEADER)
            .send(STREAM_BODY)
            .buffer(true)
            .parse((res, callback) => {
                let data = "";
                res.on("data", (chunk: Buffer) => {
                    data += chunk.toString();
                });
                res.on("end", () => {
                    callback(null, data);
                });
            });

        const body = res.body as string;
        const dataLines = parseDataLines(body);

        for (let i = 0; i < dataLines.length; i++) {
            const line = dataLines[i];
            assert.doesNotThrow(
                () => JSON.parse(line ?? ""),
                `frame ${i} is not valid JSON: ${line}`,
            );
            const event = JSON.parse(line ?? "") as Record<string, unknown>;
            assert.equal(
                event.output_index,
                i,
                `frame ${i} has output_index ${String(event.output_index)}, expected ${i}`,
            );
        }
    });

    void it("each frame has event type response.output_item.done", async () => {
        const res = await request(server)
            .post("/v1/responses")
            .set("Authorization", AUTH_HEADER)
            .send(STREAM_BODY)
            .buffer(true)
            .parse((res, callback) => {
                let data = "";
                res.on("data", (chunk: Buffer) => {
                    data += chunk.toString();
                });
                res.on("end", () => {
                    callback(null, data);
                });
            });

        const body = res.body as string;
        const dataLines = parseDataLines(body);
        const events = dataLines.map((line) => JSON.parse(line) as Record<string, unknown>);

        for (const [i, event] of events.entries()) {
            assert.equal(
                event.type,
                "response.output_item.done",
                `frame ${i} has unexpected event type: ${String(event.type)}`,
            );
        }
    });

    void it("returns 401 for streaming request without authorization", async () => {
        await request(server).post("/v1/responses").send(STREAM_BODY).expect(401);
    });
});
