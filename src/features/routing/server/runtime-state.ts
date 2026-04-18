import type { RoutingAuthorRecord, RoutingCandidatePoolRecord } from "./eligibility";

export type ServiceClientLike = {
  from(table: string): {
    select(query: string): any;
  };
};

export type ConcernRow = {
  id: string;
  source_type: "real" | "example";
  author_profile_id: string | null;
  body: string;
};

export type ProfileRow = {
  id: string;
  onboarding_completed: boolean;
  gender: string | null;
  is_active: boolean;
  is_blocked: boolean;
};

export type InterestRow = {
  profile_id: string;
  interest_key: string;
};

export type ConcernDeliveryRow = {
  id: string;
  recipient_profile_id: string;
};

export type ResponseRow = {
  delivery_id: string;
  body: string;
};

export type SameConcernResponseRow = Pick<ResponseRow, "delivery_id">;

export type ConcernHistoryRow = {
  author_profile_id: string | null;
  body: string;
};

export type RouteConcernState = {
  concern: {
    id: string;
    sourceType: "real" | "example";
    authorProfileId: string | null;
    body: string;
  } | null;
  author: RoutingAuthorRecord | null;
  existingDeliveryCount: number;
  candidatePool: RoutingCandidatePoolRecord[];
};

function groupStringsByProfileId(rows: Array<{ profileId: string; value: string }>) {
  const grouped = new Map<string, string[]>();

  for (const row of rows) {
    const values = grouped.get(row.profileId) ?? [];
    values.push(row.value);
    grouped.set(row.profileId, values);
  }

  return grouped;
}

export function buildRoutingCandidatePoolFromRows(input: {
  candidateProfiles: ProfileRow[];
  sameConcernDeliveries: ConcernDeliveryRow[];
  sameConcernResponses: SameConcernResponseRow[];
  interestsByProfileId: Map<string, string[]>;
  concernBodiesByProfileId: Map<string, string[]>;
  responseBodiesByProfileId: Map<string, string[]>;
}) {
  const assignedRecipientIds = new Set(input.sameConcernDeliveries.map((row) => row.recipient_profile_id));
  const deliveryIdToRecipientId = new Map(input.sameConcernDeliveries.map((row) => [row.id, row.recipient_profile_id]));
  const respondedRecipientIds = new Set(
    input.sameConcernResponses
      .map((row) => deliveryIdToRecipientId.get(row.delivery_id))
      .filter((profileId): profileId is string => typeof profileId === "string"),
  );

  return input.candidateProfiles.map((profile) => ({
    profileId: profile.id,
    onboardingCompleted: profile.onboarding_completed,
    gender: profile.gender,
    interests: input.interestsByProfileId.get(profile.id) ?? [],
    isActive: profile.is_active,
    isBlocked: profile.is_blocked,
    isConcernAuthor: false,
    alreadyAssigned: assignedRecipientIds.has(profile.id),
    alreadyResponded: respondedRecipientIds.has(profile.id),
    priorConcernBodies: input.concernBodiesByProfileId.get(profile.id) ?? [],
    priorResponseBodies: input.responseBodiesByProfileId.get(profile.id) ?? [],
  }));
}

async function selectProfileInterests(serviceClient: ServiceClientLike, profileIds: string[]) {
  if (profileIds.length === 0) {
    return new Map<string, string[]>();
  }

  const { data, error } = await serviceClient
    .from("profile_interests")
    .select("profile_id, interest_key")
    .in("profile_id", profileIds)
    .order("interest_key", {
      ascending: true,
    });

  if (error) {
    throw error;
  }

  return groupStringsByProfileId((data ?? []).map((row: InterestRow) => ({ profileId: row.profile_id, value: row.interest_key })));
}

async function selectCandidateConcernBodies(serviceClient: ServiceClientLike, candidateProfileIds: string[]) {
  if (candidateProfileIds.length === 0) {
    return new Map<string, string[]>();
  }

  const { data, error } = await serviceClient
    .from("concerns")
    .select("author_profile_id, body, created_at")
    .eq("source_type", "real")
    .in("author_profile_id", candidateProfileIds)
    .order("created_at", {
      ascending: true,
    });

  if (error) {
    throw error;
  }

  return groupStringsByProfileId(
    (data ?? [])
      .filter((row: ConcernHistoryRow) => typeof row.author_profile_id === "string")
      .map((row: ConcernHistoryRow & { author_profile_id: string }) => ({
        profileId: row.author_profile_id,
        value: row.body,
      })),
  );
}

