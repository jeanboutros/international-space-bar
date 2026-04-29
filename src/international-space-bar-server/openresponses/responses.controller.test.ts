import "reflect-metadata";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import { after, before, describe, it } from "node:test";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../app.module.js";
import {
    AGENT_RUNTIME_PORT,
    type AgentInvokeRequest,
    type AgentRuntimePort,
} from "./agent-runtime.port.js";
import type {
    Message,
    OutputTextContent,
    ResponseResource,
    ResponseStreamEvent,
    Usage,
} from "./responses.types.js";

const VALID_BODY = { model: "ping-pong", input: "ping" };
const AUTH_HEADER = "Bearer test-key";

void describe("POST /v1/responses", () => {
    let app: INestApplication;
    let server: Server;

    before(async () => {
        process.env.ISB_PROJECT_ENVIRONMENT = "test";
        process.env.ISB_OPENRESPONSES_API_KEY = "test-key";
        const moduleRef = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();
        app = moduleRef.createNestApplication();
        await app.init();
        server = app.getHttpServer() as Server;
    });

    after(async () => {
        await app.close();
    });

    void it("returns 200 with pong response for valid request", async () => {
        const res = await request(server)
            .post("/v1/responses")
            .set("Authorization", AUTH_HEADER)
            .send(VALID_BODY)
            .expect(200);

        const body = res.body as ResponseResource;
        assert.equal(body.object, "response");
        assert.equal(body.status, "completed");
        assert.equal(body.model, "ping-pong");
        const msg = body.output[0] as Message;
        const content = msg.content[0] as OutputTextContent;
        assert.equal(content.text, "pong");
    });

    void it("response shape has correct fields and prefixes", async () => {
        const res = await request(server)
            .post("/v1/responses")
            .set("Authorization", AUTH_HEADER)
            .send(VALID_BODY)
            .expect(200);

        const body = res.body as ResponseResource;

        assert.ok(body.id.startsWith("resp_"), `id should start with resp_, got ${body.id}`);
        assert.equal(typeof body.created_at, "number");
        assert.ok(Array.isArray(body.output));

        const msg = body.output[0] as Message;
        assert.ok(msg.id.startsWith("msg_"), `message id should start with msg_, got ${msg.id}`);
        assert.equal(msg.type, "message");
        assert.equal(msg.role, "assistant");
        assert.equal(msg.status, "completed");
        const content = msg.content[0] as OutputTextContent;
        assert.equal(content.type, "output_text");
        assert.deepStrictEqual(content.annotations, []);

        assert.ok(body.usage);
        const usage = body.usage as Usage;
        assert.equal(usage.input_tokens, 0);
        assert.equal(usage.output_tokens, 1);
        assert.equal(usage.total_tokens, 1);
    });

    void it("returns 401 without authorization header", async () => {
        await request(server).post("/v1/responses").send(VALID_BODY).expect(401);
    });

    void it("returns 401 with invalid bearer token", async () => {
        await request(server)
            .post("/v1/responses")
            .set("Authorization", "Bearer wrong-key")
            .send(VALID_BODY)
            .expect(401);
    });

    void it("returns 400 when model is missing from body", async () => {
        await request(server)
            .post("/v1/responses")
            .set("Authorization", AUTH_HEADER)
            .send({ input: "ping" })
            .expect(400);
    });

    void it("accepts extra unknown fields (looseObject passthrough)", async () => {
        const res = await request(server)
            .post("/v1/responses")
            .set("Authorization", AUTH_HEADER)
            .send({ ...VALID_BODY, custom_field: "extra" })
            .expect(200);

        const body = res.body as ResponseResource;
        assert.equal(body.status, "completed");
    });

    /**
     * WHAT: `model: ""` (empty string) is rejected with HTTP 400.
     * WHY: B-1 — ZodValidationPipe runs CreateResponseSchema; z.string().min(1) rejects empty
     *      strings and throws BadRequestException, which maps to HTTP 400.
     * STEPS:
     *   Arrange — build a body with model set to empty string
     *   Act — POST /v1/responses with auth
     *   Assert — HTTP 400 (validation failure)
     */
    void it("returns 400 when model is an empty string", async () => {
        // --- Arrange ---
        const body = { model: "", input: "ping" };

        // --- Act / Assert ---
        await request(server)
            .post("/v1/responses")
            .set("Authorization", AUTH_HEADER)
            .send(body)
            .expect(400);
    });

    /**
     * WHAT: `model: null` is rejected with HTTP 400.
     * WHY: B-2 — ZodValidationPipe runs CreateResponseSchema; z.string().min(1) rejects null
     *      and throws BadRequestException, which maps to HTTP 400.
     * STEPS:
     *   Arrange — build a body with model set to null
     *   Act — POST /v1/responses with auth
     *   Assert — HTTP 400 (validation failure)
     */
    void it("returns 400 when model is null", async () => {
        // --- Arrange ---
        const body = { model: null, input: "ping" };

        // --- Act / Assert ---
        await request(server)
            .post("/v1/responses")
            .set("Authorization", AUTH_HEADER)
            .send(body)
            .expect(400);
    });

    /**
     * WHAT: `input` provided as a valid ItemParam array is accepted with HTTP 200.
     * WHY: B-3 — CreateResponseSchema allows input as an item array (union type);
     *      itemParamSchema requires structured objects, not plain strings.
     *      The service coerces the array to a JSON string before invoking the runtime.
     * STEPS:
     *   Arrange — build a body with input as a one-element assistant message array
     *   Act — POST /v1/responses with auth
     *   Assert — HTTP 200 and body.status is "completed"
     */
    void it("returns 200 when input is a valid ItemParam array", async () => {
        // --- Arrange ---
        // itemParamSchema is a discriminated union — a minimal valid item is an assistant message
        const body = {
            model: "isb-ping",
            input: [{ type: "message", role: "assistant", content: "hello" }],
        };

        // --- Act ---
        const res = await request(server)
            .post("/v1/responses")
            .set("Authorization", AUTH_HEADER)
            .send(body)
            .expect(200);

        // --- Assert ---
        // Array input passes schema validation and the runtime returns a completed response.
        assert.equal((res.body as ResponseResource).status, "completed");
    });
});

