import React, { useCallback, useState } from "react";
import { Box } from "ink";
import type { AppContext } from "../interfaces/app-context.interface.js";
import type { IAgent, InterruptInfo, TokenUsage } from "../interfaces/agent.interface.js";
import InputBar from "./InputBar.js";
import InterruptPrompt from "./InterruptPrompt.js";
import LogPane from "./LogPane.js";
import MessageList, { type ChatMessage } from "./MessageList.js";
import StatusPane from "./StatusPane.js";

interface TuiAppProps {
    readonly agent: IAgent;
    readonly ctx: AppContext;
    readonly threadId: string;
}

export default function TuiApp({ agent, ctx, threadId }: TuiAppProps) {
    const [messages, setMessages] = useState<ChatMessage[]>([
        { role: "system", content: `Connected to ${agent.displayName}. Type a message to begin.` },
    ]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [currentInterrupt, setCurrentInterrupt] = useState<InterruptInfo | null>(null);
    const [tokenUsage, setTokenUsage] = useState<TokenUsage | null>(null);

    const appendMessage = useCallback((msg: ChatMessage) => {
        setMessages((prev) => [...prev, msg]);
    }, []);

    const accumulateTokens = useCallback((usage: TokenUsage | undefined) => {
        if (!usage) return;
        setTokenUsage((prev) =>
            prev
                ? {
                      inputTokens: prev.inputTokens + usage.inputTokens,
                      outputTokens: prev.outputTokens + usage.outputTokens,
                      totalTokens: prev.totalTokens + usage.totalTokens,
                  }
                : usage,
        );
    }, []);

    const handleSubmit = useCallback(
        async (query: string) => {
            appendMessage({ role: "user", content: query });
            setIsProcessing(true);

            try {
                const result = await agent.invoke(query, ctx, threadId);
                accumulateTokens(result.tokenUsage);

                if (result.lastContent) {
                    appendMessage({ role: "agent", content: result.lastContent });
                }

                if (result.interrupts && result.interrupts.length > 0) {
                    setCurrentInterrupt(result.interrupts[0]!);
                }
            } catch (err) {
                const errMsg = err instanceof Error ? err.message : String(err);
                appendMessage({ role: "system", content: `Error: ${errMsg}` });
            } finally {
                if (!currentInterrupt) {
                    setIsProcessing(false);
                }
            }
        },
        [agent, ctx, threadId, appendMessage, accumulateTokens, currentInterrupt],
    );

    const handleInterruptDecision = useCallback(
        async (decision: Record<string, unknown>) => {
            const interruptInfo = currentInterrupt;
            setCurrentInterrupt(null);
            setIsProcessing(true);

            appendMessage({
                role: "system",
                content: `Decision: ${decision.type as string} for ${interruptInfo?.toolName ?? "unknown"}`,
            });

            try {
                const result = await agent.resume(decision, ctx, threadId);
                accumulateTokens(result.tokenUsage);

                if (result.lastContent) {
                    appendMessage({ role: "agent", content: result.lastContent });
                }

                if (result.interrupts && result.interrupts.length > 0) {
                    setCurrentInterrupt(result.interrupts[0]!);
                }
            } catch (err) {
                const errMsg = err instanceof Error ? err.message : String(err);
                appendMessage({ role: "system", content: `Resume error: ${errMsg}` });
            } finally {
                setIsProcessing(false);
            }
        },
        [agent, ctx, threadId, appendMessage, accumulateTokens, currentInterrupt],
    );

    return (
        <Box flexDirection="row" height="100%">
            {/* Left column — main responses + input */}
            <Box flexDirection="column" flexGrow={1} flexBasis="70%">
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

            {/* Right column — status + logs */}
            <Box
                flexDirection="column"
                width={32}
                borderStyle="single"
                borderColor="gray"
                borderLeft
                borderTop={false}
                borderBottom={false}
                borderRight={false}
            >
                <StatusPane
                    agentName={agent.displayName}
                    isProcessing={isProcessing}
                    messageCount={messages.length}
                    tokenUsage={tokenUsage}
                    threadId={threadId}
                />
                <LogPane />
            </Box>
        </Box>
    );
}
