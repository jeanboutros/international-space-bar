import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const getWeather = tool(async ({ location }: { location: string }) => {
    // Mock implementation - replace with actual API call to a weather service
    return {
        location,
        temperatureCelsius: 25, // Mock temperature
    }
},
    {
        name: "get_weather",
        description: "Get the current weather for a given location. Input should be a string representing the location, e.g., 'New York City'.",
        schema: z.object({
            location: z.string().min(1, "Location cannot be empty"),
        }),
    }
);