// ── Minimal stub runtime for B-4 ──────────────────────────────────────────────

async function* emptyStream(): AsyncGenerator<ResponseStreamEvent> {
    // Yields no events — the controller writes "data: [DONE]" after the empty loop.
}

const streamStubRuntime: AgentRuntimePort = {
    invoke(_request: AgentInvokeRequest): Promise<ResponseResource> {
        // invoke is not exercised by the B-4 streaming test
        return Promise.reject(new Error("invoke not used in B-4 streaming schema test"));
    },
    stream(_request: AgentInvokeRequest): AsyncIterable<ResponseStreamEvent> {
        return emptyStream();
    },
};

/**
 * CreateResponseSchema — streaming path integration
 * Verifies that a body with stream: true routes to the SSE endpoint (B-4).
 * Uses a stub runtime to avoid a live Ollama dependency.
 */
void describe("POST /v1/responses — streaming schema validation", () => {
    let app: INestApplication;
    let server: Server;

    before(async () => {
        process.env.ISB_PROJECT_ENVIRONMENT = "test";
        process.env.ISB_OPENRESPONSES_API_KEY = "test-key";

        const moduleRef = await Test.createTestingModule({
            imports: [AppModule],
        })
            .overrideProvider(AGENT_RUNTIME_PORT)
            .useValue(streamStubRuntime)
            .compile();

        app = moduleRef.createNestApplication();
        await app.init();
        server = app.getHttpServer() as Server;
    });

    after(async () => {
        await app.close();
    });

    /**
     * WHAT: `stream: true` routes to the SSE path with HTTP 200 and text/event-stream.
     * WHY: B-4 — verifies that the schema correctly passes stream:true to the controller,
     *      which sets the SSE Content-Type and writes "data: [DONE]" at stream end.
     * STEPS:
     *   Arrange — build body with stream: true; use stub runtime (no Ollama needed)
     *   Act — POST /v1/responses, buffer the raw SSE body
     *   Assert — HTTP 200, Content-Type text/event-stream, body contains "data: [DONE]"
     */
    void it("returns 200 with text/event-stream and [DONE] terminator when stream is true", async () => {
        // --- Arrange ---
        const body = { model: "isb-ping", input: "ping", stream: true };

        // --- Act ---
        const res = await request(server)
            .post("/v1/responses")
            .set("Authorization", "Bearer test-key")
            .send(body)
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

        // --- Assert ---
        assert.equal(res.status, 200);

        // Content-Type must be text/event-stream (controller sets this for stream:true)
        const contentType = (res.headers["content-type"] as string | undefined) ?? "";
        assert.ok(
            contentType.includes("text/event-stream"),
            `Expected text/event-stream, got "${contentType}"`,
        );

        // The controller always writes "data: [DONE]" after the event loop ends
        const rawBody = res.body as string;
        assert.ok(
            rawBody.includes("data: [DONE]"),
            `Expected body to contain "data: [DONE]", got:\n${rawBody}`,
        );
    });
});
