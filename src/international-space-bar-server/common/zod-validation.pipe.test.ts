import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException } from "@nestjs/common";
import { z } from "zod";
import { ZodValidationPipe } from "./zod-validation.pipe.js";

const TestSchema = z.object({ name: z.string().min(1) });

void describe("ZodValidationPipe", () => {
    const pipe = new ZodValidationPipe(TestSchema);

    void it("passes valid data through unchanged", () => {
        const input = { name: "test" };
        const result = pipe.transform(input);
        assert.deepStrictEqual(result, { name: "test" });
    });

    void it("throws BadRequestException on invalid data", () => {
        assert.throws(
            () => pipe.transform({ name: "" }),
            (err: unknown) => {
                assert.ok(err instanceof BadRequestException);
                return true;
            },
        );
    });

    void it("throws BadRequestException when required field is missing", () => {
        assert.throws(
            () => pipe.transform({}),
            (err: unknown) => {
                assert.ok(err instanceof BadRequestException);
                return true;
            },
        );
    });
});
