import { tool } from "@langchain/core/tools";
import { z } from "zod";

const weatherSchema = z.object({
    location: z.string().min(1, "Location cannot be empty"),
});

type WeatherSchema = z.infer<typeof weatherSchema>;

const weatherToolSchema = {
    name: "get_weather",
    description:
        "Get the current weather for a given location. Input should be a string representing the location, e.g., 'New York City'.",
    schema: weatherSchema,
};

function weatherFunction({ location }: WeatherSchema) {
    // Mock implementation - replace with actual API call to a weather service
    return {
        location,
        temperatureCelsius: 25, // Mock temperature
    };
}

const getWeather = tool(weatherFunction, weatherToolSchema);

const TOOL_INSTRUCTION = `Use the "get_weather" tool to retrieve the current weather for a given location.
The tool accepts a location string and returns the current temperature in Celsius.
`;

export { getWeather, TOOL_INSTRUCTION, type WeatherSchema };
