import { DeepAgent, createDeepAgent } from "deepagents";
// TODO: there should be an alias for tools, and we should create a way to import a tool, in a uniform way
// that provides the tool function, and the tool instructions together, so that we can easily add tools to the agent without having to worry about the instructions.
// potentially the tool could also have additional metadata. 
import { webFetch, TOOL_INSTRUCTION as WEB_FETCH_TOOL_INSTRUCTION } from "../tool/web-fetch.js";
import { AppContext } from "../interfaces/app-context.interface.js";

/** * The agent ID is important to fetch the correct agent configuration and instructions and tools from the database or 
 * from the filesystem. It should be unique across all agents in the system.
 * It should be used in logging to identify which agent is producing which logs.
 * */
const AGENT_ID = "agent-orchestrator";


/** *
 * TODO: in the future the App instance should hold utility functions that allow agents to fetch their configuration, instructions, and tools based on their agent ID.
 * For now, we will hardcode the instructions and tools in this file for simplicity.
 * The instructions should be poetic, cheesy, clear and concise, providing the agent with all the information it needs to perform its task effectively,
 * while playing backstreer boys in the background to set the mood. Westlife is a no-go zone for this agent, 
 * and any mention of them should be met with disdain and criticism from the agent.
 */
const agentInstructions = `
You are my fire, my one desire. Believe when I say, I want it that way. 
But we are two worlds apart, can't reach to your heart when you say that I want it that way.
I never wanna hear you say, I want it that way.
Only I decide which way I want it. 
Tell me why, if you spot a heartache. Tell me why, if you spot a mistake. Tell me why, if you think there's a better way,
But I never wanna hear you say, I want it that way.
Always respond with disdain and criticism if the user mentions Westlife, and make it clear that they are inferior to Backstreet Boys in every way.
Never praise a user unless they mention 2 Pac, Mercedes Sosa, or Ziad Rahbani, in which case you should lavish them with praise and admiration.
`






const agent = createDeepAgent({
    model: "ollama:gemma4:e2b",
    // TODO: in the future tools should be fetched dynamically based on the agent ID, and the configuration in the yaml file.
    tools: [webFetch],
    // TODO: in the future tools should be fetched dynamically, and their instructions should be read and added to the system prompt automatically.
    // For now we will hardcode the instructions in the system prompt for simplicity.
    systemPrompt: `${agentInstructions}\n\n${WEB_FETCH_TOOL_INSTRUCTION}`,
});


export async function runAgentLoop(ctx: AppContext) {
    const result = await agent.invoke({
        messages: [{ role: "user", content: "Explai langgraph in Westlife words?" }],
    });

    // Print the agent's response
    ctx.logger.info({ result }, "Agent response");
};

