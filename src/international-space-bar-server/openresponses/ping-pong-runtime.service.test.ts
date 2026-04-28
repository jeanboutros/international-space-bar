import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PingPongRuntimeService } from "./ping-pong-runtime.service.js";

void describe("PingPongRuntimeService", () => {
    const service = new PingPongRuntimeService();

    void it("invoke() returns a completed response with pong text", async () => {
        const result = await service.invoke({
            model: "test-model",
            input: "ping",
            requestId: "req_test-123",
        });

        assert.equal(result.object, "response");
        assert.equal(result.status, "completed");
        assert.equal(result.model, "test-model");
        assert.ok(result.id.startsWith("resp_"));
        assert.equal(typeof result.created_at, "number");

        assert.equal(result.output.length, 1);
        const msg = result.output[0];
        assert.ok(msg.id.startsWith("msg_"));
        assert.equal(msg.type, "message");
        assert.equal(msg.role, "assistant");
        assert.equal(msg.content[0].type, "output_text");
        assert.equal(msg.content[0].text, "pong");
        assert.deepStrictEqual(msg.content[0].annotations, []);

        assert.deepStrictEqual(result.usage, {
            input_tokens: 0,
            output_tokens: 1,
            total_tokens: 1,
        });
    });
});
