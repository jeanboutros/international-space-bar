import React, { useCallback } from "react";
import { Box, useWindowSize } from "ink";
import type { AppContext } from "../interfaces/app-context.interface.js";
import type { IAgent, IWorkflowRunner, WorkflowEvent } from "../interfaces/agent.interface.js";
import InputBar from "./InputBar.js";
import InterruptPrompt from "./InterruptPrompt.js";
import LogPane from "./LogPane.js";
import MessageList from "./MessageList.js";
import StatusPane from "./StatusPane.js";
import { colors, layout } from "./theme.js";
import { useAppStore } from "./store.js";
import { extractTokenUsage, mapWorkflowMessages } from "./workflow-result-mapper.js";

interface TuiAppProps {
    readonly agent: IAgent;
    readonly ctx: AppContext;
    readonly threadId: string;
    readonly workflow: IWorkflowRunner;
}

/**
 * Process a streaming workflow, updating the store with events as they arrive.
 *
 * Falls back to `workflow.invoke()` if streaming is unavailable.
 */
async function processWithStreaming(
    query: string,
    workflow: IWorkflowRunner,
    ctx: AppContext,
): Promise<void> {
    const store = useAppStore;
    const { addMessage, accumulateTokens, setProcessing, setSatisfactionScore, setLastEvent } =
        store.getState();

    try {
        // Try streaming first
        for await (const event of workflow.stream(query)) {
            setLastEvent(event);

            switch (event.type) {
                case "node_start":
                    ctx.logger.debug({ node: event.node }, "Workflow node started");
                    break;

                case "satisfaction_check":
                    setSatisfactionScore(event.score);
                    store.getState().incrementIteration();
                    ctx.logger.info(
                        { score: event.score, iteration: event.iteration },
                        "Satisfaction check",
                    );
                    break;

                case "loop_retry":
                    addMessage({
                        role: "system",
                        content: `🔄 Iteration ${event.iteration}: Refining with feedback...`,
                    });
                    break;

                case "node_complete":
                    if (event.output) {
                        addMessage({ role: "system", content: `✓ ${event.node} completed` });
                    }
                    break;

                case "complete": {
                    const chatMessages = mapWorkflowMessages(event.result.messages);
                    accumulateTokens(extractTokenUsage(event.result.messages));

                    if (chatMessages.length > 0) {
                        addMessage(chatMessages);
                    }

                    if (chatMessages.length === 0 && event.result.finalResponse) {
                        addMessage({ role: "agent", content: event.result.finalResponse });
                    } else if (event.result.finalResponse) {
                        // Ensure the final response is always shown even if
                        // individual messages were already extracted
                        addMessage({ role: "agent", content: event.result.finalResponse });
                    }
                    break;
                }
            }
        }
    } catch (err) {
        // Streaming failed — fall back to invoke
        ctx.logger.warn({ err }, "Streaming failed, falling back to invoke");

        const result = await workflow.invoke(query);
        const chatMessages = mapWorkflowMessages(result.messages);
        accumulateTokens(extractTokenUsage(result.messages));

        if (chatMessages.length > 0) {
            addMessage(chatMessages);
        }

        if (chatMessages.length === 0 && result.finalResponse) {
            addMessage({ role: "agent", content: result.finalResponse });
        }
    }
}

export default function TuiApp({ agent, ctx, threadId, workflow }: TuiAppProps) {
    const { columns, rows } = useWindowSize();
    const sidebarWidth = Math.max(
        layout.sidebarMinWidth,
        Math.floor(columns * layout.sidebarPercent),
    );
    const mainWidth = columns - sidebarWidth;

    // ── Selectors (subscribe to individual slices) ──────────────────
    const messages = useAppStore((s) => s.messages);
    const isProcessing = useAppStore((s) => s.isProcessing);
    const currentInterrupt = useAppStore((s) => s.currentInterrupt);
    const tokenUsage = useAppStore((s) => s.tokenUsage);
    const currentIteration = useAppStore((s) => s.currentIteration);
    const satisfactionScore = useAppStore((s) => s.satisfactionScore);
    const messageCount = messages.length;

    // ── Actions (stable references — no stale closures) ───────────────
    const { addMessage, accumulateTokens, setProcessing, setCurrentInterrupt } = useAppStore();

    const handleSubmit = useCallback(
        async (query: string) => {
            ctx.logger.info({ query }, "User submitted query");
            addMessage({ role: "user", content: query });

            // Reset iteration state for a new query
            useAppStore.getState().resetIteration();
            useAppStore.getState().setSatisfactionScore(null);
            setProcessing(true);

            try {
                await processWithStreaming(query, workflow, ctx);
            } catch (err) {
                const errMsg = err instanceof Error ? err.message : String(err);
                addMessage({ role: "system", content: `Error: ${errMsg}` });
            } finally {
                // Always read the latest state (not a stale closure)
                if (!useAppStore.getState().currentInterrupt) {
                    setProcessing(false);
                }
            }
        },
        [workflow, ctx, addMessage, setProcessing],
    );

    const handleInterruptDecision = useCallback(
        async (decision: Record<string, unknown>) => {
            const interruptInfo = useAppStore.getState().currentInterrupt;
            setCurrentInterrupt(null);
            setProcessing(true);

            addMessage({
                role: "system",
                content: `Decision: ${decision.type as string} for ${interruptInfo?.toolName ?? "unknown"}`,
            });

            try {
                const result = await agent.resume(decision, ctx, threadId);
                accumulateTokens(result.tokenUsage);

                const chatMessages = mapWorkflowMessages(result.messages);
                if (chatMessages.length > 0) {
                    addMessage(chatMessages);
                } else if (result.lastContent) {
                    addMessage({ role: "agent", content: result.lastContent });
                }

                if (result.interrupts && result.interrupts.length > 0) {
                    const next = result.interrupts[0];
                    if (next) setCurrentInterrupt(next);
                }
            } catch (err) {
                const errMsg = err instanceof Error ? err.message : String(err);
                addMessage({ role: "system", content: `Resume error: ${errMsg}` });
            } finally {
                if (!useAppStore.getState().currentInterrupt) {
                    setProcessing(false);
                }
            }
        },
        [agent, ctx, threadId, addMessage, accumulateTokens, setCurrentInterrupt, setProcessing],
    );

    return (
        <Box flexDirection="row" width={columns} height={rows}>
            {/* Left column — main responses + input */}
            <Box flexDirection="column" width={mainWidth} height={rows}>
                <MessageList messages={messages} />
                {currentInterrupt ? (
                    <InterruptPrompt
                        interrupt={currentInterrupt}
                        onDecision={(d) => void handleInterruptDecision(d)}
                    />
                ) : (
                    <InputBar isProcessing={isProcessing} onSubmit={(q) => void handleSubmit(q)} />
                )}
            </Box>

            {/* Right column — status (natural height) + logs (fill rest) */}
            <Box
                flexDirection="column"
                width={sidebarWidth}
                height={rows}
                borderStyle="single"
                borderColor={colors.border}
                borderLeft
                borderTop={false}
                borderBottom={false}
                borderRight={false}
            >
                <StatusPane
                    agentName={agent.displayName}
                    isProcessing={isProcessing}
                    messageCount={messageCount}
                    tokenUsage={tokenUsage}
                    threadId={threadId}
                    currentIteration={currentIteration}
                    satisfactionScore={satisfactionScore}
                />
                <LogPane />
            </Box>
        </Box>
    );
}
