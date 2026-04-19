import { z } from "zod";

import { CANONICAL_GENDERS } from "../onboarding/constants.ts";

const GenderSchema = z.enum(CANONICAL_GENDERS);

export const RouteConcernRequestSchema = z
  .object({
    concernId: z.string().uuid(),
  })
  .strict();

export const RoutingAuthorSnapshotSchema = z
  .object({
    gender: GenderSchema,
    interests: z.array(z.string().min(1)).min(1),
    concern_body: z.string().min(1),
  })
  .strict();

export const RoutingCandidateSnapshotSchema = z
  .object({
    profile_id: z.string().uuid(),
    gender: GenderSchema,
    interests: z.array(z.string().min(1)).min(1),
    prior_concern_bodies: z.array(z.string().min(1)),
    prior_response_bodies: z.array(z.string().min(1)),
  })
  .strict();

export const OpenAiRoutingInputSchema = z
  .object({
    required_delivery_count: z.number().int().min(1).max(3),
    concern_author: RoutingAuthorSnapshotSchema,
    eligible_candidates: z.array(RoutingCandidateSnapshotSchema),
  })
  .strict();

export const OpenAiRoutingOutputSchema = z
  .object({
    responder_profile_ids: z.array(z.string().uuid()),
  })
  .strict();

export type RouteConcernRequest = z.infer<typeof RouteConcernRequestSchema>;
export type RoutingAuthorSnapshot = z.infer<typeof RoutingAuthorSnapshotSchema>;
export type RoutingCandidateSnapshot = z.infer<typeof RoutingCandidateSnapshotSchema>;
export type OpenAiRoutingInput = z.infer<typeof OpenAiRoutingInputSchema>;
export type OpenAiRoutingOutput = z.infer<typeof OpenAiRoutingOutputSchema>;

export type RouteConcernFailureCode =
  | "concern_not_found"
  | "concern_not_real"
  | "concern_author_not_routable"
  | "routing_invariant_allowable_pool_too_small"
  | "routing_unavailable"
  | "routing_model_refused"
  | "routing_output_missing"
  | "routing_output_invalid"
  | "delivery_creation_failed";
