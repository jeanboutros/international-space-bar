/**
 * Council workflow state schema.
 *
 * Defines the data that flows through the council sub-graph.
 * Advisor and reviewer responses use {@link ReducedValue} with a concat reducer
 * so that parallel fan-out nodes can each append their result independently.
 */

import { ReducedValue, StateSchema } from "@langchain/langgraph";
import { z } from "zod";

/** Shape of a single advisor response collected during the advisor fan-out. */
export const AdvisorResponseSchema = z.object({
    advisorName: z.string(),
    response: z.string(),
});
export type AdvisorResponse = z.infer<typeof AdvisorResponseSchema>;

/** Shape of a single reviewer response collected during the peer-review fan-out. */
export const ReviewerResponseSchema = z.object({
    reviewerIndex: z.number(),
    review: z.string(),
});
export type ReviewerResponse = z.infer<typeof ReviewerResponseSchema>;

/** Mapping from anonymised letter (A–E) to advisor name, created per-run. */
export const AnonymisationEntrySchema = z.object({
    letter: z.string(),
    advisorName: z.string(),
});
export type AnonymisationEntry = z.infer<typeof AnonymisationEntrySchema>;

// ---------------------------------------------------------------------------
// Council sub-graph state
// ---------------------------------------------------------------------------

export const CouncilState = new StateSchema({
    /** The user's raw question exactly as received. */
    rawQuestion: z.string(),

    /** Enriched, neutral framing produced by the conductor's framing step. */
    framedQuestion: z.string().default(""),

    /** Parallel advisor responses — each Send appends one entry. */
    advisorResponses: new ReducedValue(
        z.array(AdvisorResponseSchema).default(() => []),
        { reducer: (a: AdvisorResponse[], b: AdvisorResponse[]) => a.concat(b) },
    ),

    /** Randomised anonymisation map for peer review. */
    anonymisationMap: z.array(AnonymisationEntrySchema).default(() => []),

    /** Parallel reviewer responses — each Send appends one entry. */
    reviewerResponses: new ReducedValue(
        z.array(ReviewerResponseSchema).default(() => []),
        { reducer: (a: ReviewerResponse[], b: ReviewerResponse[]) => a.concat(b) },
    ),

    /** Chairman's final synthesised verdict (markdown). */
    chairmanVerdict: z.string().default(""),

    /** Paths of the three generated report files. */
    reportPaths: z.array(z.string()).default(() => []),
});

// ---------------------------------------------------------------------------
// Worker states (for Send fan-out — each worker gets its own slice)
// ---------------------------------------------------------------------------

export const AdvisorWorkerState = new StateSchema({
    framedQuestion: z.string(),
    advisorName: z.string(),
    advisorDescription: z.string(),
    /** Worker writes its result here; the reducer on the parent merges it. */
    advisorResponses: new ReducedValue(
        z.array(AdvisorResponseSchema).default(() => []),
        { reducer: (a: AdvisorResponse[], b: AdvisorResponse[]) => a.concat(b) },
    ),
});

export const ReviewerWorkerState = new StateSchema({
    framedQuestion: z.string(),
    anonymisedResponses: z.string(),
    reviewerIndex: z.number(),
    /** Worker writes its result here; the reducer on the parent merges it. */
    reviewerResponses: new ReducedValue(
        z.array(ReviewerResponseSchema).default(() => []),
        { reducer: (a: ReviewerResponse[], b: ReviewerResponse[]) => a.concat(b) },
    ),
});
