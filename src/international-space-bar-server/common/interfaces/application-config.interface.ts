// ---------------------------------------------------------------------------
// Typed key-path helpers
// ---------------------------------------------------------------------------

import { ProjectEnvironment } from "./environment.interface.js";

/**
 * Strips index signatures from an object type, preserving only named keys.
 * Required because z.looseObject() adds [key: string]: unknown to the inferred
 * type — without stripping it, DotKeys<T> collapses to plain string.
 */
type StripIndex<T> = {
    [K in keyof T as string extends K ? never : K]: T[K];
};

/**
 * Recursively generates dot-separated key paths for all named properties of T.
 * NonNullable is applied at each recursion level so that optional parent objects
 * (e.g. server?: { port: number }) are traversed without collapsing to never.
 */
type DotKeys<T> = {
    [K in keyof StripIndex<T> & string]: NonNullable<StripIndex<T>[K]> extends Record<
        string,
        unknown
    >
    ? `${K}` | `${K}.${DotKeys<NonNullable<StripIndex<T>[K]>>}`
    : `${K}`;
}[keyof StripIndex<T> & string];

/**
 * Resolves the leaf value type for a given dot-notation path K within type T.
 *
 * NOTE: For paths where a parent is optional (e.g. server?: { port: number }),
 * the resolved type may include undefined even if the leaf field itself is
 * required. At runtime, Sig1 throws and Sig2 returns the supplied default.
 */
type DotValue<T, K extends string> = K extends `${infer Head}.${infer Tail}`
    ? Head extends keyof StripIndex<T>
    ? DotValue<NonNullable<StripIndex<T>[Head]>, Tail>
    : never
    : K extends keyof StripIndex<T>
    ? StripIndex<T>[K]
    : never;

/** Sentinel that distinguishes "no default argument" from "default is undefined". */
const MISSING = Symbol("MISSING");

interface IApplicationConfig<ConfigType extends Record<string, unknown>> {
    readonly environment: ProjectEnvironment;
    getConfig(): Readonly<ConfigType>;
    get<K extends DotKeys<ConfigType>>(key: K): DotValue<ConfigType, K>;

    get<K extends DotKeys<ConfigType>>(
        key: K,
        defaultValue: DotValue<ConfigType, K>,
    ): DotValue<ConfigType, K>;
}
export const APPLICATION_CONFIG = Symbol("APPLICATION_CONFIG");
export { IApplicationConfig, MISSING, DotKeys, DotValue };
