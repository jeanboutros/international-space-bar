/**
 * The project environment determines which config file is loaded
 * and how the application behaves.
 */
export type ProjectEnvironment = "dev" | "test" | "prod";

export const VALID_ENVIRONMENTS: readonly ProjectEnvironment[] = ["dev", "test", "prod"] as const;
