/**
 * Tests for: LoggingModule (NestJS @Global() module)
 * Source: src/international-space-bar-server/logging/logging.module.ts
 * Ticket: isb-0055
 *
 * Purpose: Integration tests that verify PinoLoggerService is resolvable
 * when LoggingModule is imported, and that @Global() makes the LOGGER token
 * injectable into modules that do NOT import LoggingModule themselves.
 * Uses @nestjs/testing Test.createTestingModule — no HTTP server started.
 */
import "reflect-metadata";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Inject, Injectable, Module } from "@nestjs/common";
import type { TestingModule } from "@nestjs/testing";
import { Test } from "@nestjs/testing";
import { ApplicationConfigService } from "../application-config/application-config.service.js";
import type { ILogger } from "../common/interfaces/logger.port.js";
import { LOGGER } from "../common/interfaces/logger.port.js";
import { LoggingModule } from "./logging.module.js";
import { PinoLoggerService } from "./pino-logger.service.js";

// -------------------------------------------------------------------------
// Inline fixtures used only in this test file
// -------------------------------------------------------------------------

/**
 * Minimal mock for ApplicationConfigService.
 * Provides getConfig() and environment without loading YAML or secrets.
 */
const mockConfigService = {
    getConfig: () => ({
        version: 1,
        logger: { type: "pino", logFilePath: "", level: "warn" as const },
    }),
    environment: "test",
    get: () => undefined,
} as unknown as ApplicationConfigService;

/**
 * A consumer service defined inline to test global injection.
 * It does NOT live in a module that imports LoggingModule — only @Global()
 * makes the LOGGER token available here via ILogger interface.
 */
@Injectable()
class TestConsumerService {
    constructor(@Inject(LOGGER) public readonly logger: ILogger) {}
}

/**
 * An isolated module that intentionally does NOT import LoggingModule.
 * Used to verify that @Global() providers are reachable without an explicit import.
 */
@Module({ providers: [TestConsumerService], exports: [TestConsumerService] })
class IsolatedConsumerModule {}

// -------------------------------------------------------------------------
// Tests
// -------------------------------------------------------------------------

/**
 * LoggingModule — NestJS module integration.
 * Verifies DI resolution and global injection scope.
 */
void describe("LoggingModule", () => {
    // -----------------------------------------------------------------------
    // Basic resolution
    // -----------------------------------------------------------------------

    /**
     * LoggingModule — PinoLoggerService resolution.
     * Tests that the module wires PinoLoggerService as an injectable provider.
     */
    void describe("PinoLoggerService resolution", () => {
        let moduleRef: TestingModule;

        before(async () => {
            // overrideProvider is required here (not providers:[]) because NestJS
            // resolves ApplicationConfigService within LoggingModule's own module
            // context — a root-level providers[] entry is not visible there.
            moduleRef = await Test.createTestingModule({
                imports: [LoggingModule],
            })
                .overrideProvider(ApplicationConfigService)
                .useValue(mockConfigService)
                .compile();
        });

        after(async () => {
            await moduleRef.close();
        });

        /**
         * WHAT: PinoLoggerService is resolvable from a module that imports LoggingModule.
         * WHY: AC-5 — LoggingModule must provide and export PinoLoggerService so any
         *      NestJS module can inject it after @Global() registration.
         * STEPS:
         *   Arrange — test module compiled with LoggingModule and mocked config service
         *   Act — call moduleRef.get(PinoLoggerService)
         *   Assert — the returned value is an instance of PinoLoggerService
         */
        void it("resolves PinoLoggerService via moduleRef.get()", () => {
            // --- Act ---
            const service = moduleRef.get(PinoLoggerService);

            // --- Assert ---
            assert.ok(service, "PinoLoggerService should be resolvable from the module");
            assert.ok(
                service instanceof PinoLoggerService,
                "resolved provider should be an instance of PinoLoggerService",
            );
        });

        /**
         * WHAT: The resolved PinoLoggerService instance satisfies the ILogger contract.
         * WHY: Ensures the DI-resolved instance is fully functional, not a bare proxy.
         * STEPS:
         *   Arrange — use moduleRef from before()
         *   Act — get the service and inspect its methods
         *   Assert — info, warn, error, debug, trace, fatal, child are all functions
         */
        void it("resolved service exposes all ILogger methods", () => {
            // --- Act ---
            const service = moduleRef.get(PinoLoggerService);

            // --- Assert ---
            for (const method of [
                "info",
                "warn",
                "error",
                "debug",
                "trace",
                "fatal",
                "child",
            ] as const) {
                assert.equal(
                    typeof service[method],
                    "function",
                    `Expected service.${method} to be a function on the DI-resolved instance`,
                );
            }
        });
    });

    // -----------------------------------------------------------------------
    // Global injection (AC-5)
    // -----------------------------------------------------------------------

    /**
     * LoggingModule — @Global() injection via LOGGER token.
     * Verifies that the LOGGER token (bound to ILogger) is injectable in modules
     * that do NOT explicitly import LoggingModule.
     */
    void describe("@Global() injection", () => {
        let moduleRef: TestingModule;

        before(async () => {
            // IsolatedConsumerModule does NOT import LoggingModule.
            // @Global() on LoggingModule makes PinoLoggerService available everywhere.
            // overrideProvider is required so the mock is visible inside LoggingModule's context.
            moduleRef = await Test.createTestingModule({
                imports: [LoggingModule, IsolatedConsumerModule],
            })
                .overrideProvider(ApplicationConfigService)
                .useValue(mockConfigService)
                .compile();
        });

        after(async () => {
            await moduleRef.close();
        });

        /**
         * WHAT: A module that does NOT import LoggingModule can still inject
         *       via the LOGGER token because LoggingModule is decorated @Global().
         * WHY: AC-5 — @Global() is the mechanism that removes the need for every
         *      consuming module to add LoggingModule to its imports array.
         *      Callers must inject via LOGGER token / ILogger interface, not the
         *      concrete PinoLoggerService class (which is no longer exported).
         *      This test proves the @Global() decorator is active and the token
         *      resolves to a fully-functional ILogger implementation.
         * STEPS:
         *   Arrange — IsolatedConsumerModule imports nothing; it only declares
         *             TestConsumerService which constructor-injects via LOGGER token
         *   Act — compile the testing module and resolve TestConsumerService
         *   Assert — TestConsumerService.logger exposes the ILogger method surface
         */
        void it("injects ILogger (via LOGGER token) into a module that does not import LoggingModule", () => {
            // --- Act ---
            const consumer = moduleRef.get(TestConsumerService);

            // --- Assert ---
            assert.ok(consumer, "TestConsumerService should be resolvable");
            // Verify the injected value satisfies the ILogger contract rather than
            // asserting the concrete class — callers must not depend on PinoLoggerService.
            for (const method of [
                "info",
                "warn",
                "error",
                "debug",
                "trace",
                "fatal",
                "child",
            ] as const) {
                assert.equal(
                    typeof consumer.logger[method],
                    "function",
                    `LOGGER token must resolve to an ILogger — expected logger.${method} to be a function`,
                );
            }
        });
    });
});
