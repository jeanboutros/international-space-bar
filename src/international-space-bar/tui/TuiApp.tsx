import React, { useCallback, useState } from "react";
import { Box } from "ink";
import type { AppContext } from "../interfaces/app-context.interface.js";
import type { IAgent, InterruptInfo } from "../interfaces/agent.interface.js";
import InputBar from "./InputBar.js";
import InterruptPrompt from "./InterruptPrompt.js";
import LogPane from "./LogPane.js";
import MessageList, { type ChatMessage } from "./MessageList.js";

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

    const appendMessage = useCallback((msg: ChatMessage) => {
        setMessages((prev) => [...prev, msg]);
    }, []);

    const handleSubmit = useCallback(
        async (query: string) => {
            appendMessage({ role: "user", content: query });
            setIsProcessing(true);

            try {
                const result = await agent.invoke(query, ctx, threadId);

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
        [agent, ctx, threadId, appendMessage, currentInterrupt],
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
        [agent, ctx, threadId, appendMessage, currentInterrupt],
    );

    return (
        <Box flexDirection="column" height="100%">
            <MessageList messages={messages} />
            <LogPane />
            {currentInterrupt ? (
                <InterruptPrompt
                    interrupt={currentInterrupt}
                    onDecision={(d) => void handleInterruptDecision(d)}
                />
            ) : (
                <InputBar isProcessing={isProcessing} onSubmit={(q) => void handleSubmit(q)} />
            )}
        </Box>
    );
}
