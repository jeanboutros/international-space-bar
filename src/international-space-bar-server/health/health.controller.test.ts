import "reflect-metadata";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import { after, before, describe, it } from "node:test";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../app.module.js";

void describe("GET /health", () => {
    let app: INestApplication;
    let server: Server;

    before(async () => {
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

    void it("returns 200 with status ok, service name, and version", async () => {
        const res = await request(server).get("/health").expect(200);

        assert.deepStrictEqual(res.body as Record<string, unknown>, {
            status: "ok",
            service: "international-space-bar",
            version: "0.1.0",
        });
    });
});
