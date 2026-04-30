/**
 * Re-exports the ILogger interface from the inner interfaces/ layer.
 *
 * This is the first intentional cross-layer re-export from the core interfaces
 * into the server layer. It is permitted by AGENTS.md because `interfaces/` is
 * the innermost layer and may be imported by any outer layer via port contracts.
 * This file is the single declared boundary point for that import.
 */
export type { ILogger } from "../../../international-space-bar/interfaces/logger.interface.js";

export const LOGGER = Symbol("LOGGER");
