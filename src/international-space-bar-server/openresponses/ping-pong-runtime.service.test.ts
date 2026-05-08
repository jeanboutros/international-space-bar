import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ILogger } from "../common/interfaces/index.js";
import { PingPongRuntimeService } from "./ping-pong-runtime.service.js";
import type { Message, OutputTextContent } from "./responses.types.js";

function makeNoopLogger(): ILogger {
    return {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
        trace: () => {},
        fatal: () => {},
        child: makeNoopLogger,
    };
}

void describe("PingPongRuntimeService", () => {
    const service = new PingPongRuntimeService(makeNoopLogger());

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
        const msg = result.output[0] as Message;
        assert.ok(msg.id.startsWith("msg_"));
        assert.equal(msg.type, "message");
        assert.equal(msg.role, "assistant");
        const content = msg.content[0] as OutputTextContent;
        assert.equal(content.type, "output_text");
        assert.equal(content.text, "pong");
        assert.deepStrictEqual(content.annotations, []);

        assert.deepStrictEqual(result.usage, {
            input_tokens: 0,
            output_tokens: 1,
            total_tokens: 1,
            input_tokens_details: { cached_tokens: 0 },
            output_tokens_details: { reasoning_tokens: 0 },
        });
    });
});