async function selectCandidateResponseBodies(serviceClient: ServiceClientLike, candidateProfileIds: string[]) {
  if (candidateProfileIds.length === 0) {
    return new Map<string, string[]>();
  }

  const { data: deliveries, error: deliveriesError } = await serviceClient
    .from("concern_deliveries")
    .select("id, recipient_profile_id")
    .in("recipient_profile_id", candidateProfileIds);

  if (deliveriesError) {
    throw deliveriesError;
  }

  const deliveryRows = (deliveries ?? []) as ConcernDeliveryRow[];

  if (deliveryRows.length === 0) {
    return new Map<string, string[]>();
  }

  const deliveryIdToRecipientId = new Map(deliveryRows.map((row) => [row.id, row.recipient_profile_id]));
  const { data: responses, error: responsesError } = await serviceClient
    .from("responses")
    .select("delivery_id, body, created_at")
    .in(
      "delivery_id",
      deliveryRows.map((row) => row.id),
    )
    .order("created_at", {
      ascending: true,
    });

  if (responsesError) {
    throw responsesError;
  }

  return groupStringsByProfileId(
    (responses ?? []).flatMap((row: ResponseRow) => {
      const profileId = deliveryIdToRecipientId.get(row.delivery_id);

      return profileId
        ? [
            {
              profileId,
              value: row.body,
            },
          ]
        : [];
    }),
  );
}

async function selectSameConcernResponses(serviceClient: ServiceClientLike, deliveryIds: string[]) {
  if (deliveryIds.length === 0) {
    return [] as SameConcernResponseRow[];
  }

  const { data, error } = await serviceClient
    .from("responses")
    .select("delivery_id")
    .in("delivery_id", deliveryIds);

  if (error) {
    throw error;
  }

  return (data ?? []) as SameConcernResponseRow[];
}

export async function loadConcernRoutingState(serviceClient: ServiceClientLike, concernId: string): Promise<RouteConcernState | null> {
  const { data: concern, error: concernError } = await serviceClient
    .from("concerns")
    .select("id, source_type, author_profile_id, body")
    .eq("id", concernId)
    .maybeSingle();

  if (concernError) {
    throw concernError;
  }

  if (!concern) {
    return null;
  }

  const { data: currentDeliveries, error: currentDeliveriesError } = await serviceClient
    .from("concern_deliveries")
    .select("id, recipient_profile_id")
    .eq("concern_id", concernId);

  if (currentDeliveriesError) {
    throw currentDeliveriesError;
  }

  const sameConcernDeliveries = (currentDeliveries ?? []) as ConcernDeliveryRow[];
  const existingDeliveryCount = sameConcernDeliveries.length;
  const normalizedConcern = concern as ConcernRow;

  if (existingDeliveryCount > 0 || normalizedConcern.source_type !== "real" || !normalizedConcern.author_profile_id) {
    return {
      concern: {
        id: normalizedConcern.id,
        sourceType: normalizedConcern.source_type,
        authorProfileId: normalizedConcern.author_profile_id,
        body: normalizedConcern.body,
      },
      author: null,
      existingDeliveryCount,
      candidatePool: [],
    };
  }

  const { data: authorProfile, error: authorProfileError } = await serviceClient
    .from("profiles")
    .select("id, onboarding_completed, gender, is_active, is_blocked")
    .eq("id", normalizedConcern.author_profile_id)
    .maybeSingle();

  if (authorProfileError) {
    throw authorProfileError;
  }

  if (!authorProfile) {
    return {
      concern: {
        id: normalizedConcern.id,
        sourceType: normalizedConcern.source_type,
        authorProfileId: normalizedConcern.author_profile_id,
        body: normalizedConcern.body,
      },
      author: null,
      existingDeliveryCount,
      candidatePool: [],
    };
  }

  const { data: candidateProfiles, error: candidateProfilesError } = await serviceClient
    .from("profiles")
    .select("id, onboarding_completed, gender, is_active, is_blocked")
    .neq("id", normalizedConcern.author_profile_id);

  if (candidateProfilesError) {
    throw candidateProfilesError;
  }

  const normalizedCandidateProfiles = (candidateProfiles ?? []) as ProfileRow[];
  const candidateProfileIds = normalizedCandidateProfiles.map((profile) => profile.id);
  const sameConcernResponses = await selectSameConcernResponses(
    serviceClient,
    sameConcernDeliveries.map((row) => row.id),
  );
  const interestsByProfileId = await selectProfileInterests(serviceClient, [normalizedConcern.author_profile_id, ...candidateProfileIds]);
  const concernBodiesByProfileId = await selectCandidateConcernBodies(serviceClient, candidateProfileIds);
  const responseBodiesByProfileId = await selectCandidateResponseBodies(serviceClient, candidateProfileIds);

  return {
    concern: {
      id: normalizedConcern.id,
      sourceType: normalizedConcern.source_type,
      authorProfileId: normalizedConcern.author_profile_id,
      body: normalizedConcern.body,
    },
    author: {
      profileId: authorProfile.id,
      onboardingCompleted: authorProfile.onboarding_completed,
      gender: authorProfile.gender,
      interests: interestsByProfileId.get(authorProfile.id) ?? [],
      isActive: authorProfile.is_active,
      isBlocked: authorProfile.is_blocked,
    },
    existingDeliveryCount,
    candidatePool: buildRoutingCandidatePoolFromRows({
      candidateProfiles: normalizedCandidateProfiles,
      sameConcernDeliveries,
      sameConcernResponses,
      interestsByProfileId,
      concernBodiesByProfileId,
      responseBodiesByProfileId,
    }),
  };
}
