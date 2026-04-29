import "reflect-metadata";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import { after, before, describe, it } from "node:test";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../app.module.js";
import type { Message, OutputTextContent, ResponseResource, Usage } from "./responses.types.js";

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
});
